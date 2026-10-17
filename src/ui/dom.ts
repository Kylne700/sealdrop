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
export const short = (hex: string) => (hex.length > 12 ? `${hex.slice(0, 6)}…${hex.slice(-4)}` : hex)
export const kib = (bytes: number) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KiB`)

/**
 * A status line for screen readers and the smoke test. kind 'error' uses role=alert.
 * `note` is a hidden companion live region that only speaks while the status shows an error: any other text, or clear(), empties it.
 */
export function statusLine(testid = 'status', note?: HTMLElement) {
  const el = h('p', { class: 'status', role: 'status', 'aria-live': 'polite', 'data-testid': testid })
  const endNote = () => { if (note) note.textContent = '' }
  return {
    el,
    info(text: string) { endNote(); el.className = 'status'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.textContent = text },
    busy(text: string) { endNote(); el.className = 'status busy'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite'); el.textContent = text },
    // role=alert implies aria-live=assertive; an explicit polite would downgrade it
    error(text: string) { el.className = 'status error'; el.setAttribute('role', 'alert'); el.setAttribute('aria-live', 'assertive'); el.textContent = text },
    clear() { endNote(); el.className = 'status'; el.textContent = '' },
  }
}

/**
 * A button whose label changes for 1.8 s after a click: "Copied ✓", or COPY_BLOCKED when the clipboard refuses. The label sits in a span and
 * button.copy::after (style.css) holds an invisible copy of the first label in the same grid cell, so the button keeps that width and the row does not re-flow.
 * "Copied ✓" and COPY_BLOCKED must therefore be no wider than the first label.
 */
export const COPY_BLOCKED = 'Copy manually'
export function copyButton(getText: () => string, label = 'Copy', cls = 'secondary') {
  const text = h('span', null, label)
  const b = h('button', { type: 'button', class: `${cls} copy`, 'data-label': label }, text)
  b.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(getText()); text.textContent = 'Copied ✓' } catch { text.textContent = COPY_BLOCKED }
    setTimeout(() => (text.textContent = label), 1800)
  })
  return b
}

// ---- SVG, chips, bars, hex values ----------------------------------------------------------------------------
const SVG_NS = 'http://www.w3.org/2000/svg'
type SvgChild = Node | string | null | undefined | false

/** SVG elements need their namespace; attributes only (CSS classes style them), never a style attribute (CSP). */
export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> | null = null, ...children: SvgChild[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, String(v))
  for (const c of children) if (c) el.append(c)
  return el
}

const ICONS = {
  copy: ['M9 9h11v11H9z', 'M5 15V5h10'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
} as const
export const icon = (name: keyof typeof ICONS) =>
  svg('svg', { viewBox: '0 0 24 24', class: 'icon', 'aria-hidden': 'true', focusable: 'false' }, ...ICONS[name].map((d) => svg('path', { d })))

/** The brand mark (same drawing as in index.html), for empty states. */
export const mark = () => svg('svg', { viewBox: '0 0 32 32', class: 'mark', 'aria-hidden': 'true', focusable: 'false' },
  svg('rect', { class: 'mark-box', x: 3, y: 7, width: 26, height: 19, rx: 4.5 }), svg('path', { class: 'mark-flap', d: 'M5 10 16 18.5 27 10' }), svg('circle', { class: 'mark-seal', cx: 16, cy: 18.5, r: 3.6 }))

/** A status pill. kind: live (teal, pulsing dot), ok (teal), neutral, warn (danger hue). */
export const chip = (kind: 'live' | 'ok' | 'neutral' | 'warn', ...children: Child[]) =>
  h('span', { class: `chip ${kind}` }, kind === 'live' ? h('span', { class: 'dot', 'aria-hidden': 'true' }) : null, ...children)

/** Sets a bar's fill (0..1) through the CSSOM, which the production CSP allows (inline style attributes it does not). */
export function setFill(barEl: Element, fraction: number) {
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0))
  ;(barEl.firstElementChild as HTMLElement | null)?.style.setProperty('--fill', `${Math.round(f * 100)}%`)
}

/** A decorative bar; the text next to it carries the value. */
export function bar(fraction: number, cls = '') {
  const el = h('span', { class: `bar ${cls}`.trim(), 'aria-hidden': 'true' }, h('i'))
  setFill(el, fraction)
  return el
}

/**
 * A hex value (address, key, hash): mono, middle-truncated like 0x3A3E…42c7, the explorer link, a copy button.
 * The whole value stays in the DOM (the hidden middle), in the title and for assistive technology; full=true prints it all.
 */
export function hex(value: string, o: { href?: string; label?: string; full?: boolean } = {}) {
  const parts = value.length > 12 && !o.full
    ? [h('span', { class: 'hex-head' }, value.slice(0, 6)), h('span', { class: 'hex-mid' }, value.slice(6, -4)), h('span', { class: 'hex-tail' }, value.slice(-4))]
    : [value]
  const v = o.href ? h('a', { class: 'hex-v', href: o.href, target: '_blank', rel: 'noopener noreferrer', title: value }, ...parts) : h('code', { class: 'hex-v', title: value }, ...parts)
  const done = h('span', { class: 'vh', role: 'status' })
  const copy = h('button', { type: 'button', class: 'icon-btn', title: 'Copy', 'aria-label': `Copy ${o.label ?? 'value'}` }, icon('copy'))
  copy.addEventListener('click', async () => {
    let ok = true
    try { await navigator.clipboard.writeText(value) } catch { ok = false }
    done.textContent = ok ? 'Copied' : 'Select and copy manually'
    copy.replaceChildren(icon(ok ? 'check' : 'copy'))
    setTimeout(() => { done.textContent = ''; copy.replaceChildren(icon('copy')) }, 1800)
  })
  return h('span', { class: o.full ? 'hex full' : 'hex' }, v, copy, done)
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

// ---- keeping the user's place across a re-render -------------------------------------------------------------
/** Focus for a non-interactive element: tabindex=-1 only while it holds focus, so it never becomes a Tab stop or a click target. */
export function focusFromScript(el: HTMLElement) {
  el.tabIndex = -1
  const leave = () => {
    if (!document.hasFocus()) return // the window lost focus (a confirm() closing, another tab), not the element: the browser gives the element focus back
    el.removeAttribute('tabindex')
    el.removeEventListener('blur', leave)
  }
  el.addEventListener('blur', leave)
  el.focus()
}

const CONTROLS = 'a[href],button,input,select,textarea,summary'
/** What a control is called from one render to the next: its tag, id and accessible name. */
const named = (el: Element) => `${el.localName}|${el.id}|${el.getAttribute('aria-label') ?? el.textContent}`
const matching = (scope: Element, name: string) => [...scope.querySelectorAll<HTMLElement>(CONTROLS)].filter((c) => named(c) === name)

/**
 * A control that is replaced or disabled while it has focus drops focus to the page start. Call this before such a change and the returned
 * function after it. If focus was inside `region` and fell, it goes back to the same control (same [data-key] row, same name); when that is gone,
 * to the same control of the next row, then the previous row, then `fallback()`. Focus anywhere else, or anywhere real afterwards, is left alone.
 */
export function keepFocus(region: Element, fallback?: () => HTMLElement | null | undefined) {
  const from = document.activeElement
  if (!from || from === region || !region.contains(from)) return () => {}
  const row = from.closest<HTMLElement>('[data-key]')
  const name = named(from)
  const nth = matching(row ?? region, name).indexOf(from as HTMLElement)
  const keys = row ? [row, row.nextElementSibling, row.previousElementSibling].flatMap((r) => (r instanceof HTMLElement && r.dataset.key ? [r.dataset.key] : [])) : []
  return () => {
    const now = document.activeElement
    if (!region.isConnected || (now && now !== document.body)) return
    const rows = [...region.querySelectorAll<HTMLElement>('[data-key]')]
    for (const scope of row ? keys.map((k) => rows.find((r) => r.dataset.key === k)) : [region]) {
      const to = scope && matching(scope, name)[nth]
      to?.focus({ preventScroll: true })
      if (to && document.activeElement === to) return
    }
    const last = fallback?.()
    if (last) focusFromScript(last)
  }
}
