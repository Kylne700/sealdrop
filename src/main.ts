import './style.css'
import { parseSendHash } from './codec'
import { DEMO_DESK, REPO_URL } from './config'
import { DESK_ADDRESS } from './env'
import { budget } from './arkiv'
import { h, runCleanups } from './ui/dom'
import { renderHome } from './pages/home'
import { renderNewsroom } from './pages/newsroom'
import { renderSend } from './pages/send'

const root = document.getElementById('app')!
document.getElementById('source')?.setAttribute('href', REPO_URL)

function route() {
  runCleanups()
  root.replaceChildren()
  const hash = location.hash
  const ref = parseSendHash(hash)
  if (ref) {
    renderSend(root, ref).catch((e) => root.append(h('p', { class: 'status error', role: 'alert' }, `Something went wrong: ${e instanceof Error ? e.message : e}`)))
  } else if (hash === '#/newsroom') {
    renderNewsroom(root)
  } else if (hash === '#/demo') {
    location.replace(`#/send/${DESK_ADDRESS}/${DEMO_DESK.inboxId}`)
  } else {
    renderHome(root)
  }
}
window.addEventListener('hashchange', route)
route()

// The public RPC meters anonymous queries (friction F7); show what this tab has used.
const budgetEl = document.getElementById('budget')
setInterval(() => {
  if (budgetEl && budget.queries > 0) {
    budgetEl.textContent = `Public RPC query budget used by this tab: ${budget.spent} units in ${budget.queries} queries${budget.limit ? ` (${budget.remaining} of ${budget.limit} left)` : ''}.`
  }
}, 1000)
