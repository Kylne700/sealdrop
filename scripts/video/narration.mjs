// Reads media/narration.md: `## n. title` opens a story step, `### id` a beat (one clip of the cut), other lines are sentences.
// A step without `###` headings gets one beat per sentence (those become one slide state each).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MEDIA, TTS_RESPELL } from './config.mjs'

export function parseNarration(md = readFileSync(resolve(MEDIA, 'narration.md'), 'utf8')) {
  const steps = []
  let step = null, beat = null
  for (const raw of md.split('\n')) {
    const line = raw.trim()
    let m
    if ((m = line.match(/^## (\d+)\. (.+)$/))) { step = { n: Number(m[1]), title: m[2], beats: [] }; steps.push(step); beat = null; continue }
    if ((m = line.match(/^### ([\w-]+)$/))) { beat = { id: m[1], step: step.n, sentences: [] }; step.beats.push(beat); continue }
    if (!line || line.startsWith('#') || !step) continue
    if (!beat) { // an unlabelled step: this sentence is its own beat
      step.beats.push({ id: `s${step.n}-${step.beats.length + 1}`, step: step.n, sentences: [line], single: true })
    } else beat.sentences.push(line)
  }
  return steps
}

export const wordCount = (steps) => steps.flatMap((s) => s.beats).flatMap((b) => b.sentences).join(' ').split(/\s+/).filter(Boolean).length

/** What the speech engine reads: the sentence with the respell pairs applied. */
export const spoken = (text) => TTS_RESPELL.reduce((t, [from, to]) => t.split(from).join(to), text)

/** Splits a sentence into caption chunks of at most `max` characters (one line of FilmCraft's caption box), preferring commas and colons. */
export function captionChunks(sentence, max = 52) {
  // a chunk that is still too long is cut at the space nearest its middle, recursively
  const fit = (c) => {
    if (c.length <= max) return [c]
    const mid = c.lastIndexOf(' ', Math.ceil(c.length / 2))
    const cut = mid > 0 ? mid : c.indexOf(' ', 1)
    return cut > 0 ? [...fit(c.slice(0, cut)), ...fit(c.slice(cut + 1))] : [c]
  }
  const out = []
  for (const p of sentence.split(/(?<=[,:;])\s+/)) {
    if (out.length && (out.at(-1) + ' ' + p).length <= max) out[out.length - 1] += ' ' + p
    else out.push(p)
  }
  return out.flatMap(fit)
}
