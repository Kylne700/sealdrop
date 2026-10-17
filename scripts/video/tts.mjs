// Narration -> audio. Reads media/narration.md, speaks every sentence with the voice picked by VOICE (config.mjs),
// joins the sentences of each beat with fixed silences, gains the whole track to -16 LUFS (true peak <= -1.5 dBTP)
// and writes one WAV per beat into FilmCraft's input folder plus timing.json (sentence offsets, caption cues).
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { END_TAIL, FC_IN, GAP, RAW, SAY, TAIL, TAILS, TOOLS, VOICE, VOICES } from './config.mjs'
import { round3, run, sha1, wavSamples } from './lib.mjs'
import { captionChunks, parseNarration, spoken, wordCount } from './narration.mjs'

const v = VOICES[VOICE]
if (!v) throw new Error(`VOICE=${VOICE} is not in the table (1-6, see tools/tts-samples/KEY.md)`)
const dir = resolve(RAW, 'tts', `v${VOICE}`)
mkdirSync(dir, { recursive: true })
mkdirSync(FC_IN, { recursive: true })
const ff = (args) => run('ffmpeg', ['-y', '-v', 'error', '-nostdin', ...args])
const A = ['-ar', '48000', '-ac', '1', '-c:a', 'pcm_s16le', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-map_metadata', '-1']

const steps = parseNarration()
const beats = steps.flatMap((s) => s.beats)
const jobs = beats.flatMap((b) => b.sentences.map((text, k) => ({ beat: b, k, text })))

async function speak(text, out) {
  const abs = (p) => resolve(TOOLS, p)
  const args = ['-I', SAY, '--engine', v.engine, '--model', abs(v.model)]
  if (v.engine === 'kokoro') args.push('--voices', abs(v.voices), '--voice', v.voice, '--lang', v.lang, '--speed', String(v.speed))
  await run(abs(v.py), [...args, '--out', out], { input: spoken(text) + '\n' })
}

// one say.py call per sentence (exact durations for captions); results are cached by text + voice settings
let next = 0
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++]
    const key = sha1(JSON.stringify([v, spoken(j.text)]))
    j.raw = resolve(dir, `s-${key}.wav`)
    j.wav = resolve(dir, `s-${key}.48k.wav`)
    if (!existsSync(j.wav)) {
      await speak(j.text, j.raw)
      // trim the engine's lead/tail silence to a fixed 30/60 ms so GAP and TAIL alone set the pauses
      await ff(['-i', j.raw, '-af', 'silenceremove=start_periods=1:start_silence=0.03:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_silence=0.06:start_threshold=-45dB,areverse', ...A, j.wav])
    }
    j.samples = wavSamples(j.wav)
  }
}))

const silence = async (name, s) => { const p = resolve(dir, name); await ff(['-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=mono', '-t', String(s), ...A, p]); return p }
const gapWav = await silence(`gap-${GAP}.wav`, GAP)
const gapN = Math.round(GAP * 48000)
const lastBeat = beats.at(-1)
const tailOf = (b) => (b === lastBeat ? END_TAIL : TAILS[b.id] ?? TAIL) // silence after the beat's last sentence, in seconds
const tailWavs = {}
for (const b of beats) tailWavs[tailOf(b)] ??= await silence(`tail-${tailOf(b)}.wav`, tailOf(b))

// ---- join each beat: sentence, gap, sentence, ..., tail (concat demuxer on identical PCM = no re-encode)
const lufs = {}
for (const b of beats) {
  const mine = jobs.filter((j) => j.beat === b)
  const list = mine.flatMap((j, i) => (i ? [gapWav, j.wav] : [j.wav])).concat(tailWavs[tailOf(b)])
  b.joined = resolve(dir, `beat-${b.id}.raw.wav`)
  const listFile = resolve(dir, `beat-${b.id}.txt`)
  writeFileSync(listFile, list.map((f) => `file '${f}'`).join('\n') + '\n')
  await ff(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', b.joined])
  let at = 0
  b.timing = mine.map((j, i) => {
    if (i) at += gapN
    const t0 = at / 48000
    at += j.samples
    return { text: j.text, t0: round3(t0), t1: round3(at / 48000) }
  })
  b.dur = round3((at + Math.round(tailOf(b) * 48000)) / 48000)
}

// ---- level: one linear gain for the whole track, so every beat keeps its relative loudness
const master = resolve(dir, 'master.raw.wav')
const masterList = resolve(dir, 'master.txt')
writeFileSync(masterList, beats.map((b) => `file '${b.joined}'`).join('\n') + '\n')
await ff(['-f', 'concat', '-safe', '0', '-i', masterList, '-c', 'copy', master])
const m = await run('ffmpeg', ['-nostdin', '-hide_banner', '-i', master, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'])
const j = JSON.parse(m.stderr.slice(m.stderr.lastIndexOf('{'), m.stderr.lastIndexOf('}') + 1))
let gain = -16 - Number(j.input_i)
if (Number(j.input_tp) + gain > -1.5) gain = -1.5 - Number(j.input_tp)
for (const b of beats) {
  b.file = resolve(FC_IN, `narr-${b.id}.wav`)
  await ff(['-i', b.joined, '-af', `volume=${gain.toFixed(2)}dB`, ...A, b.file])
}

// ---- caption cues: each sentence is cut at commas/colons; time is shared by character count
for (const b of beats) {
  b.cues = b.timing.flatMap((s) => {
    const parts = captionChunks(s.text), total = parts.reduce((n, p) => n + p.length, 0)
    let t = s.t0
    return parts.map((text) => { const t0 = t; t += ((s.t1 - s.t0) * text.length) / total; return { text, t0: round3(t0), t1: round3(t) } })
  })
}

const out = { voice: VOICE, label: v.label, speed: v.speed ?? null, gain_db: round3(gain), measured: { i: j.input_i, tp: j.input_tp, lra: j.input_lra },
  beats: beats.map((b) => ({ id: b.id, step: b.step, file: b.file, dur: b.dur, timing: b.timing, cues: b.cues })) }
writeFileSync(resolve(dir, 'timing.json'), JSON.stringify(out, null, 1))
copyFileSync(resolve(dir, 'timing.json'), resolve(RAW, 'timing.json'))
const total = beats.reduce((n, b) => n + b.dur, 0)
console.log(`tts: voice ${VOICE} (${v.label}), ${wordCount(steps)} words, ${beats.length} beats, ${total.toFixed(1)} s of narration incl. pauses, gain ${gain.toFixed(2)} dB (in: ${j.input_i} LUFS, ${j.input_tp} dBTP)`)
for (const s of steps) console.log(`  step ${s.n} ${s.title}: ${s.beats.reduce((n, bb) => n + beats.find((x) => x.id === bb.id).dur, 0).toFixed(1)} s`)
