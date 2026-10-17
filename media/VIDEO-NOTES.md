# Demo video notes

`media/demo.mp4` is built locally and is **not committed** (`media/.gitignore` keeps `*.mp4`, `*.webm` and `raw/` out of git). Where it is hosted is the lead's decision; nothing was uploaded or published.

## Regenerate (one command, any narrator)

```
VOICE=<n> bash scripts/video/build.sh
```

`<n>` is the voice number in `tools/tts-samples/KEY.md` (1 piper ljspeech-high, 2 piper cori-high, 3 Kokoro `af_heart` = the default, 4 `af_bella`, 5 `am_fenrir`, 6 `bf_emma`). The default lives in one place, `scripts/video/config.mjs` (`VOICE`). The command re-voices `media/narration.md`, redraws the slides, re-cuts the footage to the new timing, re-renders with FilmCraft inside its sandbox, finishes the audio and runs every check. A different voice changes only the narration; the same recorded take is cut again. It needs `../tools/` next to the repo (TTS voices, FilmCraft; `VIDEO_TOOLS=<dir>` overrides) and the local take `media/raw/takes/<TAKE>` (`TAKE` in `config.mjs` or the environment; takes are local only, about 0.9 GB of raw material in `media/raw/`). Edit a line of `media/narration.md` and run the same command to change the words.

A new recording: `node scripts/video/take.mjs mock [name]` rehearses against the mock build (no RPC); `node scripts/video/take.mjs live [name]` is the real take on Tiramisu (needs the shared demo sender to hold at least 0.02 GLM and stays under 40 `arkiv_query` per hour; a take costs about 0.0052 GLM and 8 `arkiv_query`).

## What is in the video (about 156 s, 24 beats, narration in `media/narration.md`)

| Part | Seconds | Source |
|---|---|---|
| 1 Problem | 21 | slides from the app's design tokens |
| 2 What Sealdrop is | 23 | real footage of the app's home page |
| 3 Live demo | 60 | footage of the real take: create newsroom, create inbox, copy link, source verifies the inbox, writes and sends a tip, it arrives over the WebSocket, receipt, public Arkiv explorer |
| 4 How it uses Arkiv | 31 | slides |
| 5 Honest limits + end card | 21 | slides, end card with the repo and the live address |

Captions are burned in (FilmCraft); no music; narration is a synthetic voice (Kokoro). The video does not say so on screen: if the submission form asks about AI use, say it there.

## Real objects shown (take `live2`, Tiramisu testnet, chain 7738577, 2026-10-17 about 03:11 to 03:15 UTC)

- Throwaway newsroom (made in the browser, funded with 0.005 GLM by the shared demo sender): `0xa61585845a587242E03a5d26709ec5Bd806e9E64`
- Inbox entity: `0x1d7171010309379a9a6840179c15d9c7799d9877615423c03829172bd95f4059` (shown shortened as `0x1d71…4059`)
- Tip entity: `0x987fef404393bd88cbb5a9cd1edc16a1405626b5f74c767f151980da4cc5e655`, tip transaction `0x19556d8f6174782f6ad2392585ec5b5a5731f732d41a639e87ee83fdd5064392` (shown in the receipt and in the explorer)
- Explorer page shown: `https://data.arkiv.network/entity/0x987fef404393bd88cbb5a9cd1edc16a1405626b5f74c767f151980da4cc5e655` (ciphertext, `$creator` = shared demo sender, `$owner` = the newsroom, three attributes, readonly)
- Tip text: `SYNTHETIC TEST TIP: made-up message, nothing real.` (7-day lifetime; the tip expires 2026-10-24)
- Measured on that take: inbox created 15.2 s after the click, tip visible in the newsroom 4.2 s and receipt 5.8 s after Send.
- Take `live1` (same flow, tip entity `0x2709fc6b23222995cd912835ec22444a5fc6e0313d47a23af3a3f58c95c5ec0f`, transaction `0x6922e9c6592789b889d4dbcd3e211f985f3ff8ad80230f6efa7707428c3cd487`) is real too but not used: the pointer lagged the narration in one beat, so the take script was fixed and the take repeated.
- Nothing in the video comes from the mock build; mock takes (`mock1` to `mock9`) were rehearsals only.
- RPC cost of the two live takes: 8 `arkiv_query` each (64 requests, 3 transactions each), no 429. The shared demo sender held 2.81 GLM before the first take. The Demo Desk inbox was not touched or renewed.

## Checks (`scripts/video/post.mjs`, all passed on the final build)

