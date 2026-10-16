// G: accessibility basics, measured in the page. Returns findings (empty = fine) plus facts for the evidence file.
export async function auditPage(page) {
  const facts = await page.evaluate(() => {
    const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
    const nameOf = (el) => {
      const aria = el.getAttribute('aria-label'); if (aria) return aria
      const by = el.getAttribute('aria-labelledby'); if (by) return by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim()
      if (el.labels && el.labels.length) return [...el.labels].map((l) => l.textContent).join(' ').trim()
      if (el.tagName === 'A' || el.tagName === 'BUTTON' || el.tagName === 'SUMMARY') return (el.textContent ?? '').trim()
      return ''
    }
    const fields = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(visible)
    const unlabeled = fields.filter((f) => !nameOf(f)).map((f) => f.outerHTML.slice(0, 100))
    const actions = [...document.querySelectorAll('a[href], button, summary, [tabindex]')].filter(visible)
    const unnamed = actions.filter((a) => !nameOf(a)).map((a) => a.outerHTML.slice(0, 100))
    return {
      lang: document.documentElement.lang,
      title: document.title,
      h1: document.querySelectorAll('h1').length,
      main: document.querySelectorAll('main').length,
      fields: fields.length,
      unlabeled,
      actions: actions.length,
      unnamed,
    }
  })

  // Keyboard: walk the tab order, count distinct stops, and check that every stop shows a focus ring.
  await page.evaluate(() => { document.activeElement instanceof HTMLElement && document.activeElement.blur(); window.scrollTo(0, 0) })
  const stops = []
  const noRing = []
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab')
    const s = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return null
      const seen = (window.__qaSeen ??= new WeakSet()); const dup = seen.has(el); seen.add(el)
      const cs = getComputedStyle(el)
      const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2
      return { dup, id: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + ':' + (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 24), ring, path: (() => { const p = []; let n = el; while (n && n !== document.body) { p.push(n.tagName); n = n.parentElement } return p.length })() }
    })
    if (!s) break
    if (s.dup) break
    stops.push(s.id)
    if (!s.ring) noRing.push(s.id)
  }
  const reachable = facts.actions + facts.fields
  return { facts, stops, noRing, reachable }
}

export function contrast(fg, bg) {
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  }
  const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
  return (a + 0.05) / (b + 0.05)
}
