// Footage plan: one clip per narration beat, trimmed from the take (media/raw/takes/<TAKE>) or rendered from a slide PNG.
//   TAKE=<take name under media/raw/takes> node scripts/video/cut.mjs   (default: TAKE in config.mjs)
// Writes tools/filmcraft/work/sealdrop/v-<beat>.mp4 and media/raw/cut.json (read by plan.mjs).
// Every beat's video is exactly as long as its narration. Where the take waited for the chain, the cut jumps over the wait.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FC_IN, FPS, RAW, TAKE } from './config.mjs'
import { round3, run } from './lib.mjs'
import { slideFor } from './slides.mjs'

const take = JSON.parse(readFileSync(resolve(RAW, 'takes', TAKE, 'take.json'), 'utf8'))
const timing = JSON.parse(readFileSync(resolve(RAW, 'timing.json'), 'utf8'))
const cams = take.meta.cams
mkdirSync(FC_IN, { recursive: true })

// ---- event lookups (all times are epoch seconds on the take's shared wall clock) ---------------------------------
const when = (cam, name, pick = {}) => {
  const hit = take.events.filter((e) => e.cam === cam && e.name === name && Object.entries(pick).every(([k, v]) => k === 'nth' || e[k] === v))[pick.nth ?? 0]
  if (!hit) throw new Error(`take ${TAKE} has no event ${cam}/${name} ${JSON.stringify(pick)}`)
  return hit.t
}
const dwell = (cam, label) => when(cam, 'dwell', { label })
const click = (cam, selector) => when(cam, 'click', { selector })
const t0 = (cam) => cams[cam].t0

// A shot is S(camera, from, seconds). `from` is an epoch time or a function of the end of that camera's previous shot;
// `seconds` is left out on the last shot of a beat: it takes whatever the narration needs.
const S = (cam, from, seconds) => ({ cam, from, seconds })

// ---- what is on screen while each beat is spoken -----------------------------------------------------------------
// Offsets were chosen against the pointer events logged by take.mjs, so the pointer reaches each element while the
// sentence names it. Beats without an entry here are slides (slides.mjs).
const SHOTS = {
  's2-1': () => [S('A', t0('A'))],
  's2-2': () => [S('A', dwell('A', 'diagram-a'))],
  's2-3': () => [S('A', dwell('A', 'diagram-b'))],
  's2-4': () => [S('A', dwell('A', 'how'))],
  create: () => {
    const begin = when('A', 'create_begin')
    return [S('A', begin, click('A', '[data-testid=create-inbox]') + 0.6 - begin), // ... up to the click on "create inbox"
      S('A', (end) => Math.max(end, when('A', 'inbox_ready') - 0.3))] // the chain wait is jumped
  },
  copy: () => [S('A', click('A', '.linkrow button') - 1.2)],
  verify: () => [S('B', t0('B') + 1.35)],
  send: () => [S('B', click('B', '[data-testid=message]') - 0.6)],
  arrive: () => [S('A', when('A', 'tip_visible') - 1.2)],
  lease: () => [S('A', (end) => Math.max(end, dwell('A', 'lease') - 0.7))],
  receipt: () => [S('B', click('B', '.stores summary') - 2.3)],
  explorer: () => [S('E', when('E', 'explorer_scrolled') - 2.6)],
}

// ---- encoding ----------------------------------------------------------------------------------------------------
const TAGS = 'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv'
const OUT = ['-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-an', '-movflags', '+faststart', '-fflags', '+bitexact', '-flags:v', '+bitexact']
const ff = (args) => run('ffmpeg', ['-y', '-v', 'error', '-nostdin', ...args])
const frames = (seconds) => Math.max(1, Math.round(seconds * FPS))

