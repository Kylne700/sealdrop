#!/usr/bin/env bash
# Rebuilds the demo video from the recorded take: narration (TTS) -> slides -> footage cut -> edit plan -> FilmCraft render
# -> loudness finish, metadata strip and acceptance checks. The result is media/demo.mp4 (never committed).
#
#   VOICE=<n> bash scripts/video/build.sh        n = voice number in tools/tts-samples/KEY.md (default 3, Kokoro af_heart)
#
# The footage comes from media/raw/takes/<TAKE> (TAKE in config.mjs, or TAKE=<name> in the environment). Takes are kept
# locally and are not committed; a new voice only changes the narration, so the same take is cut again to the new timing.
# The two tool folders (TTS voices, FilmCraft) sit next to the repo as ../tools, or at VIDEO_TOOLS.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/../.."
TOOLS="${VIDEO_TOOLS:-$(cd .. && pwd)/tools}"
V=scripts/video

node "$V/tts.mjs"      # narration -> one WAV per beat + media/raw/timing.json (voice from VOICE)
node "$V/slides.mjs"   # slides for the story parts that are not screen footage
node "$V/cut.mjs"      # footage trimmed to the narration timing
node "$V/plan.mjs"     # edit plan for FilmCraft
python3 -I "$TOOLS/filmcraft/render.py" "$TOOLS/filmcraft/work/sealdrop/plan.json"   # FilmCraft, inside its sandbox
node "$V/post.mjs"     # loudness, metadata, checks, contact sheet, screenshots
