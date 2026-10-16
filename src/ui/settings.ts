// The way out of the public RPC's anonymous query budget (friction F7): paste your own RPC URL. Shown on every page that queries.
import { getRpcOverride, setRpcOverride } from '../store'
import { h } from './dom'

export function rpcSettings() {
  const input = h('input', { id: 'rpc', type: 'url', placeholder: 'https://... (optional)', value: getRpcOverride() ?? '' })
  const problem = h('p', { class: 'status', role: 'status', 'aria-live': 'polite' })
  const save = h('button', { type: 'button', class: 'secondary' }, 'Save and reload')
  save.addEventListener('click', () => {
    const v = input.value.trim()
    // The page's Content-Security-Policy only allows https and wss, so an http:// URL would be blocked.
    if (v && !/^https:\/\//.test(v)) {
      problem.className = 'status error'
      problem.setAttribute('role', 'alert')
      problem.textContent = 'The RPC URL must start with https://.'
      return
    }
    setRpcOverride(v)
    location.reload()
  })
  return h('details', { class: 'settings' },
    h('summary', null, 'Settings'),
    h('p', { class: 'hint' }, 'Anonymous queries share a cost budget on the public RPC. If it runs out, paste your own RPC URL, for example one with an access key from hub.arkiv.network. It stays in this browser.'),
    h('label', { for: 'rpc' }, 'Custom RPC URL'),
    input,
    save,
    problem,
  )
}