async function trimShot(cam, fromEpoch, n, out) {
  const ss = fromEpoch - t0(cam)
  if (ss < -0.02) throw new Error(`${cam}: shot starts ${(-ss).toFixed(2)} s before the clip`)
  // tpad: if the clip ends early the last frame is held (reported below), never silently shortened
  await ff(['-ss', Math.max(0, ss).toFixed(3), '-i', resolve(cams[cam].mp4), '-vf', `tpad=stop_mode=clone:stop_duration=3,${TAGS}`, '-frames:v', String(n), ...OUT, out])
  const end = t0(cam) + cams[cam].seconds
  return { held: Math.max(0, round3(fromEpoch + n / FPS - end)) }
}

async function stillClip(png, n, out) {
  await ff(['-loop', '1', '-framerate', String(FPS), '-i', png, '-vf', `scale=out_color_matrix=bt709:out_range=tv:flags=accurate_rnd+full_chroma_int,format=yuv420p,${TAGS}`, '-frames:v', String(n), '-tune', 'stillimage', ...OUT, out])
}

const slides = resolve(RAW, 'slides')
const cursor = {} // camera -> end epoch of its latest shot
let prev = null // { cam, end } of the previous beat's last footage shot
const report = []
for (const b of timing.beats) {
  const out = resolve(FC_IN, `v-${b.id}.mp4`)
  const total = frames(b.dur)
  if (!SHOTS[b.id]) {
    if (!slideFor(b.id)) throw new Error(`beat ${b.id} has neither a shot list (cut.mjs) nor a slide (slides.mjs)`)
    await stillClip(resolve(slides, `${b.id}.png`), total, out)
    report.push({ id: b.id, kind: 'slide', seconds: b.dur, frames: total, contiguous: false })
    prev = null
    continue
  }
  const shots = SHOTS[b.id]()
  const parts = []
  let used = 0, contiguous = false
  for (const [i, s] of shots.entries()) {
    const from = typeof s.from === 'function' ? s.from(cursor[s.cam] ?? 0) : s.from
    const last = i === shots.length - 1
    const n = last ? total - used : frames(s.seconds)
    if (n < 3) throw new Error(`beat ${b.id}: shot ${i + 1} would be ${n} frames; the narration is shorter than the fixed part of the shot list`)
    if (i === 0 && prev && prev.cam === s.cam && Math.abs(from - prev.end) < 0.08) contiguous = true
    const file = resolve(FC_IN, `v-${b.id}.${i}.mp4`)
    const { held } = await trimShot(s.cam, from, n, file)
    parts.push(file)
    report.push({ id: b.id, kind: 'footage', shot: i + 1, cam: s.cam, clip_from: round3(from - t0(s.cam)), seconds: round3(n / FPS), held_last_frame: held || undefined })
    cursor[s.cam] = from + n / FPS
    prev = { cam: s.cam, end: from + n / FPS }
    used += n
  }
  if (parts.length === 1) await run('mv', [parts[0], out])
  else {
    const list = resolve(FC_IN, `v-${b.id}.txt`)
    writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n') + '\n')
    await ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', '-fflags', '+bitexact', out])
  }
  report.find((r) => r.id === b.id && r.kind === 'footage' && r.shot === 1).contiguous = contiguous
}

writeFileSync(resolve(RAW, 'cut.json'), JSON.stringify({ take: TAKE, beats: report }, null, 1))
const held = report.filter((r) => r.held_last_frame)
console.log(`cut: ${timing.beats.length} beats from take ${TAKE}; ${report.filter((r) => r.kind === 'slide').length} slides; footage shots ${report.filter((r) => r.kind === 'footage').length}`)
for (const r of report.filter((r) => r.kind === 'footage')) console.log(`  ${r.id.padEnd(8)} #${r.shot} ${r.cam} from clip ${String(r.clip_from).padStart(7)} s, ${String(r.seconds).padStart(6)} s${r.contiguous ? '  (continues the previous beat)' : ''}${r.held_last_frame ? `  HELD LAST FRAME ${r.held_last_frame} s` : ''}`)
if (held.length) console.log(`WARNING: ${held.length} shot(s) ran past the end of the clip and hold the last frame`)
