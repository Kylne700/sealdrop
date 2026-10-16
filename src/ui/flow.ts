// The home page picture: source's browser -> sealed box -> Arkiv with an expiry date -> newsroom's browser.
// Inline SVG built with createElementNS (no innerHTML); CSS classes (.fd-*) carry the colours so light and dark both work.
import { svg } from './dom'

type Kind = 'source' | 'box' | 'arkiv' | 'newsroom'
type Step = { kind: Kind; title: string; caption: string[]; one: string; hot?: boolean }

const STEPS: Step[] = [
  { kind: 'source', title: "Source's browser", caption: ['writes and seals', 'the tip'], one: 'writes and seals the tip' },
  { kind: 'box', title: 'Sealed box', caption: ["only the newsroom's", 'key opens it'], one: "only the newsroom's key opens it", hot: true },
  { kind: 'arkiv', title: 'Arkiv', caption: ['gone on the expiry', 'date the source picks'], one: 'gone on the date the source picks', hot: true },
  { kind: 'newsroom', title: "Newsroom's browser", caption: ['opens it with', 'its own key'], one: 'opens it with its own key' },
]

const ALT = "How a tip travels: the source's browser writes and seals it, the sealed box is stored on Arkiv until its expiry date, and the newsroom's browser opens it with its own key."

function glyph(kind: Kind, cx: number, cy: number) {
  const p = (d: string, cls = 'fd-ico') => svg('path', { d, class: cls })
  const window_ = [
    svg('rect', { x: cx - 15, y: cy - 11, width: 30, height: 22, rx: 4, class: 'fd-ico' }),
    p(`M${cx - 15} ${cy - 4}H${cx + 15}`),
    p(`M${cx - 9} ${cy + 2}H${cx + 5}M${cx - 9} ${cy + 7}H${cx - 1}`),
  ]
  if (kind === 'source') return window_
  if (kind === 'newsroom') return [...window_, svg('circle', { cx: cx + 9, cy: cy + 6, r: 3.2, class: 'fd-fill' })]
  if (kind === 'box') {
    return [
      svg('rect', { x: cx - 15, y: cy - 10, width: 30, height: 21, rx: 4, class: 'fd-ico hot' }),
      p(`M${cx - 14} ${cy - 8}L${cx} ${cy + 2}L${cx + 14} ${cy - 8}`, 'fd-ico hot'),
      svg('circle', { cx, cy: cy + 2, r: 3.4, class: 'fd-fill' }),
    ]
  }
  return [
    svg('ellipse', { cx, cy: cy - 9, rx: 13, ry: 5, class: 'fd-ico hot' }),
    p(`M${cx - 13} ${cy - 9}V${cy + 9}M${cx + 13} ${cy - 9}V${cy + 9}`, 'fd-ico hot'),
    p(`M${cx - 13} ${cy}A13 5 0 0 0 ${cx + 13} ${cy}M${cx - 13} ${cy + 9}A13 5 0 0 0 ${cx + 13} ${cy + 9}`, 'fd-ico hot'),
    svg('circle', { cx: cx + 13, cy: cy + 10, r: 7.5, class: 'fd-node hot' }),
    p(`M${cx + 13} ${cy + 6}V${cy + 10}H${cx + 16}`, 'fd-ico hot'),
  ]
}

const text = (cls: string, x: number, y: number, s: string, anchor = 'middle') => svg('text', { class: cls, x, y, 'text-anchor': anchor }, s)

/** Wide layout: four nodes in a row with arrows between them. */
function horizontal() {
  const w = 158, gap = 28, y = 6, hgt = 120
  const out = [svg('title', null, ALT)]
  STEPS.forEach((s, i) => {
    const x = i * (w + gap), cx = x + w / 2
    out.push(svg('rect', { x, y, width: w, height: hgt, rx: 14, class: s.hot ? 'fd-node hot' : 'fd-node' }), ...glyph(s.kind, cx, y + 34),
      text('fd-title', cx, y + 76, s.title), text('fd-cap', cx, y + 94, s.caption[0]!), text('fd-cap', cx, y + 109, s.caption[1]!))
    if (i < STEPS.length - 1) {
      const a = x + w + 4, b = x + w + gap - 4, my = y + hgt / 2
      out.push(svg('path', { d: `M${a} ${my}H${b}M${b - 6} ${my - 5}L${b} ${my}L${b - 6} ${my + 5}`, class: 'fd-arrow' }))
    }
  })
  return svg('svg', { class: 'flow flow-h', viewBox: '0 0 716 132', role: 'img', 'aria-label': ALT }, ...out)
}

/** Narrow layout: the same four nodes stacked, arrows pointing down. */
function vertical() {
  const w = 320, hgt = 68, gap = 28
  const out = [svg('title', null, ALT)]
  STEPS.forEach((s, i) => {
    const y = i * (hgt + gap)
    out.push(svg('rect', { x: 1, y: y + 1, width: w - 2, height: hgt, rx: 14, class: s.hot ? 'fd-node hot' : 'fd-node' }), ...glyph(s.kind, 44, y + 35),
      text('fd-title', 88, y + 31, s.title, 'start'), text('fd-cap', 88, y + 51, s.one, 'start'))
    if (i < STEPS.length - 1) {
      const a = y + hgt + 6, b = y + hgt + gap - 4
      out.push(svg('path', { d: `M${w / 2} ${a}V${b}M${w / 2 - 5} ${b - 6}L${w / 2} ${b}L${w / 2 + 5} ${b - 6}`, class: 'fd-arrow' }))
    }
  })
  return svg('svg', { class: 'flow flow-v', viewBox: `0 0 ${w} ${4 * hgt + 3 * gap + 2}`, role: 'img', 'aria-label': ALT }, ...out)
}

export const flowDiagram = () => [horizontal(), vertical()]
