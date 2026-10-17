// Fix stage 8: did anything move that should not have? Compares the per-element boxes (x, y, width, height of every element, keyed by its child-index path)
// that measure.mjs saved in facts-<label>.jsonl for the same page on two builds.   usage: node layout-diff.mjs <facts-before.jsonl> <facts-after.jsonl>
// Mouse profiles (desktop 1280x720, narrow 390x844): the only horizontal change that is wanted is the Settings field `input#rpc` (W-2: 30 px narrower, it no longer sticks out)
//   and the new <span> inside the copy button (W-5). Vertical moves are expected only at and below a text that got longer (I-2, W-1): the topmost moved box is printed per page.
// Phone profile (iPhone 15, touch): changes are wanted (W-3 field size, W-4 link boxes); they are listed so they can be read, not judged.
import { readFileSync } from 'node:fs'

const [BEFORE, AFTER] = process.argv.slice(2)
if (!BEFORE || !AFTER) { console.error('usage: node layout-diff.mjs <facts-before.jsonl> <facts-after.jsonl>'); process.exit(1) }
const load = (f) => new Map(readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)).filter((r) => r.layout).map((r) => [`${r.engine}/${r.profile}/${r.scheme}/${r.scenario}`, r.layout]))
const A = load(BEFORE), B = load(AFTER)
const TOL = 1 // px
let wantedOnly = true
const bump = (m, k, v) => m.set(k, (m.get(k) ?? 0) + v)

for (const group of [['desktop', 'narrow'], ['phone']]) {
  console.log(`\n== ${group.join(' + ')} profile${group.length > 1 ? 's (mouse)' : ' (touch)'}`)
  const horiz = new Map(), onlyIn = new Map(), sources = new Map(), pages = []
  let compared = 0, moved = 0
  for (const [key, before] of A) {
    if (!group.includes(key.split('/')[1])) continue
    const after = B.get(key)
    if (!after) { console.log(`MISSING in after: ${key}`); wantedOnly = false; continue }
    let vert = 0
    const grew = [] // [path, name, h before, h after] for every box whose height changed
    for (const [path, [name, x, y, w, h]] of Object.entries(before)) {
      const o = after[path]
      if (!o) { bump(onlyIn, `before only: ${name}`, 1); continue }
      compared++
      const [, x2, y2, w2, h2] = o
      if (Math.abs(x2 - x) > TOL || Math.abs(w2 - w) > TOL) bump(horiz, `${name}  x ${x} -> ${x2}, width ${w} -> ${w2}  [${key.split('/')[3]}]`, 1)
      if (Math.abs(y2 - y) > TOL || Math.abs(h2 - h) > TOL) { vert++; moved++ }
      if (Math.abs(h2 - h) > TOL) grew.push([path, name, h, h2])
    }
    // the innermost boxes whose height changed are the texts that wrapped differently; everything below them moves with them
    for (const [path, name, h, h2] of grew) if (!grew.some(([q]) => q.startsWith(path + '/'))) bump(sources, `${name.slice(0, 50)}  height ${h} -> ${h2}  [${key.split('/')[3]}]`, 1)
    for (const [path, [name]] of Object.entries(after)) if (!before[path]) bump(onlyIn, `after only: ${name}`, 1)
    if (vert) pages.push(`${key}: ${vert} boxes moved vertically`)
  }
  console.log(`${compared} element boxes compared (${A.size} pages), tolerance ${TOL} px`)
  console.log(`horizontal changes (x or width): ${horiz.size ? '' : 'none'}`)
  for (const [k, n] of horiz) console.log(`   ${k}  x${n}`)
  console.log(`elements in one build only: ${onlyIn.size ? '' : 'none'}`)
  for (const [k, n] of onlyIn) console.log(`   ${k}  x${n}`)
  console.log(`vertical changes: ${moved} boxes on ${pages.length} of ${A.size} pages; the innermost boxes whose height changed (the texts that wrapped differently):${sources.size ? '' : ' none'}`)
  for (const [k, n] of sources) console.log(`   ${k}  x${n}`)
  if (group.length > 1) {
    const bad = [...horiz.keys()].filter((k) => !/^input#rpc /.test(k))
    const badOnly = [...onlyIn.keys()].filter((k) => !/^after only: span$/.test(k))
    if (bad.length || badOnly.length) wantedOnly = false
    console.log(`mouse profiles: ${bad.length ? 'UNEXPECTED horizontal changes: ' + bad.length : 'horizontal changes limited to input#rpc'}; ${badOnly.length ? 'UNEXPECTED element differences: ' + badOnly.length : 'new elements limited to the copy button span'}`)
  }
}
console.log(`\nverdict: ${wantedOnly ? 'PASS' : 'CHECK'} (mouse layouts changed only where intended; read the vertical lines above against the changed texts)`)
