"""Make several takes of one scene with more expressive voice settings.

Usage: python build/takes.py 9
Writes assets/voice/takes/NN-takeK.{wav,txt,words.json}. Copy the chosen take's three files over NN.* to use it.
"""
import base64
import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import eleven_tts as tts

# stability down = more variation, style up = more dramatic; same voice and model as the other scenes
TAKES = [
    {"stability": 0.35, "style": 0.30},
    {"stability": 0.30, "style": 0.40},
    {"stability": 0.25, "style": 0.50},
]


def main():
    n = int(sys.argv[1])
    text = tts.scenes_from_script()[n]
    out_dir = os.path.join(tts.VOICE_DIR, "takes")
    os.makedirs(out_dir, exist_ok=True)
    for k, change in enumerate(TAKES, 1):
        tts.SETTINGS = {**tts.SETTINGS, **change}
        res = tts.speak(text)
        base = os.path.join(out_dir, f"{n:02d}-take{k}")
        with open(base + ".mp3", "wb") as f:
            f.write(base64.b64decode(res["audio_base64"]))
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", base + ".mp3", "-ar", "48000", "-ac", "1", base + ".wav"], check=True)
        os.remove(base + ".mp3")
        with open(base + ".txt", "w", encoding="utf-8", newline="\n") as f:
            f.write(text + "\n")
        words = tts.words_from_alignment(res["alignment"])
        with open(base + ".words.json", "w", encoding="utf-8", newline="\n") as f:
            json.dump(words, f, indent=2)
        print(f"take {k} (stability {change['stability']}, style {change['style']}): {words[-1]['end']:.1f}s")


if __name__ == "__main__":
    main()
