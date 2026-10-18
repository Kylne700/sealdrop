// Listening check, part 2: compares a faster-whisper transcript of the final mix (scripts/video/listen.py) with media/narration.md.
//   node scripts/video/asr-compare.mjs <asr.json> [<asr-with-prompt.json>]
// Prints the word error rate overall, per story step and per beat, every word heard differently, and the caption drift against
// the ASR word times. Beats start where the render put them (media/raw/render.json; else the sum of the beat lengths in timing.json).
// Normalisation (both sides): lower case; hyphens, slashes and punctuation become spaces; apostrophes are dropped (source's = sources,
// it's = its: homophones); digits become words; compounds are split (keypair = key pair, WebSocket = web socket, Sealdrop = seal drop);
// cypher = cipher. A word heard as another word (Arkiv as archive) stays an error. Alignment: word-level edit distance.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { RAW } from './config.mjs'

const [asrFile, promptFile] = process.argv.slice(2)
if (!asrFile) throw new Error('usage: node scripts/video/asr-compare.mjs <asr.json> [<asr-with-prompt.json>]')
const timing = JSON.parse(readFileSync(resolve(RAW, 'timing.json'), 'utf8'))
const ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ')
const TENS = 'x x twenty thirty forty fifty sixty seventy eighty ninety'.split(' ')
const num = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ''}`)
const COMPOUNDS = { keypair: 'key pair', websocket: 'web socket', throwaway: 'throw away', ciphertext: 'cipher text', plaintext: 'plain text', newsroom: 'news room', newsrooms: 'news rooms', sealdrop: 'seal drop', securedrop: 'secure drop' }
const SPELLING = { cypher: 'cipher' }

function norm(text) {
  return text.toLowerCase()
    .replace(/web3/g, 'web three')
    .replace(/[‐-―/-]/g, ' ').replace(/'/g, '').replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/).filter(Boolean)
    .map((t) => (/^\d{1,2}$/.test(t) ? num(Number(t)) : t))
    .flatMap((t) => (COMPOUNDS[t] ?? SPELLING[t] ?? t).split(' '))
}

/** Edit-distance alignment: ops[k] = { r: ref index | -1, h: hyp index | -1 }. */
function align(ref, hyp) {
  const n = ref.length, m = hyp.length
  const d = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = 0; i <= n; i++) d[i][0] = i
  for (let j = 0; j <= m; j++) d[0][j] = j
  for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1))
  const ops = []
  for (let i = n, j = m; i > 0 || j > 0;) {
    if (i > 0 && j > 0 && d[i][j] === d[i - 1][j - 1] + (ref[i - 1] === hyp[j - 1] ? 0 : 1)) ops.push({ r: --i, h: --j })
    else if (i > 0 && d[i][j] === d[i - 1][j] + 1) ops.push({ r: --i, h: -1 })
    else ops.push({ r: -1, h: --j })
  }
  return ops.reverse()
}

// ---- reference: beat by beat, with the start of each beat in the video -----------------------------------------
// FilmCraft rounds every segment to whole frames, so a beat starts up to 0.2 s after the sum of the durations before it:
// the real starts are in the render result that build.sh keeps (media/raw/render.json); without it the sum is used.
const real = existsSync(resolve(RAW, 'render.json')) ? JSON.parse(readFileSync(resolve(RAW, 'render.json'), 'utf8')).segments.map((s) => s.t0) : null
let start = 0
const refTok = [] // { w, beat, i }
const beats = timing.beats.map((b, k) => {
  const first = refTok.length
  for (const s of b.timing) for (const w of norm(s.text)) refTok.push({ w, beat: b.id })
  const info = { id: b.id, step: b.step, start: real?.[k] ?? start, first, last: refTok.length, cues: [] }
  start += b.dur
  return info
})
timing.beats.forEach((b, k) => { // caption cues: consecutive slices of the beat's tokens
  let at = beats[k].first
  for (const c of b.cues) { const n = norm(c.text).length; beats[k].cues.push({ text: c.text, t0: beats[k].start + c.t0, t1: beats[k].start + c.t1, from: at, to: at + n }); at += n }
})

function analyse(file) {
  const asr = JSON.parse(readFileSync(resolve(file), 'utf8'))
  const hypTok = asr.words.flatMap((x) => norm(x.w).map((w) => ({ w, start: x.start, end: x.end })))
  const ops = align(refTok.map((t) => t.w), hypTok.map((t) => t.w))
  const per = new Map(beats.map((b) => [b.id, { n: b.last - b.first, S: 0, D: 0, I: 0 }]))
  const diffs = [] // { beat, ref, heard }
  const refToHyp = new Array(refTok.length).fill(-1)
  let lastBeat = beats[0].id
  for (const { r, h } of ops) {
    if (r >= 0) lastBeat = refTok[r].beat
    const p = per.get(lastBeat)
    if (r >= 0 && h >= 0) { refToHyp[r] = h; if (refTok[r].w !== hypTok[h].w) { p.S++; diffs.push({ beat: lastBeat, ref: refTok[r].w, heard: hypTok[h].w }) } }
    else if (r >= 0) { p.D++; diffs.push({ beat: lastBeat, ref: refTok[r].w, heard: '(nothing)' }) }
    else { p.I++; diffs.push({ beat: lastBeat, ref: '(nothing)', heard: hypTok[h].w }) }
  }
  return { asr, hypTok, per, diffs, refToHyp, ops }
}

const wer = (p) => (p.S + p.D + p.I) / p.n
const pct = (x) => `${(100 * x).toFixed(1)}%`
function totals(per, ids) { const t = { n: 0, S: 0, D: 0, I: 0 }; for (const id of ids) for (const k of Object.keys(t)) t[k] += per.get(id)[k]; return t }
const raw = analyse(asrFile)
const withPrompt = promptFile ? analyse(promptFile) : null
const out = []
const say = (s = '') => { out.push(s); console.log(s) }

say(`asr: ${raw.asr.words.length} words heard in ${raw.asr.duration} s; reference ${refTok.length} words in ${beats.length} beats`)
const all = totals(raw.per, beats.map((b) => b.id))
say(`WER overall (no prompt): ${pct(wer(all))}  (${all.S} substituted, ${all.D} missing, ${all.I} extra, of ${all.n})`)
if (withPrompt) { const t = totals(withPrompt.per, beats.map((b) => b.id)); say(`WER overall (prompt with the brand words): ${pct(wer(t))}  (${t.S} substituted, ${t.D} missing, ${t.I} extra)`) }
say('\nper story step:')
for (const s of [...new Set(beats.map((b) => b.step))]) {
  const ids = beats.filter((b) => b.step === s).map((b) => b.id), t = totals(raw.per, ids), tp = withPrompt && totals(withPrompt.per, ids)
  say(`  step ${s}: ${pct(wer(t))} (${t.S}S ${t.D}D ${t.I}I of ${t.n})${tp ? `   with prompt ${pct(wer(tp))}` : ''}`)
}
say('\nper beat (no prompt | with prompt):')
for (const b of beats) {
  const p = raw.per.get(b.id), q = withPrompt?.per.get(b.id)
  say(`  ${b.id.padEnd(9)} ${String(p.n).padStart(3)} words  ${pct(wer(p)).padStart(6)}  ${p.S}S ${p.D}D ${p.I}I${q ? `   | ${pct(wer(q)).padStart(6)}  ${q.S}S ${q.D}D ${q.I}I` : ''}`)
}
const listDiffs = (label, r) => {
  say(`\nwords heard differently (${label}):`)
  const g = new Map()
  for (const d of r.diffs) { const k = `${d.ref} -> ${d.heard}`; (g.get(k) ?? g.set(k, []).get(k)).push(d.beat) }
  for (const [k, v] of g) say(`  ${k}   x${v.length}  (${[...new Set(v)].join(', ')})`)
}
listDiffs('no prompt', raw)
if (withPrompt) listDiffs('with prompt', withPrompt)

say('\nbrand words, every occurrence in the narration (reference -> what was heard, no prompt | with prompt):')
const brand = ['arkiv', 'sealdrop', 'tiramisu', 'subpoena', 'websocket', 'securedrop', 'web', 'socket']
const heardAt = (r, i) => (r.refToHyp[i] >= 0 ? r.hypTok[r.refToHyp[i]].w : '(nothing)')
for (const w of brand) {
  const idx = refTok.map((t, i) => (t.w === w ? i : -1)).filter((i) => i >= 0)
  if (idx.length) say(`  ${w.padEnd(11)} ${idx.map((i) => `${refTok[i].beat}:${heardAt(raw, i)}${withPrompt ? `|${heardAt(withPrompt, i)}` : ''}`).join('  ')}`)
}

// caption drift: when a caption appears/disappears against the first/last word of its cue as heard
const drift = []
for (const b of beats) for (const c of b.cues) {
  const hit = []
  for (let i = c.from; i < c.to; i++) if (raw.refToHyp[i] >= 0) hit.push(raw.hypTok[raw.refToHyp[i]])
  if (!hit.length) { drift.push({ beat: b.id, text: c.text, none: true }); continue }
  drift.push({ beat: b.id, text: c.text, ds: c.t0 - hit[0].start, de: c.t1 - hit.at(-1).end, h0: hit[0], h1: hit.at(-1) })
}
const ds = drift.filter((d) => !d.none)
const med = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)]
const shift = med(ds.map((d) => d.ds))
say(`\ncaption drift (${ds.length} captions, caption time minus heard time; positive = the caption is late). Median start offset ${shift.toFixed(2)} s.`)
const worst = (k) => ds.reduce((m, d) => (Math.abs(d[k]) > Math.abs(m[k]) ? d : m), ds[0])
say(`  largest |start| ${Math.abs(worst('ds').ds).toFixed(2)} s (${worst('ds').beat}: "${worst('ds').text}")`)
say(`  largest |end|   ${Math.abs(worst('de').de).toFixed(2)} s (${worst('de').beat}: "${worst('de').text}")`)
const over = ds.filter((d) => Math.abs(d.ds) > 0.5 || Math.abs(d.de) > 0.5)
say(`  captions beyond 0.5 s: ${over.length} of ${ds.length}${drift.length - ds.length ? `; ${drift.length - ds.length} cue(s) with no aligned word` : ''}`)
for (const d of over) say(`    ${d.beat.padEnd(9)} start ${d.ds.toFixed(2)} end ${d.de.toFixed(2)}  "${d.text}"  (first word heard "${d.h0.w}" at ${d.h0.start.toFixed(2)}, last "${d.h1.w}" to ${d.h1.end.toFixed(2)})`)
writeFileSync(resolve(RAW, 'asr-report.txt'), `${out.join('\n')}\n`)
