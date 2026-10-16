// #/send/<creator>/<inboxId>: what a source sees. Resolve the inbox by its on-chain creator, seal, send.
import { bytesToHex, type EIP1193Provider } from 'viem'
import { DEFAULT_TIP_DAYS, DEMO_SENDER_ADDRESS, INBOX_LIFETIME_DAYS, TIP_LIFETIME_CHOICES, addressUrl, entityUrl, ownerUrl, txUrl } from '../config'
import { blockToUnix, formatDuration, formatUtc, inboxPublicKey, secondsLeft, type InboxRef } from '../codec'
import { MAX_MESSAGE_BYTES, bucketFor, fitsInTip, sealText, textBytes } from '../crypto'
import { explainError, findInbox, getTiming, injectedSigner, isOutOfFunds, localSigner, sendTip, sweepTips, type InboxView, type Signer } from '../arkiv'
import { getReader, rpcUrl } from '../app'
import { DEMO_SENDER_KEY } from '../env'
import { bar, chip, h, hex, kib, link, queriesPanel, setFill, short, statusLine } from '../ui/dom'
import { rpcSettings } from '../ui/settings'

const wallet = () => (window as unknown as { ethereum?: EIP1193Provider }).ethereum

export async function renderSend(root: HTMLElement, ref: InboxRef) {
  document.title = 'Send a tip: Sealdrop'
  const reader = getReader()
  const status = statusLine()
  const queries = queriesPanel()
  root.append(h('h1', null, 'Send a tip'), status.el)
  status.info('Looking up the inbox on Arkiv...')

  let inbox: InboxView | null
  let timing
  try {
    const found = await findInbox(reader, ref)
    queries.add('Inbox lookup', found.query)
    inbox = found.inbox
    timing = await getTiming(reader)
  } catch (e) {
    status.error(explainError(e))
    root.append(rpcSettings())
    return
  }
  if (!inbox) {
    status.error('There is no live inbox with this id created by this address. The link may be wrong, or the newsroom stopped renewing it and it expired. Only trust links you got from the newsroom itself.')
    root.append(queries.el)
    return
  }
  status.clear()
  const live = inbox
  const left = secondsLeft(live.expiresAt, timing)

  const sameOwner = live.owner.toLowerCase() === live.creator.toLowerCase()
  root.append(
    h('section', { class: 'inbox', 'data-testid': 'inbox' },
      h('div', { class: 'inbox-head' }, h('h2', null, live.payload.name), chip('ok', 'Creator verified ✓')),
      h('p', { class: 'desc' }, live.payload.description || 'No description.'),
      h('dl', { class: 'facts' },
        h('dt', null, 'Created by ($creator)'), h('dd', null, hex(live.creator, { href: addressUrl(live.creator), label: 'creator address', full: true }), h('span', { class: 'hint' }, '(matches the link you opened)')),
        h('dt', null, 'Owned by ($owner)'), h('dd', null, hex(live.owner, { href: addressUrl(live.owner), label: 'owner address' }), sameOwner ? ' ' : null, sameOwner ? chip('ok', 'Owner is the creator ✓') : h('strong', { class: 'warn-text' }, 'WARNING: the owner is not the creator. Be careful.')),
        h('dt', null, 'Inbox is alive for'), h('dd', null, `${formatDuration(left)} (until ${formatUtc(blockToUnix(live.expiresAt, timing))}); the newsroom renews it while its console is open`, bar(left / (INBOX_LIFETIME_DAYS * 86400), 'wide')),
        h('dt', null, 'Inbox entity'), h('dd', null, hex(live.key, { href: entityUrl(live.key), label: 'inbox entity key' })),
      ),
      left < 86400 ? h('p', { class: 'status error', role: 'alert' }, 'This inbox expires within a day. If nobody renews it, your tip will reach no one.') : null,
    ),
  )

  // ---- compose -------------------------------------------------------------------------------------
  const textarea = h('textarea', { id: 'msg', rows: 8, dir: 'auto', 'data-testid': 'message', placeholder: 'Write a made-up test message. Nothing real, please: this is a testnet demo.' })
  const max = MAX_MESSAGE_BYTES.toLocaleString('en-US')
  const counter = h('span', { 'data-testid': 'counter' }, `0 / ${max} bytes`)
  const bucketChip = h('span')
  const meterBar = bar(0, 'wide')
  const showBucket = () => {
    const n = textBytes(textarea.value)
    const bucket = bucketFor(n)
    counter.textContent = `${n.toLocaleString('en-US')} / ${max} bytes`
    bucketChip.replaceChildren(bucket === undefined ? chip('warn', 'Too long') : chip('neutral', `Padded to ${kib(bucket)}`))
    setFill(meterBar, bucket === undefined ? 1 : (n + 4) / bucket)
  }
  textarea.addEventListener('input', showBucket)
  showBucket()
  const daysName = 'days'
  const lifetime = h('div', { class: 'choices', role: 'radiogroup', 'aria-labelledby': 'days-label', 'data-testid': 'days' },
    ...TIP_LIFETIME_CHOICES.map((d) => h('label', { class: 'choice' }, h('input', { type: 'radio', name: daysName, value: d, checked: d === DEFAULT_TIP_DAYS }), d === 1 ? '1 day' : `${d} days`)))
  const hasWallet = Boolean(wallet())
  const demoRadio = h('input', { type: 'radio', name: 'mode', id: 'mode-demo', value: 'demo', checked: Boolean(DEMO_SENDER_KEY), disabled: !DEMO_SENDER_KEY, 'data-testid': 'mode-demo' })
  const walletRadio = h('input', { type: 'radio', name: 'mode', id: 'mode-wallet', value: 'wallet', checked: !DEMO_SENDER_KEY, disabled: !hasWallet, 'data-testid': 'mode-wallet' })
  const sendBtn = h('button', { type: 'submit', class: 'big', 'data-testid': 'send' }, 'Seal and send')
  const progress = statusLine('progress')

  const form = h('form', { class: 'compose' },
    h('div', null,
      h('label', { for: 'msg' }, 'Your message'),
      textarea,
    ),
    h('div', { class: 'meter' },
      h('div', { class: 'meter-row' }, counter, bucketChip),
      meterBar,
      h('p', { class: 'hint' }, 'Padded to 1, 4, 16 or 64 KiB before sealing, so the length reveals little.'),
    ),
    h('div', null,
      h('span', { class: 'field-label', id: 'days-label' }, 'Delete it after'),
      lifetime,
      h('p', { class: 'hint' }, 'You choose the Entity Expiration. The newsroom can burn it earlier or keep it longer.'),
    ),
    h('fieldset', null,
      h('legend', null, 'Send with'),
      h('div', null, demoRadio, h('label', { for: 'mode-demo' }, 'Shared demo key (no wallet needed). '), h('span', { class: 'hint' }, DEMO_SENDER_KEY ? 'Everyone in demo mode shares one public testnet address, so it cannot identify you. Anyone can lift that key out of this page, so it exists for the demo only; production would use a relayer or paymaster.' : 'This build has no demo key.')),
      h('div', null, walletRadio, h('label', { for: 'mode-wallet' }, 'My wallet. '), h('span', { class: 'hint' }, hasWallet ? 'You pay the gas, and your address becomes public as $creator of the tip.' : 'No browser wallet found.')),
    ),
    h('p', { class: 'hint' }, 'The RPC node can see your IP address, though it cannot read the message. Use Tor Browser if that matters.'),
    h('div', { class: 'send-row' }, sendBtn, progress.el),
  )
  root.append(form)

  const result = h('section', { class: 'result', 'data-testid': 'send-result', hidden: true })
  root.append(result)

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    const text = textarea.value
    if (!text.trim()) return progress.error('Write a message first.')
    if (!fitsInTip(text)) return progress.error(`The message is too long (limit ${MAX_MESSAGE_BYTES} bytes).`)
    const mode = demoRadio.checked ? 'demo' : 'wallet'
    const days = Number(form.querySelector<HTMLInputElement>(`input[name=${daysName}]:checked`)?.value ?? DEFAULT_TIP_DAYS) as (typeof TIP_LIFETIME_CHOICES)[number]
    sendBtn.disabled = true
    try {
      progress.busy('Sealing the message in your browser...')
      const sealed = sealText(text, inboxPublicKey(live.payload))
      let signer: Signer
      if (mode === 'demo') {
        if (!DEMO_SENDER_KEY) throw new Error('This build has no demo key; send with your wallet.')
        signer = localSigner(DEMO_SENDER_KEY, rpcUrl())
      } else {
        const provider = wallet()
        if (!provider) throw new Error('No browser wallet found.')
        progress.busy('Waiting for your wallet...')
        signer = await injectedSigner(provider)
      }
      progress.busy('Writing to Arkiv: create the tip and hand it to the newsroom in one batch (about 5 s)...')
      const sent = await sendTip(reader, signer, live, sealed, days)
      const t = await getTiming(reader)
      const expiry = sent.expiresAt !== undefined ? `${formatUtc(blockToUnix(sent.expiresAt, t))} (${formatDuration(secondsLeft(sent.expiresAt, t))} from now)` : `in about ${days} days`
      progress.clear()
      form.hidden = true
      result.hidden = false
      result.replaceChildren(
        h('div', { class: 'result-head' },
          h('h2', null, 'Sealed and sent ✓'),
          h('button', { type: 'button', class: 'secondary', onclick: () => { textarea.value = ''; showBucket(); result.hidden = true; form.hidden = false; sendBtn.disabled = false; textarea.focus() } }, 'Send another'),
        ),
        h('p', null, 'Your message was sealed in this browser and handed to the inbox owner. Only the newsroom\'s decryption key opens it.'),
        h('dl', { class: 'facts receipt' },
          h('dt', null, 'Tip entity'), h('dd', null, hex(sent.entityKey, { href: entityUrl(sent.entityKey), label: 'tip entity key' })),
          h('dt', null, 'Transaction'), h('dd', null, hex(sent.txHash, { href: txUrl(sent.txHash), label: 'transaction hash' })),
          h('dt', null, 'Expires'), h('dd', null, expiry, sent.expiresAt !== undefined ? bar(secondsLeft(sent.expiresAt, t) / (days * 86400), 'wide') : null),
        ),
        h('details', { class: 'stores' },
          h('summary', null, 'What Arkiv stores'),
          h('p', { class: 'hint' }, 'This is everything Arkiv stores about it:'),
          h('dl', { class: 'facts' },
            h('dt', null, '$creator'), h('dd', null, hex(signer.address, { href: addressUrl(signer.address), label: 'creator address' }), signer.address.toLowerCase() === DEMO_SENDER_ADDRESS.toLowerCase() ? ' (the shared demo sender)' : ' (your wallet)'),
            h('dt', null, '$owner'), h('dd', null, hex(live.owner, { href: ownerUrl(live.owner), label: 'owner address' }), ' (the newsroom, after the hand-over)'),
            h('dt', null, 'Attributes'), h('dd', null, `type=tip, app=sealdrop-v1, inbox=${short(live.key)}`),
            h('dt', null, 'Payload'), h('dd', null, `${kib(sealed.length)} of ciphertext, starting ${bytesToHex(sealed.slice(0, 12))}...`),
          ),
        ),
      )
    } catch (e) {
      progress.error(mode === 'demo' && isOutOfFunds(e)
        ? 'The shared demo key has run out of testnet GLM, so demo mode cannot send right now. Try again later, or send with your own wallet (testnet faucet: hub.arkiv.network/faucet).'
        : explainError(e))
      sendBtn.disabled = false
    }
  })

  // ---- what anyone can see ---------------------------------------------------------------------
  const world = h('ul', { class: 'world' })
  const worldPanel = h('details', { class: 'world-panel' }, h('summary', null, 'What can anyone see on Arkiv for this inbox?'), h('p', { class: 'hint' }, 'The newest tips as any visitor of the Data Explorer or any RPC client sees them. No names, no text.'), world)
  let loaded = false
  worldPanel.addEventListener('toggle', async () => {
    if (!worldPanel.open || loaded) return
    loaded = true
    world.replaceChildren(h('li', null, 'Loading...'))
    try {
      const swept = await sweepTips(reader, live.key, { maxPages: 1, pageSize: 5 })
      queries.add('Public view', swept.query)
      world.replaceChildren(...(swept.tips.length === 0 ? [h('li', null, 'No tips yet.')] : swept.tips.map((t) => h('li', null,
        link(entityUrl(t.key), short(t.key)), ` . ${kib(t.sealed.length)} . $creator ${short(t.creator)} . payload ${bytesToHex(t.sealed.slice(0, 10))}... . type=tip, inbox=${short(live.key)}`))),
        h('li', null, link(ownerUrl(live.owner), 'Everything this owner holds, in the Data Explorer')))
    } catch (e) {
      loaded = false
      world.replaceChildren(h('li', { class: 'status error', role: 'alert' }, explainError(e)))
    }
  })
  root.append(worldPanel, queries.el, rpcSettings())
}
