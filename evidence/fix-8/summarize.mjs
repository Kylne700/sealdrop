// Fix stage 8: readable verdicts from measure.mjs's facts-<label>.jsonl.   usage: node summarize.mjs <facts.jsonl> [label]
// W-2 details sticking out | W-3 field font sizes on touch | W-4 standalone link heights on touch | W-5 copy button sizes | W-6 file input room
import { readFileSync } from 'node:fs'

const [FILE, LABEL = ''] = process.argv.slice(2)
const rows = readFileSync(FILE, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const key = (r) => `${r.engine}/${r.profile}/${r.scheme}`
const errs = rows.filter((r) => r.scenario === 'ERROR')
let bad = 0
const verdict = (ok, line) => { if (!ok) bad++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${line}`) }
console.log(`== ${LABEL}: ${rows.length} records (${new Set(rows.map(key)).size} engine/profile/theme combinations), ${errs.length} errors`)
for (const e of errs) verdict(false, `${key(e)} ERROR ${e.error}`)

// W-2: no descendant of any details sticks out of its box (all details opened by the script)
console.log('-- W-2: children of every details inside its box')
const d2 = rows.filter((r) => r.details)
const boxes = new Set(d2.flatMap((r) => r.details.map((d) => `${r.scenario}:${d.box}`)))
const sticking = new Map()
for (const r of d2) for (const d of r.details) if (d.sticking > 0) { const k = `${d.box}: ${d.worst.who} sticks out ${d.worst.over}px`; sticking.set(k, (sticking.get(k) ?? 0) + 1) }
verdict(sticking.size === 0, `${d2.reduce((n, r) => n + r.details.length, 0)} details checked in ${d2.length} pages (${[...boxes].map((b) => b.replace(/^[a-z]+:/, '')).filter((v, i, a) => a.indexOf(v) === i).join(', ')})`)
for (const [k, n] of sticking) console.log(`      ${k}   [${n} pages]`)

// W-3: on touch every text-entry control, read-only fields and the file input compute at least 16 px; desktop is not asked to change
console.log('-- W-3: font size of inputs (touch: phone profile; mouse profiles must be unchanged, listed in layout-diff)')
const phone = rows.filter((r) => r.profile === 'phone' && r.fields)
const small = phone.flatMap((r) => r.fields.filter((f) => f.size < 16).map((f) => `${key(r)} ${r.scenario} ${f.who}: ${f.size}px`))
verdict(small.length === 0, `phone profile: ${phone.reduce((n, r) => n + r.fields.length, 0)} fields, ${small.length} below 16px`)
for (const s of [...new Set(small)].slice(0, 12)) console.log('      ' + s)
const sizes = (profile) => [...new Set(rows.filter((r) => r.profile === profile && r.fields).flatMap((r) => r.fields.filter((f) => f.ro || /import/.test(f.who)).map((f) => `${/import/.test(f.who) ? 'file' : 'readonly'} ${f.size}px`)))].join(', ')
console.log(`      readonly/file sizes: phone ${sizes('phone')} | desktop ${sizes('desktop')} | narrow ${sizes('narrow')}`)

// W-4: standalone links on touch: 44 px tall, or at least 24 px where 44 would overlap another target
console.log('-- W-4: standalone link heights on touch (phone profile)')
const NAMED = /open-desk|quiet-links|a\.hex-v|\.tip\.hint|faucet|Data Explorer|explorer/i
const named = (l) => /\[open-desk\]/.test(l.who) || /^a\.hex-v/.test(l.who) || /entity on Data Explorer/.test(l.text) || l.text === 'faucet' || /read the source code/.test(l.text)
const stand = phone.flatMap((r) => (r.links ?? []).filter(named).map((l) => ({ ...l, k: `${key(r)} ${r.scenario}` })))
const kinds = [...new Set(stand.map((l) => (l.who.startsWith('a.hex-v') ? 'a.hex-v' : l.text)))]
for (const kd of kinds) {
  const ls = stand.filter((l) => (l.who.startsWith('a.hex-v') ? 'a.hex-v' : l.text) === kd)
  const hs = ls.map((l) => l.h), min = Math.min(...hs), max = Math.max(...hs)
  const over = ls.filter((l) => l.overlaps.length)
  verdict(min >= 44 || (min >= 24 && over.length === ls.length), `${kd}: ${ls.length} seen, height ${min}-${max}px, ${over.length} overlap another target${over.length ? ' (' + over[0].overlaps.join(',') + ')' : ''}`)
}
const inline = phone.flatMap((r) => (r.links ?? []).filter((l) => !named(l)).map((l) => `${l.text.slice(0, 18)}=${l.h}`))
console.log(`      other links (nav, brand, buttons, in-sentence), min height by text: ${[...new Set(inline)].slice(0, 14).join(' | ')}`)

// W-5: the link input and the copy button keep their sizes through normal -> Copied -> back -> blocked -> back (+-1 px)
console.log('-- W-5: sizes of the link input and the copy button across the label changes (+-1 px)')
for (const r of rows.filter((x) => x.copy)) {
  const dev = (get) => { const v = r.copy.map(get); return Math.round((Math.max(...v) - Math.min(...v)) * 10) / 10 }
  const dIn = Math.max(dev((s) => s.input[0]), dev((s) => s.input[1])), dBt = Math.max(dev((s) => s.button[0]), dev((s) => s.button[1]))
  const dx = r.hexCopy ? Math.max(...[0, 1].flatMap((i) => [Math.max(...r.hexCopy.map((s) => s.hex[i])) - Math.min(...r.hexCopy.map((s) => s.hex[i])), Math.max(...r.hexCopy.map((s) => s.button[i])) - Math.min(...r.hexCopy.map((s) => s.button[i]))])) : 0
  verdict(dIn <= 1 && dBt <= 1 && dx <= 1, `${key(r)}: input ${r.copy[0].input.join('x')} button ${r.copy[0].button.join('x')} | max change input ${dIn}px button ${dBt}px | hex copy ${Math.round(dx * 10) / 10}px | labels: ${r.copy.map((s) => `${s.state}="${s.label}"@${s.button[0]}`).join(' ')}`)
}

// W-6: how much room the file input "#import" has next to the width its engine gives a file input by default (a probe copy with width:auto, same cascade).
// At 1280 the input must have at least that width (PASS/FAIL). On a phone screen the card is narrower than that default width in every build, so the numbers
// are only listed (INFO): whether the label ("No file chosen" / "no file selected") is cut off is judged on the screenshots, which were viewed (onboarding-cards-*.png).
console.log('-- W-6: file input "#import" width vs its engine default width')
for (const r of rows.filter((x) => x.file)) {
  const line = `${key(r)}: ${r.file.actual}px (default ${r.file.defaultWidth}px), cards ${JSON.stringify(r.cards)}`
  if (r.profile === 'desktop') verdict(r.file.actual >= r.file.defaultWidth - 1, line)
  else console.log(`INFO  ${line}`)
}
console.log(`== ${LABEL}: ${bad} FAIL line(s)`)
