// #/newsroom: create a throwaway newsroom (or use a wallet), open an inbox, receive and decrypt tips.
import { formatEther, parseEther, type EIP1193Provider } from 'viem'
import { DEMO_SENDER_ADDRESS, FAUCET_URL, INBOX_LIFETIME_DAYS, PIN_DAYS, RENEW_BELOW_DAYS, addressUrl, entityUrl, ownerUrl } from '../config'
import { INBOX_LIMITS, blockToUnix, formatDuration, formatSendHash, formatUtc, type Timing } from '../codec'
import { SEAL_OVERHEAD, boxKeyPairFromSecret, fromB64, openText } from '../crypto'
import {
  balanceOf, burnTip, createInbox, explainError, findInbox, fundAccount, getTip, getTiming, inboxesDueForRenewal, injectedSigner, isOutOfFunds,
  localSigner, pinTip, renewInbox, sweepTips, tipsSince, watchHandovers, type InboxView, type Signer, type TipView,
} from '../arkiv'
import { getReader, rpcUrl } from '../app'
import { DEMO_SENDER_KEY } from '../env'
import {
  downloadIdentity, forgetIdentity, getLastSeen, loadIdentity, newLocalIdentity, newWalletIdentity, parseIdentity,
  saveIdentity, setLastSeen, type Identity,
} from '../store'
import { bar, chip, copyButton, h, hex, kib, link, mark, onLeave, queriesPanel, runCleanups, statusLine } from '../ui/dom'
import { rpcSettings } from '../ui/settings'

/** About 16 writes. Below this a throwaway newsroom is topped up from the shared demo sender. */
const MIN_BALANCE = parseEther('0.002')
const wallet = () => (window as unknown as { ethereum?: EIP1193Provider }).ethereum

export function renderNewsroom(root: HTMLElement) {
  document.title = 'Newsroom console: Sealdrop'
  const identity = loadIdentity()
  const again = () => { runCleanups(); root.replaceChildren(); renderNewsroom(root) }
  if (identity) void renderConsole(root, identity, again)
  else renderOnboarding(root, again)
}

// ---- no newsroom in this browser yet --------------------------------------------------------------------

function renderOnboarding(root: HTMLElement, again: () => void) {
  const status = statusLine()
  const file = h('input', { type: 'file', id: 'import', accept: 'application/json,.json' })
  file.addEventListener('change', async () => {
    try {
      const f = file.files?.[0]
      if (!f) return
      saveIdentity(parseIdentity(await f.text()))
      again()
    } catch (e) {
      status.error(e instanceof Error ? e.message : 'Could not read that file.')
    }
  })
  const useWallet = async () => {
    try {
      const provider = wallet()
      if (!provider) throw new Error('No browser wallet found.')
      status.info('Waiting for your wallet...')
      const signer = await injectedSigner(provider)
      saveIdentity(newWalletIdentity(signer.address))
      again()
    } catch (e) {
      status.error(explainError(e))
    }
  }
  root.append(
    h('h1', null, 'Open a newsroom'),
    h('p', { class: 'lead' }, 'A newsroom is two keys that live in this browser: one signs on Arkiv, one opens the tips. Nothing is registered anywhere and nobody can reset them for you.'),
    status.el,
    h('section', { class: 'cards', 'aria-label': 'Ways to open a newsroom' },
      h('div', { class: 'card' },
        h('h2', null, 'Throwaway newsroom'),
        h('p', null, 'The fastest way. The keys are generated here, and a few cents of testnet GLM come from the shared demo sender.'),
        h('button', { type: 'button', 'data-testid': 'create-newsroom', onclick: () => { saveIdentity(newLocalIdentity()); again() } }, 'Create a throwaway newsroom'),
      ),
      h('div', { class: 'card' },
        h('h2', null, 'My wallet'),
        h('p', null, 'Sign with an injected wallet on Arkiv Tiramisu. Your wallet address becomes the public $creator of the inbox.'),
        h('button', { type: 'button', class: 'secondary', 'data-testid': 'use-wallet', disabled: !wallet(), onclick: useWallet }, wallet() ? 'Use my wallet' : 'No wallet found'),
      ),
      h('div', { class: 'card' },
        h('h2', null, 'Saved newsroom'),
        h('p', null, 'Import the key file you exported earlier.'),
        h('label', { for: 'import' }, 'Key file'),
        file,
      ),
    ),
    h('p', { class: 'hint' }, 'The keys are stored in this browser\'s local storage and nowhere else. Export the key file once the inbox exists: if you clear the browser data, or close Tor Browser, the keys are gone and so is the access to every tip. The key file holds secrets, keep it private.'),
  )
}