ffprobe 156.0 s (limit 170), 1280x720, H.264 30 fps yuv420p bt709, AAC 48 kHz stereo, 10.64 MB (limit 25); loudness -16.03 LUFS, true peak -1.52 dBTP, LRA 2.5 (loudnorm I=-16 TP=-1.5, measured pass then linear; the target peak was lowered to -1.71 after the AAC encode overshot); quietest beat -19.4 dB mean (`volumedetect` per beat; all above -40); no silence of 1.5 s or more (`silencedetect` -45 dB); privacy denylist: 28 counts, all 0 (mp4 metadata via `exiftool`, `strings`, narration, plan, captions, FilmCraft project, every script, every PNG; plus the page text of the newsroom, source and explorer pages before and after each recorded step); 4 screenshots 1280x720, `cover.png` 1200x630, `contact-sheet.png` (one frame every 3 s).

## Disclosures

- **Recording method.** Headless Chromium with `puppeteer-core`, a fresh temporary profile per run, no extensions, no logins; the desktop, terminal and the user's own browser are never captured. Frames come from the DevTools screencast (JPEG frames with renderer timestamps), used instead of Playwright's `recordVideo` so that every frame has a timestamp and the three pages (A newsroom, B source, E explorer) can be cut on one wall clock; encoded 30 fps constant frame rate, H.264 CRF 14.
- **Injected overlay.** The visible cursor and the click ripple are drawn by the recording script into the page; the app has no such code.
- **Real clicks, shortened waits.** Every action in the live part is a real click on the real app against the real chain. Chain waits are removed with jump cuts (inbox creation about 15 s, tip send about 6 s); the cut jumps from the click to the result. The explorer clip was recorded about 2.5 minutes after the tip, after the take had waited 40 s for the explorer to index the entity, and shows that same entity.
- **Two windows, one story.** The newsroom (A) and the source (B) are two separate headless pages recorded at the same time; the cut alternates between them. It is not a screen recording of one desktop.
- **Local address in the link field.** The app was served by a local static server from the production build of the repo HEAD (`2983c90`), so the inbox link on screen starts with `http://127.0.0.1:<port>/sealdrop/`. The end card shows `github.com/Kylne700/sealdrop` and `kylne700.github.io/sealdrop`; the second is the planned Pages address (NOT VERIFIED that it is live when this was written).
- **Tooling beyond FilmCraft.** FilmCraft (v0.8.0, run only through `tools/filmcraft/fc-sandbox.sh`) edits: one segment per beat, captions, 0.3 s cross-dissolves, hold-to-audio, H.264/AAC export. The FilmCraft plan has no trim or speed change (spike finding) and the brief asks for a `loudnorm` finish, so ffmpeg does: trimming and transcoding the recorded footage to the narration timing, turning slide PNGs into clips, the final `loudnorm` pass with the metadata strip, the stills and the contact sheet.
- **Narration.** 408 words (the brief aimed at 330 to 380); a synthetic voice, Kokoro `af_heart` (Apache-2.0 weights; the author states part of the training data is synthetic; see `tools/tts-samples/KEY.md`). Pronunciation was checked with Kokoro's phonemes; only `subpoena` is respelled (`suppena`) and the path `arkiv/friction.md` is spoken as words. `en_US-lessac-medium` is not used (licence).
- **"Anonymous".** The app's home page says "An anonymous tip line with no server to seize" (visible in the video); the narration avoids the word on purpose, because the README limits say the RPC node and the WebSocket see the sender's IP address. The lead may want the page and the narration to agree.
- **Slides** are rendered by `scripts/video/slides.mjs` from the app's own colours, fonts and mark; the cover is `media/cover.png`.

## NOT VERIFIED

- Nobody listened to the final mix and nobody watched it in a real player: checks are ffprobe, loudness and silence measurements, and frames read by eye (contact sheet and key frames).
- Dissolve and pointer motion were judged from frames and event timings, not played back.
- Whether the live address on the end card works; where the video will be hosted and in which form the submission wants it.
- The `piper` voices 1 and 2 need `tools/tts/.venv`; the six voices were checked for licence, not for fit to this script.

## Files

`scripts/video/`: `take.mjs` (recording of the story), `recorder.mjs` (browser, screencast, cursor, privacy dumps), `narration.mjs` + `tts.mjs` (narration to timed WAVs), `slides.mjs`, `cut.mjs` (footage per beat), `plan.mjs` (FilmCraft plan), `post.mjs` (loudness, metadata, checks, stills, contact sheet), `config.mjs` (the one place for voice, take, timing), `build.sh` (the single command).
