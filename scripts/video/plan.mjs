// FilmCraft edit plan: one segment per narration beat (video + narration + burned-in captions); the last beat shows the end card.
//   node scripts/video/plan.mjs      reads media/raw/timing.json + media/raw/cut.json, writes tools/filmcraft/work/sealdrop/plan.json
// FilmCraft cross-dissolves at every cut that is not a continuation of the same camera. Run it with
//   python3 -I tools/filmcraft/render.py tools/filmcraft/work/sealdrop/plan.json   (build.sh does this)
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DISSOLVE, FC_IN, FPS, H, MAX_SECONDS, RAW, W } from './config.mjs'
import { denyCountFile, round3 } from './lib.mjs'

const timing = JSON.parse(readFileSync(resolve(RAW, 'timing.json'), 'utf8'))
const cut = JSON.parse(readFileSync(resolve(RAW, 'cut.json'), 'utf8'))
const continues = new Set(cut.beats.filter((r) => r.kind === 'footage' && r.shot === 1 && r.contiguous).map((r) => r.id))
const dissolve = { type: 'Cross Dissolve', seconds: DISSOLVE }

const segments = timing.beats.map((b, i) => ({
  video: `sealdrop/v-${b.id}.mp4`,
  audio: `sealdrop/narr-${b.id}.wav`,
  hold_to_audio: true,
  captions: b.cues.map((c) => ({ text: c.text, t0: c.t0, t1: c.t1 })),
  ...(i > 0 && !continues.has(b.id) ? { transition: dissolve } : {}),
}))

const total = timing.beats.reduce((n, b) => n + b.dur, 0)
if (total > MAX_SECONDS) throw new Error(`the video would be ${total.toFixed(1)} s, over the ${MAX_SECONDS} s limit`)
const plan = { out: 'sealdrop/demo.mp4', width: W, height: H, fps: FPS, crf: Number(process.env.CRF ?? 22), segments }
const file = resolve(FC_IN, 'plan.json')
writeFileSync(file, JSON.stringify(plan, null, 1))
const hits = await denyCountFile(file)
console.log(`plan: ${segments.length} segments, ${round3(total)} s, ${segments.filter((s) => s.transition).length} dissolves, crf ${plan.crf}, denylist matches in the plan: ${hits}`)
if (hits) throw new Error('the edit plan matches the privacy denylist')