// ---- the console -----------------------------------------------------------------------------------------

async function renderConsole(root: HTMLElement, identity: Identity, again: () => void) {
  const reader = getReader()
  const box = boxKeyPairFromSecret(fromB64(identity.boxSecretKey))
  const me = identity.address.toLowerCase()
  const status = statusLine()
  const queries = queriesPanel()
  const tips = new Map<string, { tip: TipView; source: 'live' | 'sweep' }>()
  let timing: Timing | undefined
  let inbox: InboxView | undefined
  let listening = false

  const balanceEl = h('span', { 'data-testid': 'balance' }, 'checking...')
  const body = h('div')
  const liveStatus = h('p', { class: 'live', 'data-testid': 'live-status', role: 'status' })
  // The chip carries the state word; the hidden separator keeps the sentence whole for screen readers ("Live: listening ...").
  const setLive = (kind: 'live' | 'neutral', word: string, sep: string, note: string) =>
    liveStatus.replaceChildren(chip(kind, kind === 'neutral' ? h('span', { class: 'dot', 'aria-hidden': 'true' }) : null, word), h('span', { class: 'vh' }, sep), h('span', { class: 'live-note' }, note))
  setLive('neutral', 'Live updates', ' ', 'start once the inbox exists.')
  const refreshBtn = h('button', { type: 'button', class: 'secondary', 'data-testid': 'refresh' }, 'Refresh (full sweep)')
  const tipList = h('ul', { class: 'tips', 'data-testid': 'tips' })
  const emptyEl = h('div', { class: 'empty', 'data-testid': 'no-tips' }, mark(), h('strong', null, 'Waiting for tips.'), h('p', null, 'Share your inbox link. To try it yourself, open it in another tab and send one.'))

  // ---- signing --------------------------------------------------------------------------------------------
  let local: Signer | undefined
  async function getSigner(): Promise<Signer> {
    if (identity.kind === 'local') {
      if (!identity.evmPrivateKey) throw new Error('The key file has no wallet key.')
      return (local ??= localSigner(identity.evmPrivateKey, rpcUrl()))
    }
    const provider = wallet()
    if (!provider) throw new Error('No browser wallet found. Open this page in a browser with your wallet.')
    const signer = await injectedSigner(provider)
    if (signer.address.toLowerCase() !== me) throw new Error(`Switch your wallet to ${identity.address}: this newsroom was created with that account.`)
    return signer
  }

  async function refreshBalance(): Promise<bigint | null> {
    try {
      const wei = await balanceOf(reader, identity.address)
      balanceEl.textContent = `${Number(formatEther(wei)).toFixed(4)} GLM`
      return wei
    } catch {
      balanceEl.textContent = 'unknown'
      return null
    }
  }

  /** Throwaway newsrooms are topped up from the shared demo sender; wallets use the faucet. */
  async function ensureFunds() {
    const wei = await refreshBalance()
    if (wei !== null && wei >= MIN_BALANCE) return
    if (identity.kind !== 'local') throw new Error(`This wallet has too little testnet GLM. Get some at ${FAUCET_URL} and try again.`)
    if (!DEMO_SENDER_KEY) throw new Error(`This build has no demo sender key. Send testnet GLM to ${identity.address} from the faucet at ${FAUCET_URL}, then try again.`)
    status.info('Funding this throwaway address with a few cents of testnet GLM from the shared demo sender...')
    try {
      await fundAccount(localSigner(DEMO_SENDER_KEY, rpcUrl()), identity.address)
    } catch (e) {
      if (isOutOfFunds(e)) throw new Error(`The shared demo sender has run out of testnet GLM, so it cannot fund this throwaway newsroom right now. Send testnet GLM to ${identity.address} from the faucet at ${FAUCET_URL}, then try again.`)
      throw e
    }
    await refreshBalance()
  }

  // ---- tips -------------------------------------------------------------------------------------------------
  const untilSeconds = (block: bigint) => (timing ? blockToUnix(block, timing) - Date.now() / 1000 : 0)

  function tipRow(tip: TipView, source: 'live' | 'sweep') {
    const text = openText(tip.sealed, box)
    const mine = tip.owner.toLowerCase() === me
    const viaDemo = tip.creator.toLowerCase() === DEMO_SENDER_ADDRESS.toLowerCase()
    const left = untilSeconds(tip.expiresAt)
    const total = timing ? blockToUnix(tip.expiresAt, timing) - blockToUnix(tip.createdAt, timing) : 0
    const bucket = tip.sealed.length - SEAL_OVERHEAD
    const sized = [1024, 4096, 16384, 65536].includes(bucket) ? `${kib(tip.sealed.length)} sealed (${bucket / 1024} KiB bucket)` : `${kib(tip.sealed.length)} sealed`
    return h('li', { class: 'tip', 'data-testid': 'tip', 'data-source': source, 'data-key': tip.key },
      h('div', { class: 'meta' },
        h('strong', null, timing ? formatUtc(blockToUnix(tip.createdAt, timing)) : `block ${tip.createdAt}`),
        chip('neutral', sized),
        chip(left < 86400 ? 'warn' : 'neutral', `Expires in ${formatDuration(left)}`, total > 0 ? ' ' : null, total > 0 ? bar(left / total) : null),
        h('span', { class: 'badge' }, mine ? 'owned by you' : 'sender still owns it'),
      ),
      text === null
        ? h('p', { class: 'undecryptable', 'data-testid': 'tip-text' }, 'This entity could not be decrypted with your key. It is not a tip sealed for this inbox.')
        : h('p', { class: 'tip-text', dir: 'auto', 'data-testid': 'tip-text' }, text),
      h('p', { class: 'hint' },
        '$creator ', hex(tip.creator, { href: addressUrl(tip.creator), label: 'creator address' }),
        viaDemo ? ' (the shared demo sender: it says nothing about who wrote this)' : ' (a wallet address, public)',
        link(entityUrl(tip.key), 'entity on Data Explorer'),
      ),
      mine ? h('div', { class: 'actions' },
        h('button', { type: 'button', class: 'secondary', onclick: () => pin(tip) }, `Keep ${PIN_DAYS} more days`),
        h('button', { type: 'button', class: 'danger', onclick: () => burn(tip) }, 'Burn now'),
      ) : null,
    )
  }

  function renderTips() {
    const rows = [...tips.values()].sort((a, b) => Number(b.tip.createdAt - a.tip.createdAt))
    tipList.replaceChildren(...rows.map((r) => tipRow(r.tip, r.source)))
    emptyEl.hidden = rows.length > 0
  }

  function addTips(list: TipView[], source: 'live' | 'sweep') {
    for (const tip of list) tips.set(tip.key, { tip, source: tips.get(tip.key)?.source ?? source })
    renderTips()
  }

  async function burn(tip: TipView) {
    if (!confirm('Burn this tip? Arkiv deletes the entity. The ciphertext stays in chain history, which is why it is sealed.')) return
    try {
      status.info('Burning the tip...')
      await burnTip(await getSigner(), tip.key)
      tips.delete(tip.key)
      renderTips()
      status.info('Burned.')
    } catch (e) {
      status.error(explainError(e))
    }
  }

  async function pin(tip: TipView) {
    try {
      status.info(`Extending the tip's lifetime to ${PIN_DAYS} days from now...`)
      await pinTip(await getSigner(), tip.key, PIN_DAYS)
      const fresh = inbox ? await getTip(reader, tip.key, [inbox.key]) : null
      if (fresh) addTips([fresh], 'sweep')
      status.info(`Kept: this tip now expires ${PIN_DAYS} days from now.`)
    } catch (e) {
      status.error(explainError(e))
    }
  }

  // ---- reading the inbox --------------------------------------------------------------------------------
  async function fullSweep(live: InboxView) {
    refreshBtn.disabled = true
    try {
      const t = await getTiming(reader)
      const swept = await sweepTips(reader, live.key, { owner: identity.address })
      queries.add('Tips handed to me', swept.query)
      timing = t
      addTips(swept.tips, 'sweep')
      setLastSeen(live.key, t.head)
      status.info(swept.tips.length ? `${swept.tips.length} tip${swept.tips.length === 1 ? '' : 's'} on Arkiv${swept.truncated ? ' (showing the first pages only)' : ''}.` : 'No tips yet.')
    } catch (e) {
      status.error(explainError(e))
    } finally {
      refreshBtn.disabled = false
    }
  }

  function listen(live: InboxView) {
    if (listening) return
    listening = true
    // Tips created since the last sweep, read in one query. Used after a long sleep and after a reconnect, because events are not replayed.
    const catchUp = async () => {
      try {
        const t = await getTiming(reader)
        const since = (getLastSeen(live.key) ?? t.head) - 2n
        const r = await tipsSince(reader, live.key, since < 0n ? 0n : since, { owner: identity.address })
        queries.add('Tips since my last visit', r.query)
        timing = t
        addTips(r.tips, 'sweep')
        setLastSeen(live.key, t.head)
      } catch (e) {
        status.error(explainError(e))
      }
    }
    const stop = watchHandovers(reader, identity.address, {
      onHandover: async (entityKey) => {
        try {
          const tip = await getTip(reader, entityKey, [live.key])
          if (!tip) return
          addTips([tip], 'live')
          status.info('A new tip just arrived.')
        } catch (e) {
          status.error(explainError(e))
        }
      },
      onState: (state) => {
        if (state === 'live') setLive('live', 'Live', ': ', 'listening for new tips on a WebSocket. This page does not poll.')
        else setLive('neutral', 'Reconnecting', ': ', 'the live connection dropped and is being retried. Tips already on Arkiv are safe; Refresh reads the inbox now.')
      },
      onReconnect: catchUp,
      onError: (e) => status.error(`A live update could not be shown (${e.message}). Use Refresh to read the inbox.`),
    })
    onLeave(stop)
    setLive('neutral', 'Connecting', ' ', 'to the live feed...')

    // A tab that slept may have missed events; ask only for tips created since the last sweep.
    let hiddenAt = 0
    const onVisibility = () => {
      if (document.hidden) { hiddenAt = Date.now(); return }
      if (!hiddenAt || Date.now() - hiddenAt < 30_000) return
      hiddenAt = 0
      void catchUp()
    }
    document.addEventListener('visibilitychange', onVisibility)
    onLeave(() => document.removeEventListener('visibilitychange', onVisibility))
  }

  /** Lifetime Extension as a lease: one range query finds every inbox of this creator with little time left. */
  async function leaseCheck(live: InboxView): Promise<InboxView> {
    if (!timing) return live
    const due = await inboxesDueForRenewal(reader, identity.address, timing)
    queries.add('Lease check', due.query)
    if (!due.inboxes.length) return live
    if (identity.kind !== 'local') {
      status.info(`The inbox has less than ${RENEW_BELOW_DAYS} days left. Use Renew in your wallet.`)
      return live
    }
    status.info('The inbox lease is running low, extending it for another 7 days...')
    const signer = await getSigner()
    for (const i of due.inboxes) await renewInbox(signer, i.key)
    const refreshed = await findInbox(reader, { creator: identity.address, inboxId: identity.inboxId })
    return refreshed.inbox ?? live
  }

  // ---- screens ---------------------------------------------------------------------------------------------
  function showSetup() {
    const name = h('input', { id: 'inbox-name', type: 'text', required: true, maxlength: INBOX_LIMITS.name, value: 'Synthetic demo newsroom', 'data-testid': 'inbox-name' })
    const desc = h('textarea', { id: 'inbox-desc', rows: 3, maxlength: INBOX_LIMITS.description, 'data-testid': 'inbox-desc' }, 'Demo inbox. Please send made-up test messages only.')
    const submit = h('button', { type: 'submit', 'data-testid': 'create-inbox' }, 'Create the inbox')
    const form = h('form', { class: 'compose' },
      h('h2', null, 'Create your inbox'),
      h('p', { class: 'hint' }, 'The name and description are public on Arkiv. Anyone can read them in the Data Explorer, so write nothing you would not print on a poster.'),
      h('label', { for: 'inbox-name' }, 'Name'),
      name,
      h('label', { for: 'inbox-desc' }, 'Description'),
      desc,
      submit,
    )
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault()
      submit.disabled = true
      try {
        await ensureFunds()
        status.info('Creating the inbox entity on Arkiv (about 5 s)...')
        await createInbox(await getSigner(), { inboxId: identity.inboxId, name: name.value, description: desc.value, publicKey: fromB64(identity.boxPublicKey) })
        await load()
      } catch (e) {
        status.error(explainError(e))
        submit.disabled = false
      }
    })
    body.replaceChildren(form)
    status.clear()
  }

  function showInbox(live: InboxView) {
    const url = location.origin + location.pathname + formatSendHash({ creator: live.creator, inboxId: identity.inboxId })
    const field = h('input', { id: 'inbox-link', type: 'text', readonly: true, value: url, 'data-testid': 'inbox-link' })
    const renew = h('button', { type: 'button', class: 'secondary', 'data-testid': 'renew' }, 'Renew now')
    renew.addEventListener('click', async () => {
      renew.disabled = true
      try {
        status.info('Extending the lease...')
        await renewInbox(await getSigner(), live.key)
        const r = await findInbox(reader, { creator: identity.address, inboxId: identity.inboxId })
        if (r.inbox) { inbox = r.inbox; showInbox(r.inbox) }
        status.info('Renewed.')
      } catch (e) {
        status.error(explainError(e))
        renew.disabled = false
      }
    })
    const left = timing ? blockToUnix(live.expiresAt, timing) - Date.now() / 1000 : 0
    body.replaceChildren(
      h('section', { class: 'inbox', 'data-testid': 'inbox' },
        h('h2', null, live.payload.name),
        h('p', { class: 'desc' }, live.payload.description || 'No description.'),
        h('div', null,
          h('label', { for: 'inbox-link' }, 'Your inbox link: give it to sources'),
          h('div', { class: 'row linkrow' }, field, copyButton(() => url, 'Copy inbox link', 'big')),
        ),
        h('dl', { class: 'facts' },
          h('dt', null, '$creator'), h('dd', null, hex(live.creator, { href: addressUrl(live.creator), label: 'creator address' })),
          h('dt', null, '$owner'), h('dd', null, hex(live.owner, { href: ownerUrl(live.owner), label: 'owner address' })),
          h('dt', null, 'Inbox entity'), h('dd', null, hex(live.key, { href: entityUrl(live.key), label: 'inbox entity key' })),
          h('dt', null, 'Lease'), h('dd', null, `alive for ${formatDuration(left)}${timing ? ` (until ${formatUtc(blockToUnix(live.expiresAt, timing))})` : ''}. It expires after ${INBOX_LIFETIME_DAYS} days; opening this console renews it.`, bar(left / (INBOX_LIFETIME_DAYS * 86400), 'wide'), h('div', { class: 'row' }, renew)),
        ),
      ),
    )
  }

  async function load() {
    status.info('Reading your inbox from Arkiv...')
    timing = await getTiming(reader)
    const [found] = await Promise.all([findInbox(reader, { creator: identity.address, inboxId: identity.inboxId }), refreshBalance()])
    queries.add('Find my inbox', found.query)
    if (!found.inbox) return showSetup()
    if (found.inbox.payload.pk !== identity.boxPublicKey) {
      body.replaceChildren(h('p', { class: 'status error', role: 'alert' }, 'The inbox on Arkiv was sealed for a different key than the one in this browser, so its tips cannot be opened here.'))
      status.clear()
      return
    }
    inbox = await leaseCheck(found.inbox)
    showInbox(inbox)
    listen(inbox)
    refreshBtn.onclick = () => fullSweep(inbox!)
    await fullSweep(inbox)
  }

  // ---- page ---------------------------------------------------------------------------------------------------
  const settings = rpcSettings()

  root.append(
    h('h1', null, 'Newsroom console'),
    status.el,
    h('section', { class: 'me' },
      h('dl', null,
        h('dt', null, 'Address'), h('dd', null, hex(identity.address, { href: addressUrl(identity.address), label: 'newsroom address' }), h('span', { class: 'hint' }, identity.kind === 'wallet' ? ' (your wallet)' : ' (throwaway, generated in this browser)')),
        h('dt', null, 'Balance'), h('dd', null, balanceEl, ' ', link(FAUCET_URL, 'faucet')),
      ),
      h('div', { class: 'row' },
        h('button', { type: 'button', class: 'secondary', 'data-testid': 'export', onclick: () => downloadIdentity(identity) }, 'Export key file'),
        h('button', {
          type: 'button',
          class: 'danger',
          onclick: () => {
            if (!confirm('Forget this newsroom in this browser? Without an exported key file you lose access to the inbox and to every tip.')) return
            forgetIdentity()
            again()
          },
        }, 'Forget this newsroom'),
      ),
    ),
    body,
    h('section', { class: 'tips-section' }, h('div', { class: 'tips-head' }, h('h2', null, 'Tips'), refreshBtn), liveStatus, emptyEl, tipList),
    queries.el,
    settings,
  )

  try {
    await load()
  } catch (e) {
    status.error(explainError(e))
  }
}
