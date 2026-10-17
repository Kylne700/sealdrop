// FilmCraft edit plan: one segment per narration beat (video + narration + burned-in captions); the last beat shows the end card.
//   node scripts/video/plan.mjs      reads media/raw/timing.json + media/raw/cut.json, writes tools/filmcraft/work/sealdrop/plan.json
// FilmCraft cross-dissolves at every cut that is not a continuation of the same camera. Run it with
//   python3 -I tools/filmcraft/render.py tools/filmcraft/work/sealdrop/plan.json   (build.sh does this)
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DISSOLVE, FC_IN, FPS, H, MAX_SECONDS, RAW, TOOLS, W } from './config.mjs'
import { denyCountFile, round3 } from './lib.mjs'

const timing = JSON.parse(readFileSync(resolve(RAW, 'timing.json'), 'utf8'))
const cut = JSON.parse(readFileSync(resolve(RAW, 'cut.json'), 'utf8'))
const continues = new Set(cut.beats.filter((r) => r.kind === 'footage' && r.shot === 1 && r.contiguous).map((r) => r.id))
const dissolve = { type: 'Cross Dissolve', seconds: DISSOLVE }

// Punch-in zooms (FilmCraft Motion keyframes). Stock render.py has no zoom: scripts/video/render-zoom.diff adds it (see VIDEO-NOTES.md).
// t0/t1 are seconds into the beat's footage, which is cut at fixed offsets from the pointer events, so they hold for every voice;
// cx/cy = focus point (0-1), the window stays inside the frame. Without the patch (or with ZOOM=0) the video is built without zooms.
const ZOOM = {
  verify: [{ t0: 2.9, t1: 6.5, scale: 1.3, cx: 0.5, cy: 0.4, ramp: 0.5 }], // the creator-verified card (pointer reaches it at 3.9 s)
  arrive: [{ t0: 0.8, t1: 6.6, scale: 1.3, cx: 0.5, cy: 0.45, ramp: 0.5 }], // the tip arriving live (it appears at 1.2 s)
  explorer: [{ t0: 2.5, t1: 3.8, scale: 1.5, cx: 0.67, cy: 0.556, ramp: 0.4 }], // the ciphertext hexdump (the page has scrolled at 2.6 s); at 1.5 the window starts between the page's two columns; full frame again when "a few attributes" is spoken (3.4 s)
}
const renderPy = resolve(TOOLS, 'filmcraft/render.py')
const canZoom = process.env.ZOOM !== '0' && existsSync(renderPy) && readFileSync(renderPy, 'utf8').includes('def zoom_keys')
// a window must end before the beat does (the last frame is held for the dissolve) and be longer than its two ramps
const zoomFor = (b) => (canZoom ? (ZOOM[b.id] ?? []).map((z) => ({ ...z, t1: round3(Math.min(z.t1, b.dur - 0.12)) })).filter((z) => z.t1 - z.t0 > 2 * z.ramp + 0.2) : [])

const segments = timing.beats.map((b, i) => ({
  video: `sealdrop/v-${b.id}.mp4`,
  audio: `sealdrop/narr-${b.id}.wav`,
  hold_to_audio: true,
  captions: b.cues.map((c) => ({ text: c.text, t0: c.t0, t1: c.t1 })),
  ...(zoomFor(b).length ? { zoom: zoomFor(b) } : {}),
  ...(i > 0 && !continues.has(b.id) ? { transition: dissolve } : {}),
}))

const total = timing.beats.reduce((n, b) => n + b.dur, 0)
if (total > MAX_SECONDS) throw new Error(`the video would be ${total.toFixed(1)} s, over the ${MAX_SECONDS} s limit`)
const plan = { out: 'sealdrop/demo.mp4', width: W, height: H, fps: FPS, crf: Number(process.env.CRF ?? 22), segments }
const file = resolve(FC_IN, 'plan.json')
writeFileSync(file, JSON.stringify(plan, null, 1))
const hits = await denyCountFile(file)
console.log(`plan: ${segments.length} segments, ${round3(total)} s, ${segments.filter((s) => s.transition).length} dissolves, ${segments.filter((s) => s.zoom).length} zooms${canZoom ? '' : ' (none: render.py has no zoom patch or ZOOM=0)'}, crf ${plan.crf}, denylist matches in the plan: ${hits}`)
if (hits) throw new Error('the edit plan matches the privacy denylist')
