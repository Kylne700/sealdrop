import { DEMO_DESK, REPO_URL } from '../config'
import { parseInboxInput, formatSendHash } from '../codec'
import { DESK_ADDRESS } from '../env'
import { h, link, statusLine } from '../ui/dom'

export function renderHome(root: HTMLElement) {
  document.title = 'Sealdrop: an anonymous tip line with no server'
  const input = h('input', { id: 'paste', type: 'text', placeholder: 'https://.../#/send/0x.../inbox-abc123', autocomplete: 'off' })
  const status = statusLine()
  const open = () => {
    const ref = parseInboxInput(input.value)
    if (!ref) return status.error('That does not look like a Sealdrop inbox link.')
    location.hash = formatSendHash(ref)
  }
  root.append(
    h('section', { class: 'hero' },
      h('h1', null, 'An anonymous tip line with no server to seize'),
      h('p', { class: 'lead' }, 'Sealdrop is a SecureDrop-style inbox that lives on Arkiv, the Web3 database. A source seals a message in the browser, a newsroom opens it with a key only it holds, and every tip expires on its own. There is no operator, no account and no backend.'),
    ),
    h('section', { class: 'cards', 'aria-label': 'Start here' },
      h('div', { class: 'card' },
        h('h2', null, 'I run a newsroom'),
        h('p', null, 'Open an inbox in about 30 seconds. No wallet, no account: the page creates a throwaway key and funds it with testnet GLM.'),
        h('a', { class: 'button', href: '#/newsroom', 'data-testid': 'open-newsroom' }, 'Open a newsroom'),
      ),
      h('div', { class: 'card' },
        h('h2', null, 'I have a tip'),
        h('p', null, 'Try the flagship Demo Desk: seal a made-up message and watch it become an Arkiv entity that only the desk can read.'),
        h('a', { class: 'button', href: `#/send/${DESK_ADDRESS}/${DEMO_DESK.inboxId}`, 'data-testid': 'open-desk' }, 'Send to the Demo Desk'),
      ),
      h('div', { class: 'card' },
        h('h2', null, 'I got an inbox link'),
        h('label', { for: 'paste' }, 'Paste the link'),
        input,
        h('button', { type: 'button', onclick: open }, 'Open'),
        status.el,
      ),
    ),
    h('section', null,
      h('h2', null, 'How it works'),
      h('ol', null,
        h('li', null, 'The newsroom creates an inbox entity: its public key, a name and a 7-day Entity Expiration that renews whenever the newsroom is active.'),
        h('li', null, 'A source opens the inbox link. The page finds the inbox by its on-chain creator ($creator), so nobody can publish a look-alike under the newsroom\'s link.'),
        h('li', null, 'The message is padded and sealed in the browser. One atomic batch creates the tip, read-only and with only three attributes, and hands it to the newsroom.'),
        h('li', null, 'The newsroom\'s open console hears the hand-over over a WebSocket, reads the tip and decrypts it locally. It can burn the tip or keep it longer; otherwise it expires on the date the source chose.'),
      ),
    ),
    h('section', null,
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
