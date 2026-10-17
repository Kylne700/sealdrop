// Finishing pass and acceptance checks.
//   node scripts/video/post.mjs   (take: TAKE in config.mjs / environment)
// demo.mp4 from FilmCraft -> loudnorm (I=-16, TP=-1.5, measured pass then linear gain) -> metadata stripped -> media/demo.mp4,
// then: ffprobe limits, size, loudness, narration audible in every beat, silences, privacy-denylist counts (counts only),
// the contact sheet (one frame every 3 s) and the screenshots + cover. Exits 1 if any check fails.
import { copyFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FC_IN, FC_WORK, MAX_SECONDS, MEDIA, RAW, SEALDROP, TAKE } from './config.mjs'
import { denyCount, denyCountFile, round3, run } from './lib.mjs'

const timing = JSON.parse(readFileSync(resolve(RAW, 'timing.json'), 'utf8'))
const src = resolve(FC_IN, 'demo.mp4'), mixed = resolve(RAW, 'post-mixed.mp4'), out = resolve(MEDIA, 'demo.mp4')
const ff = (args, o) => run('ffmpeg', ['-y', '-hide_banner', '-nostdin', ...args], o)
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `: ${detail}` : ''}`) }
const json = (s) => JSON.parse(s.slice(s.lastIndexOf('{'), s.lastIndexOf('}') + 1))

// ---- 1. finish the mix: loudnorm I=-16 TP=-1.5 (measured pass, then applied with the measured values), AAC, metadata off.
// The AAC encode can overshoot the true-peak target by a fraction of a dB, so the target is lowered by the overshoot and the pass
// repeated (at most twice) until the finished file measures at or below -1.5 dBTP.
const ln = (tp) => `I=-16:TP=${tp}:LRA=11`
const m1 = json((await ff(['-i', src, '-vn', '-af', `loudnorm=${ln(-1.5)}:print_format=json`, '-f', 'null', '-'])).stderr)
const measured = `measured_I=${m1.input_i}:measured_TP=${m1.input_tp}:measured_LRA=${m1.input_lra}:measured_thresh=${m1.input_thresh}:offset=${m1.target_offset}`
let tpTarget = -1.5, m2, passes = 0
do {
  passes++
  await ff(['-i', src, '-map', '0:v', '-map', '0:a', '-c:v', 'copy', '-af', `loudnorm=${ln(tpTarget)}:${measured}:linear=true`, '-ar', '48000', '-c:a', 'aac', '-b:a', '160k', mixed])
  // metadata off, bit-exact muxing (no encoder tag), fast start
  await ff(['-i', mixed, '-map', '0', '-map_metadata', '-1', '-map_chapters', '-1', '-c', 'copy', '-movflags', '+faststart', '-fflags', '+bitexact', '-flags:v', '+bitexact', '-flags:a', '+bitexact', out])
  m2 = json((await ff(['-i', out, '-vn', '-af', `loudnorm=${ln(-1.5)}:print_format=json`, '-f', 'null', '-'])).stderr)
  if (Number(m2.input_tp) > -1.5) tpTarget = round3(tpTarget - (Number(m2.input_tp) + 1.5) - 0.05)
} while (Number(m2.input_tp) > -1.5 && passes < 3)

// ---- 2. container checks
const probe = JSON.parse((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,pix_fmt,color_space,sample_rate,channels', '-of', 'json', out])).stdout)
const v = probe.streams.find((s) => s.codec_type === 'video'), a = probe.streams.find((s) => s.codec_type === 'audio')
const dur = Number(probe.format.duration), size = Number(probe.format.size)
check('duration at most 170 s', dur <= MAX_SECONDS, `${dur.toFixed(1)} s`)
check('1280x720, H.264 + AAC', v.width === 1280 && v.height === 720 && v.codec_name === 'h264' && a?.codec_name === 'aac', `${v.width}x${v.height} ${v.codec_name} ${v.r_frame_rate} ${v.pix_fmt} ${v.color_space ?? ''} + ${a?.codec_name} ${a?.sample_rate} Hz ${a?.channels} ch`)
check('size under 25 MB', size < 25e6, `${(size / 1e6).toFixed(2)} MB`)

// ---- 3. loudness of the finished file
check('integrated loudness within 1 LU of -16 LUFS, true peak at most -1.5 dBTP', Math.abs(Number(m2.input_i) + 16) <= 1 && Number(m2.input_tp) <= -1.5, `${m2.input_i} LUFS, ${m2.input_tp} dBTP, LRA ${m2.input_lra} (loudnorm target TP ${tpTarget} after ${passes} pass(es); before: ${m1.input_i} LUFS, ${m1.input_tp} dBTP)`)

// ---- 4. narration audible in every beat (volumedetect per beat), no silence of 1.5 s or more
let at = 0, worst = { id: '', mean: 0 }
const weak = []
for (const b of timing.beats) {
  const r = await ff(['-ss', at.toFixed(3), '-t', (b.dur - 0.05).toFixed(3), '-i', out, '-vn', '-af', 'volumedetect', '-f', 'null', '-'])
  const mean = Number(/mean_volume: (-?[\d.]+) dB/.exec(r.stderr)?.[1] ?? -91)
  if (mean < -40) weak.push(`${b.id} ${mean}`)
  if (!worst.id || mean < worst.mean) worst = { id: b.id, mean }
  at += b.dur
}
check('narration audible in every beat (mean volume above -40 dB)', weak.length === 0, weak.length ? `quiet: ${weak.join(', ')}` : `quietest beat ${worst.id} at ${worst.mean} dB`)
const narrated = at
const sil = (await ff(['-i', out, '-vn', '-af', 'silencedetect=noise=-45dB:d=1.5', '-f', 'null', '-'])).stderr
const silences = [...sil.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]))
check('no dead air: no silence of 1.5 s or more anywhere', silences.length === 0, silences.length ? `starting at ${silences.join(', ')} s` : 'silencedetect -45 dB, 1.5 s')

// ---- 5. privacy: counts of denylist matches (the list is never printed)
// run in media/ with a bare file name: exiftool also prints the directory it was given, which is not file metadata
const meta = (await run('exiftool', ['-a', '-G1', 'demo.mp4'], { cwd: MEDIA })).stdout
const strs = (await run('strings', ['-a', '-n', '5', out])).stdout
const scripts = readdirSync(resolve(SEALDROP, 'scripts/video')).map((f) => resolve(SEALDROP, 'scripts/video', f))
const files = [resolve(MEDIA, 'narration.md'), resolve(FC_IN, 'plan.json'), resolve(FC_WORK, 'demo.captions.srt'), resolve(FC_WORK, 'demo.fcproj'), resolve(MEDIA, 'VIDEO-NOTES.md'), resolve(MEDIA, '.gitignore'), ...scripts].filter(existsSync)
const counts = { exiftool: await denyCount(meta), strings: await denyCount(strs) }
for (const f of files) counts[f.replace(SEALDROP + '/', '').replace(resolve(SEALDROP, '..') + '/', '../')] = await denyCountFile(f)
const pngs = []
for (const [from, to] of [['home', 'screenshot-1-home'], ['source', 'screenshot-2-source-verify'], ['newsroom-tip', 'screenshot-3-newsroom-tip'], ['receipt', 'screenshot-4-receipt']]) {
  const p = resolve(RAW, 'takes', TAKE, 'stills', `${from}.png`)
  if (existsSync(p)) { copyFileSync(p, resolve(MEDIA, `${to}.png`)); pngs.push(resolve(MEDIA, `${to}.png`)) }
}
if (existsSync(resolve(RAW, 'slides/cover.png'))) { copyFileSync(resolve(RAW, 'slides/cover.png'), resolve(MEDIA, 'cover.png')); pngs.push(resolve(MEDIA, 'cover.png')) }
for (const p of pngs) {
  counts[`exiftool ${p.split('/').at(-1)}`] = await denyCount((await run('exiftool', ['-a', '-G1', p.split('/').at(-1)], { cwd: MEDIA })).stdout)
  counts[`strings ${p.split('/').at(-1)}`] = await denyCount((await run('strings', ['-a', '-n', '5', p])).stdout)
}
const dirty = Object.entries(counts).filter(([, n]) => n)
check('privacy denylist: 0 matches in mp4 metadata + strings, narration, plan, captions, project, scripts, PNGs', dirty.length === 0, dirty.length ? dirty.map(([k, n]) => `${k}=${n}`).join(', ') : `${Object.keys(counts).length} counts, all 0`)

// ---- 6. PNG sizes
const dims = async (p) => (await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', p])).stdout.trim()
const shots = pngs.filter((p) => /screenshot/.test(p))
const bad = []
for (const p of shots) if ((await dims(p)) !== '1280x720') bad.push(p.split('/').at(-1))
check(`${shots.length} screenshots at 1280x720 (3-4 wanted)`, shots.length >= 3 && shots.length <= 4 && bad.length === 0, bad.join(', '))
check('cover image 1200x630', existsSync(resolve(MEDIA, 'cover.png')) && (await dims(resolve(MEDIA, 'cover.png'))) === '1200x630')

// ---- 7. contact sheet, one frame every 3 s
const cols = 8, rows = Math.ceil(dur / 3 / cols)
await ff(['-i', out, '-vf', `fps=1/3,scale=240:135,tile=${cols}x${rows}:padding=3:margin=3:color=0x202020`, '-frames:v', '1', resolve(MEDIA, 'contact-sheet.png')])
check('contact sheet written', existsSync(resolve(MEDIA, 'contact-sheet.png')), `${cols}x${rows} tiles, 1 frame per 3 s`)

writeFileSync(resolve(RAW, 'post.json'), JSON.stringify({ take: TAKE, duration: round3(dur), size, narrated: round3(narrated), loudness_before: m1, loudness_after: m2, tp_target: tpTarget, silences, counts }, null, 1))
const failed = results.filter((r) => !r.ok)
console.log(failed.length ? `\n${failed.length} check(s) FAILED` : `\nall ${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
