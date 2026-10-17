import './style.css'
import { parseSendHash } from './codec'
import { ANON_BUDGET_UNITS, REPO_URL } from './config'
import { DESK_HASH } from './env'
import { budget, explainError } from './arkiv'
import { rpcUrl } from './app'
import { focusFromScript, h, runCleanups } from './ui/dom'
import { renderHome } from './pages/home'
import { renderNewsroom } from './pages/newsroom'
import { renderSend } from './pages/send'

const root = document.getElementById('app')!
document.getElementById('source')?.setAttribute('href', REPO_URL)

// The skip link must not follow its href: #app would change the hash and render the "no such page" notice.
document.querySelector('.skip')?.addEventListener('click', (e) => { e.preventDefault(); focusFromScript(root) })

let loaded = false // the first render is the page load, where the browser decides where focus is
function route() {
  runCleanups()
  // Framed by another page, a click could be steered onto "Seal and send" (clickjacking); the app only runs in its own tab.
  if (window.top !== window.self) return root.replaceChildren(h('p', { class: 'status error', role: 'alert' }, 'Sealdrop does not run inside another page. Open it in its own tab.'))
  root.replaceChildren()
  const hash = location.hash
  const ref = parseSendHash(hash)
  if (ref) {
    renderSend(root, ref).catch((e) => root.append(h('p', { class: 'status error', role: 'alert' }, `Something went wrong while showing this inbox: ${explainError(e)}`)))
  } else if (hash === '#/newsroom') {
    renderNewsroom(root)
  } else if (hash === '#/demo') {
    location.replace(DESK_HASH)
  } else {
    // A mistyped or truncated link must not look like the page simply ignored it.
    const notice = hash.startsWith('#/send') ? 'That inbox link is not valid. A Sealdrop link looks like https://.../#/send/0x<40 hex characters>/<inbox-id>/<key check>. Ask the newsroom for the link again, or paste it below.'
      : /^#?\/?$/.test(hash) ? undefined : 'There is no such page. Here is the start page.'
    renderHome(root, notice)
  }
  // After a route change, start at the top of the new page: focus its h1 (#/demo only redirects and renders none, so it keeps "first load" for the page it lands on).
  const heading = root.querySelector('h1')
  if (heading) {
    if (loaded) focusFromScript(heading)
    loaded = true
  }
}
window.addEventListener('hashchange', route)
route()

// The public RPC meters anonymous queries (friction F7); show what this tab has used.
const budgetEl = document.getElementById('budget')
// A custom RPC answers every lookup, so it stays visible while it is set. Host only: the path can hold an access key.
const custom = rpcUrl()
const customHost = custom ? (() => { try { return new URL(custom).host } catch { return 'an unreadable URL' } })() : undefined
if (budgetEl && customHost) budgetEl.textContent = `Custom RPC: ${customHost}. Change it under Settings.`
setInterval(() => {
  if (budgetEl && budget.queries > 0) {
    budgetEl.textContent = customHost
      ? `Custom RPC: ${customHost}. Change it under Settings. This tab has made ${budget.queries} ${budget.queries === 1 ? 'query' : 'queries'} (${budget.spent} cost units).`
      : `Public RPC: this tab has made ${budget.queries} ${budget.queries === 1 ? 'query' : 'queries'} (${budget.spent} cost units). The anonymous allowance is about ${ANON_BUDGET_UNITS} units per window; live tips arrive over a WebSocket instead of polling (one entity read each).`
  }
}, 1000)
