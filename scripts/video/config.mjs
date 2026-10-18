// Shared settings for the demo-video pipeline. Paths are derived from this file's location, never hard-coded:
// the repo sits next to a `tools/` folder (TTS voices, FilmCraft) that is not part of the repo.
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
export const SEALDROP = resolve(HERE, '../..')
export const TOOLS = process.env.VIDEO_TOOLS ?? resolve(SEALDROP, '../tools')
export const MEDIA = resolve(SEALDROP, 'media')
export const RAW = resolve(MEDIA, 'raw') // gitignored: builds, takes, frames, intermediate audio
export const FC_WORK = resolve(TOOLS, 'filmcraft/work') // the only folder FilmCraft's sandbox can see
export const FC_IN = resolve(FC_WORK, 'sealdrop')
export const DENYLIST = resolve(TOOLS, 'privacy-denylist.txt')

// ---- THE NARRATOR: one variable. Numbers are the voice numbers in tools/tts-samples/KEY.md.
// Change it with the environment (`VOICE=2 bash scripts/video/build.sh`) or by editing the default here.
export const VOICE = Number(process.env.VOICE ?? 3)

const kokoro = (voice, lang = 'en-us') => ({
  engine: 'kokoro', py: 'tts-kokoro/.venv/bin/python', model: 'tts-voices/kokoro-v1.0/kokoro-v1.0.onnx',
  voices: 'tts-voices/kokoro-v1.0/voices-v1.0.bin', voice, lang, speed: 0.92, // a calm pace; 1.0 sounds hurried
})
const piper = (dir, name) => ({ engine: 'piper', py: 'tts/.venv/bin/python', model: `tts-voices/${dir}/${name}.onnx` })
export const VOICES = {
  1: { label: 'piper en_US-ljspeech-high', ...piper('piper-en_US-ljspeech-high', 'en_US-ljspeech-high') },
  2: { label: 'piper en_GB-cori-high', ...piper('piper-en_GB-cori-high', 'en_GB-cori-high') },
  3: { label: 'Kokoro af_heart', ...kokoro('af_heart') },
  4: { label: 'Kokoro af_bella', ...kokoro('af_bella') },
  5: { label: 'Kokoro am_fenrir', ...kokoro('am_fenrir') },
  6: { label: 'Kokoro bf_emma', ...kokoro('bf_emma', 'en-gb') },
}
export const SAY = resolve(TOOLS, 'tts-kokoro/say.py')

// The recorded take the footage is cut from (media/raw/takes/<TAKE>, kept locally, never committed). It does not depend on the voice.
export const TAKE = process.env.TAKE ?? 'live3'

// Spelled differently for the speech engine than on screen. Add a pair only when the printed phonemes sound wrong.
// Checked with Kokoro's tokenizer: Arkiv, Sealdrop, Tiramisu, WebSocket, ciphertext, SecureDrop are fine as written.
// "subpoena" came out as soo-PEE-nuh (long u); "suppena" gives the right suh-PEE-nuh. The path is spoken as words.
export const TTS_RESPELL = [['arkiv/friction.md', 'arkiv slash friction dot M D'], ['subpoena', 'suppena']]

// Timeline constants (seconds). TAIL also hosts the dissolve into the next segment, so keep it >= the dissolve.
export const GAP = 0.3 // silence between sentences inside one beat
export const TAIL = 0.4 // silence after the last sentence of a beat
export const END_TAIL = 1.2 // the closing card stays this long after the last word (kept under the 1.5 s dead-air limit)
export const TAILS = { explorer: 1.3 } // beats that linger longer: the explorer view stays up so the ciphertext can be read (all under 1.5 s)
export const DISSOLVE = 0.3
export const MAX_SECONDS = 170
export const FPS = 30
export const W = 1280
export const H = 720

// Public pages shown on the end card. The live URL is the planned GitHub Pages address from HANDOFF.md.
export const REPO_URL = 'github.com/Kylne700/sealdrop'
export const LIVE_URL = 'kylne700.github.io/sealdrop'
