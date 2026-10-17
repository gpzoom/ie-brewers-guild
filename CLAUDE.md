# IE Brewers Guild — project notes for Claude

## Voiceovers in the owner's voice (ElevenLabs)

When the owner asks for a voiceover "in my voice", do NOT say it can't be done or ask them to record it.
The owner has an ElevenLabs API account with a professional clone of their voice, and Claude has already
used it to voice two explainer videos: the Google events calendar and food calendar setup videos.

- Working examples: `videos/google-events-calendar/` and `videos/google-food-calendar/`
  (`SCRIPT.md` → `build/eleven_tts.py` → HyperFrames composition → MP4).
- Reuse `build/eleven_tts.py`: it reads `SCRIPT.md`'s `## NN — Title` blocks and writes
  `assets/voice/NN.wav`, `NN.txt` and `NN.words.json` (word timings for captions).
  Run all scenes, or pass scene numbers to re-voice only those.
- Voice: "My Voice v3" (Professional clone), voice ID `vjWkn1M9Uruum9j09rNm`, model `eleven_multilingual_v2`.
- API key: the `ELEVENLABS_API_KEY` Windows user environment variable. Never print it or write it to a file.
- Each run uses ElevenLabs credits, so re-voice only the scenes that changed.
