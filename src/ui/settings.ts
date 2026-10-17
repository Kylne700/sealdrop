// The way out of the public RPC's anonymous query budget (friction F7): paste your own RPC URL. Shown on every page that queries.
import { getRpcOverride, setRpcOverride } from '../store'
import { h, statusLine } from './dom'

export function rpcSettings() {
  const input = h('input', { id: 'rpc', type: 'url', placeholder: 'https://... (optional)', value: getRpcOverride() ?? '' })
  const problem = statusLine('rpc-problem')
  const save = h('button', { type: 'button', class: 'secondary' }, 'Save and reload')
  save.addEventListener('click', () => {
    const v = input.value.trim()
    // The page's Content-Security-Policy only allows https and wss, so an http:// URL would be blocked.
    if (v && !/^https:\/\//.test(v)) {
      return problem.error('The RPC URL must start with https://. Copy the full URL your RPC provider gave you.')
    }
    if (!setRpcOverride(v)) {
      return problem.error('This browser would not store the setting (its storage is full or blocked). Allow site data for this page, then try again.')
    }
    location.reload()
  })
  return h('details', { class: 'settings' },
    h('summary', null, 'Settings'),
    h('p', { class: 'hint' }, 'Anonymous queries share a cost budget on the public RPC. If it runs out, paste your own RPC URL, for example one with an access key from hub.arkiv.network. It stays in this browser.'),
    h('p', { class: 'hint warn-text', 'data-testid': 'rpc-trust' }, 'Use only an RPC you trust. It sees your IP address and answers every inbox lookup, so a dishonest one could show you a different inbox key. A link with a key check refuses such a key; a link without one cannot tell.'),
    h('label', { for: 'rpc' }, 'Custom RPC URL'),
    input,
    save,
    problem.el,
  )
}
