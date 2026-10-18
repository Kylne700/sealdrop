// Black and frozen frames of the final video (the last Done check): ffmpeg blackdetect and freezedetect on media/demo.mp4.
//   node scripts/video/detect.mjs [video]
// Every event is listed with the beat it falls in (beats follow each other, lengths from media/raw/timing.json) and what that beat
// shows (a slide or screen footage, from media/raw/cut.json). Thresholds:
//   black, strict : a frame is black when 98% of its pixels are below 2% of the luma range, for 0.04 s or more (real black frames)
//   black, loose  : 10% of the luma range (ffmpeg's default): the dark slide background (#0e1113) and near-empty dark pages trip it
//   freeze, -60 dB: the picture changes by less than -60 dB for 0.5 s or more (a still slide, or a page where nothing big moves: a pointer
//                   crossing the page is too small to count, so this is the "nothing changes on screen" list; captions end a hold)
//   freeze, -80 dB: the same with 100 times less tolerance: a pointer move or a typed character counts as change, so only a truly
//                   still picture (a slide, a page with a resting pointer) is listed
// After the raw events, one line per beat: the share of the beat that is frozen and its longest hold (events joined across a caption change).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { MEDIA, RAW } from './config.mjs'

const video = process.argv[2] ?? resolve(MEDIA, 'demo.mp4')
const timing = JSON.parse(readFileSync(resolve(RAW, 'timing.json'), 'utf8'))
const cut = JSON.parse(readFileSync(resolve(RAW, 'cut.json'), 'utf8'))
// real segment starts from the render result build.sh keeps (FilmCraft rounds segments to frames); else the sum of the beat lengths
const real = existsSync(resolve(RAW, 'render.json')) ? JSON.parse(readFileSync(resolve(RAW, 'render.json'), 'utf8')).segments : null
let t = 0
const beats = timing.beats.map((b, k) => { const r = { id: b.id, a: real?.[k].t0 ?? t, b: real?.[k].t1 ?? t + b.dur, kind: cut.beats.find((c) => c.id === b.id)?.kind ?? '?' }; t += b.dur; return r })

const scan = (vf) => spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-nostdin', '-i', video, '-vf', vf, '-an', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 27 }).stderr
const num = (s, key) => Number(s.match(new RegExp(`${key}:\\s*([\\d.]+)`))?.[1])
const black = (vf) => scan(vf).split('\n').filter((l) => l.includes('black_start')).map((l) => ({ a: num(l, 'black_start'), b: num(l, 'black_end') }))
const freezes = (db) => {
  const out = [], lines = scan(`freezedetect=n=${db}dB:d=0.5`).split('\n')
  for (const l of lines) {
    if (l.includes('freeze_start')) out.push({ a: num(l, 'freeze_start') })
    else if (l.includes('freeze_end')) out.at(-1).b = num(l, 'freeze_end')
  }
  return out.map((e) => ({ a: e.a, b: e.b ?? t })) // a freeze that runs to the end of the file has no freeze_end
}
const merge = (list) => list.reduce((m, e) => { const l = m.at(-1); if (l && e.a - l.b <= 0.1) l.b = Math.max(l.b, e.b); else m.push({ ...e }); return m }, [])
const perBeat = (list) => beats.map((x) => {
  const hs = merge(list).map((e) => ({ a: Math.max(e.a, x.a), b: Math.min(e.b, x.b) })).filter((e) => e.b - e.a > 0.05)
  const total = hs.reduce((s, e) => s + e.b - e.a, 0)
  return `  ${x.id.padEnd(8)} ${x.kind.padEnd(7)} ${(x.b - x.a).toFixed(1).padStart(5)} s  frozen ${(100 * total / (x.b - x.a)).toFixed(0).padStart(3)}%  longest hold ${Math.max(0, ...hs.map((e) => e.b - e.a)).toFixed(2)} s`
})

const where = (e) => beats.filter((x) => e.a < x.b - 1e-3 && e.b > x.a + 1e-3).map((x) => `${x.id} (${x.kind}) +${Math.max(0, e.a - x.a).toFixed(2)} s`).join(', ')
const lines = [`video ${video.split('/').pop()}, ${t.toFixed(1)} s of beats; beat order: ${beats.map((b) => `${b.id}@${b.a.toFixed(1)}`).join(' ')}`]
const f60 = freezes(-60), f80 = freezes(-80)
for (const [label, list] of [['black, strict (2%)', black('blackdetect=d=0.04:pic_th=0.98:pix_th=0.02')], ['black, loose (10%)', black('blackdetect=d=0.1:pic_th=0.98:pix_th=0.10')], ['freeze (-60 dB, 0.5 s)', f60], ['freeze (-80 dB, 0.5 s)', f80]]) {
  lines.push(`\n${label}: ${list.length} event(s)`)
  for (const e of list) lines.push(`  ${e.a.toFixed(2)} - ${e.b.toFixed(2)} s (${(e.b - e.a).toFixed(2)} s)  ${where(e)}`)
}
lines.push('\nper beat, frozen share and longest hold at -60 dB (nothing big changes):', ...perBeat(f60), '\nper beat at -80 dB (nothing changes, not even the pointer):', ...perBeat(f80))
const held = cut.beats.filter((b) => b.held_last_frame)
lines.push(`\ncut.mjs held-last-frame warnings: ${held.length}${held.map((b) => ` ${b.id}:${b.held_last_frame}s`).join('')}`)
console.log(lines.join('\n'))
writeFileSync(resolve(RAW, 'detect-report.txt'), `${lines.join('\n')}\n`)
