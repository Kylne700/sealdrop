import { REPO_URL } from '../config'
import { parseInboxInput, formatSendHash } from '../codec'
import { DESK_HASH } from '../env'
import { h, link, statusLine } from '../ui/dom'
import { flowDiagram } from '../ui/flow'

/** `notice` explains why an unknown or malformed link landed here. */
export function renderHome(root: HTMLElement, notice?: string) {
  document.title = 'Sealdrop: an anonymous tip line with no server'
  const input = h('input', { id: 'paste', type: 'text', placeholder: 'https://.../#/send/0x.../inbox-abc123', autocomplete: 'off' })
  const status = statusLine()
  const open = () => {
    const ref = parseInboxInput(input.value)
    if (!ref) return status.error('That does not look like a Sealdrop inbox link. Paste the whole link the newsroom gave you, starting with https://.')
    location.hash = formatSendHash(ref)
  }
  root.append(
    ...(notice ? [h('p', { class: 'status error', role: 'alert', 'data-testid': 'route-notice' }, notice)] : []),
    h('section', { class: 'hero' },
      h('h1', null, 'An anonymous tip line with no server to seize'),
      h('p', { class: 'value' }, 'Sealed in the browser. Stored on Arkiv. Expires on the date the source picks.'),
      h('p', { class: 'lead' }, 'Sealdrop lets a source send a newsroom an encrypted tip, stored on Arkiv (the Web3 database), that only the newsroom can open and that deletes itself on a date the source picks: no server, no account, no operator.'),
    ),
    h('section', { 'aria-label': 'How a tip travels' }, ...flowDiagram()),
    h('section', { class: 'card', 'aria-labelledby': 'try' },
      h('h2', { id: 'try' }, 'Try it in 60 seconds, no wallet needed'),
      h('ol', { class: 'steps' },
        h('li', null, h('strong', null, 'Open a newsroom'), ' and create an inbox (about 15 seconds).',
          h('div', { class: 'cta' }, h('a', { class: 'button big', href: '#/newsroom', 'data-testid': 'open-newsroom' }, 'Start: open a newsroom'))),
        h('li', null, h('strong', null, 'Open the inbox link in a second tab'), ' and send a made-up message. You are the source.'),
        h('li', null, h('strong', null, 'Switch back to the first tab.'), ' The tip arrives within seconds and is decrypted in your browser only.'),
      ),
      h('p', { class: 'quiet-links' }, h('span', null, 'Short on time?'), h('a', { href: DESK_HASH, 'data-testid': 'open-desk' }, 'Send a made-up tip to the Demo Desk'), h('span', null, 'or'), link(REPO_URL, 'read the source code')),
    ),
    h('section', { class: 'aside' },
      h('h2', null, 'Got an inbox link?'),
      h('label', { for: 'paste' }, 'Paste the link'),
      h('form', { class: 'row', onsubmit: (e: Event) => { e.preventDefault(); open() } }, input, h('button', { type: 'submit', class: 'secondary' }, 'Open')),
      status.el,
    ),
    h('section', null,
      h('h2', null, 'How it works'),
      h('ol', { class: 'numbered' },
        h('li', null, 'The newsroom creates an inbox entity: its public key, a name and a 7-day Entity Expiration that renews whenever the newsroom is active.'),
        h('li', null, 'A source opens the inbox link. The page finds the inbox created by the address in the link and refuses it if its key does not match the key check in the link.'),
        h('li', null, 'The message is padded and sealed in the browser. One atomic batch creates the tip, read-only and with only three attributes, and hands it to the newsroom.'),
        h('li', null, 'The newsroom\'s open console hears the hand-over over a WebSocket, reads the tip and decrypts it locally. It can burn the tip or keep it longer; otherwise it expires on the date the source chose.'),
      ),
    ),
    h('section', { class: 'callout' },
      h('h2', null, 'What it does not hide'),
      h('ul', null,
        h('li', null, 'The RPC node sees your IP address. Use Tor Browser if that matters.'),
        h('li', null, 'Ciphertext stays in chain history after a tip expires. Strong encryption is what protects it, not deletion.'),
        h('li', null, 'Demo mode sends from one shared testnet address, so it hides who you are but not that a tip arrived, or when.'),
        h('li', null, 'This is a testnet demo. Send made-up messages only.'),
      ),
      h('p', null, 'Full threat model, schema and source: ', link(REPO_URL, 'the repository'), '.'),
    ),
  )
}
