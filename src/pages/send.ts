// #/send/<creator>/<inboxId>: what a source sees. Resolve the inbox by its on-chain creator, seal, send.
import { bytesToHex, type EIP1193Provider } from 'viem'
import { DEFAULT_TIP_DAYS, DEMO_SENDER_ADDRESS, TIP_LIFETIME_CHOICES, addressUrl, entityUrl, ownerUrl, txUrl } from '../config'
import { blockToUnix, formatDuration, formatUtc, inboxPublicKey, secondsLeft, type InboxRef } from '../codec'
import { MAX_MESSAGE_BYTES, fitsInTip, sealText, textBytes } from '../crypto'
import { explainError, findInbox, getTiming, injectedSigner, isOutOfFunds, localSigner, sendTip, sweepTips, type InboxView, type Signer } from '../arkiv'
import { getReader, rpcUrl } from '../app'
import { DEMO_SENDER_KEY } from '../env'
import { h, kib, link, queriesPanel, short, statusLine } from '../ui/dom'
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

  root.append(
    h('section', { class: 'inbox', 'data-testid': 'inbox' },
      h('h2', null, live.payload.name),
      h('p', { class: 'desc' }, live.payload.description || 'No description.'),
      h('dl', null,
        h('dt', null, 'Created by ($creator)'), h('dd', null, link(addressUrl(live.creator), live.creator), ' (matches the link you opened)'),
        h('dt', null, 'Owned by ($owner)'), h('dd', null, link(addressUrl(live.owner), live.owner), live.owner.toLowerCase() !== live.creator.toLowerCase() ? ' WARNING: the owner is not the creator. Be careful.' : ''),
        h('dt', null, 'Inbox is alive for'), h('dd', null, `${formatDuration(left)} (until ${formatUtc(blockToUnix(live.expiresAt, timing))}); the newsroom renews it while its console is open`),
        h('dt', null, 'Inbox entity'), h('dd', null, link(entityUrl(live.key), live.key)),
      ),
      left < 86400 ? h('p', { class: 'status error', role: 'alert' }, 'This inbox expires within a day. If nobody renews it, your tip will reach no one.') : null,
    ),
  )

  // ---- compose -------------------------------------------------------------------------------------
  const textarea = h('textarea', { id: 'msg', rows: 8, dir: 'auto', 'data-testid': 'message', placeholder: 'Write a made-up test message. Nothing real, please: this is a testnet demo.' })
  const counter = h('span', { 'data-testid': 'counter' }, `0 / ${MAX_MESSAGE_BYTES.toLocaleString('en-US')} bytes`)
  textarea.addEventListener('input', () => (counter.textContent = `${textBytes(textarea.value).toLocaleString('en-US')} / ${MAX_MESSAGE_BYTES.toLocaleString('en-US')} bytes`))
  const days = h('select', { id: 'days', 'data-testid': 'days' }, ...TIP_LIFETIME_CHOICES.map((d) => h('option', { value: d, selected: d === DEFAULT_TIP_DAYS }, d === 1 ? '1 day' : `${d} days`)))
  const hasWallet = Boolean(wallet())
  const demoRadio = h('input', { type: 'radio', name: 'mode', id: 'mode-demo', value: 'demo', checked: Boolean(DEMO_SENDER_KEY), disabled: !DEMO_SENDER_KEY, 'data-testid': 'mode-demo' })
  const walletRadio = h('input', { type: 'radio', name: 'mode', id: 'mode-wallet', value: 'wallet', checked: !DEMO_SENDER_KEY, disabled: !hasWallet, 'data-testid': 'mode-wallet' })
  const sendBtn = h('button', { type: 'submit', 'data-testid': 'send' }, 'Seal and send')
  const progress = statusLine('progress')

  const form = h('form', { class: 'compose' },
    h('label', { for: 'msg' }, 'Your message'),
    textarea,
    h('p', { class: 'hint' }, counter, ' . Padded to 1, 4, 16 or 64 KiB before sealing, so the length reveals little.'),
    h('div', { class: 'row' },
      h('label', { for: 'days' }, 'Delete it after'),
      days,
      h('span', { class: 'hint' }, 'You choose the Entity Expiration. The newsroom can burn it earlier or keep it longer.'),
    ),
    h('fieldset', null,
      h('legend', null, 'Send with'),
      h('div', null, demoRadio, h('label', { for: 'mode-demo' }, ' Shared demo key (no wallet needed). '), h('span', { class: 'hint' }, DEMO_SENDER_KEY ? 'Everyone in demo mode shares one public testnet address, so it cannot identify you. Anyone can lift that key out of this page, so it exists for the demo only; production would use a relayer or paymaster.' : 'This build has no demo key.')),
      h('div', null, walletRadio, h('label', { for: 'mode-wallet' }, ' My wallet. '), h('span', { class: 'hint' }, hasWallet ? 'You pay the gas, and your address becomes public as $creator of the tip.' : 'No browser wallet found.')),
    ),
    h('p', { class: 'hint' }, 'The RPC node can see your IP address, though it cannot read the message. Use Tor Browser if that matters.'),
    sendBtn,
    progress.el,
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
    const lifetime = Number(days.value) as (typeof TIP_LIFETIME_CHOICES)[number]
    sendBtn.disabled = true
    try {
      progress.info('Sealing the message in your browser...')
      const sealed = sealText(text, inboxPublicKey(live.payload))
      let signer: Signer
      if (mode === 'demo') {
        if (!DEMO_SENDER_KEY) throw new Error('This build has no demo key; send with your wallet.')
        signer = localSigner(DEMO_SENDER_KEY, rpcUrl())
      } else {
        const provider = wallet()
        if (!provider) throw new Error('No browser wallet found.')
        progress.info('Waiting for your wallet...')
        signer = await injectedSigner(provider)
      }
      progress.info('Writing to Arkiv: create the tip and hand it to the newsroom in one batch (about 5 s)...')
      const sent = await sendTip(reader, signer, live, sealed, lifetime)
      const t = await getTiming(reader)
      progress.info('Sent.')
      result.hidden = false
      result.replaceChildren(
        h('h2', null, 'Sent'),
        h('p', null, 'Your message was sealed in this browser and handed to the inbox owner. Only the newsroom\'s decryption key opens it. This is everything Arkiv stores about it:'),
        h('dl', null,
          h('dt', null, 'Tip entity'), h('dd', null, link(entityUrl(sent.entityKey), sent.entityKey)),
          h('dt', null, 'Transaction'), h('dd', null, link(txUrl(sent.txHash), sent.txHash)),
          h('dt', null, '$creator'), h('dd', null, link(addressUrl(signer.address), signer.address), signer.address.toLowerCase() === DEMO_SENDER_ADDRESS.toLowerCase() ? ' (the shared demo sender)' : ' (your wallet)'),
          h('dt', null, '$owner'), h('dd', null, link(ownerUrl(live.owner), live.owner), ' (the newsroom, after the hand-over)'),
          h('dt', null, 'Attributes'), h('dd', null, `type=tip, app=sealdrop-v1, inbox=${short(live.key)}`),
          h('dt', null, 'Payload'), h('dd', null, `${kib(sealed.length)} of ciphertext, starting ${bytesToHex(sealed.slice(0, 12))}...`),
          h('dt', null, 'Expires'), h('dd', null, sent.expiresAt !== undefined ? `${formatUtc(blockToUnix(sent.expiresAt, t))} (${formatDuration(secondsLeft(sent.expiresAt, t))} from now)` : `in about ${lifetime} days`),
        ),
        h('button', { type: 'button', class: 'secondary', onclick: () => { textarea.value = ''; textarea.dispatchEvent(new Event('input')); result.hidden = true; progress.clear(); sendBtn.disabled = false; textarea.focus() } }, 'Send another'),
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
