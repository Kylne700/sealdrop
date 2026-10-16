// Tiny DOM helpers. Chain data only ever reaches the page through textContent / text nodes, never innerHTML.
type Child = Node | string | number | null | undefined | false

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v === undefined || v === null || v === false) continue
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener)
    else if (k === 'class') el.className = String(v)
    else if (v === true) el.setAttribute(k, '')
    else el.setAttribute(k, String(v))
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(typeof c === 'number' ? String(c) : c)
  return el
}

export const link = (href: string, text: string) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text)
export const short = (hex: string) => (hex.length > 14 ? `${hex.slice(0, 8)}...${hex.slice(-6)}` : hex)
export const kib = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`)

/** A status line for screen readers and the smoke test. kind 'error' uses role=alert. */
export function statusLine(testid = 'status') {
  const el = h('p', { class: 'status', role: 'status', 'aria-live': 'polite', 'data-testid': testid })
  return {
    el,
    info(text: string) { el.className = 'status'; el.setAttribute('role', 'status'); el.textContent = text },
    error(text: string) { el.className = 'status error'; el.setAttribute('role', 'alert'); el.textContent = text },
    clear() { el.className = 'status'; el.textContent = '' },
  }
}

export function copyButton(getText: () => string, label = 'Copy') {
  const b = h('button', { type: 'button', class: 'secondary' }, label)
  b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(getText()); b.textContent = 'Copied' } catch { b.textContent = 'Select and copy manually' }
    setTimeout(() => (b.textContent = label), 1800)
  })
  return b
}

// Resources owned by the current page (WebSocket subscription, timers) are released when the route changes.
let cleanups: (() => void)[] = []
export const onLeave = (fn: () => void) => { cleanups.push(fn) }
export function runCleanups() {
  const run = cleanups
  cleanups = []
  for (const fn of run) try { fn() } catch { /* a failed cleanup must not block navigation */ }
}

/** Shows the exact query strings a page runs; adding the same label again updates its entry. */
export const queriesPanel = (title = 'Queries this page runs') => {
  const list = h('ul', { class: 'queries' })
  const entries = new Map<string, HTMLElement>()
  const el = h('details', { class: 'queries-panel' }, h('summary', null, title), list)
  return {
    el,
    add(label: string, query: string) {
      let code = entries.get(label)
      if (!code) {
        code = h('code')
        entries.set(label, code)
        list.append(h('li', null, h('strong', null, `${label}: `), code))
      }
      code.textContent = query
    },
  }
}
