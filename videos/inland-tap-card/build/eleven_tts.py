"""Voice scenes from SCRIPT.md with ElevenLabs, writing assets/voice/NN.{txt,wav,words.json}.

Usage:  python build/eleven_tts.py            # all scenes
        python build/eleven_tts.py 1 5 11     # just these scenes

The API key comes from ELEVENLABS_API_KEY (environment, or the Windows user
environment when this process started before it was saved). It is never printed.
"""
import base64
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request

VOICE_ID = "vjWkn1M9Uruum9j09rNm"  # "My Voice v3" (Professional clone)
MODEL = "eleven_multilingual_v2"
SETTINGS = {"stability": 0.45, "similarity_boost": 0.85, "style": 0.15, "use_speaker_boost": True, "speed": 1.0}

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICE_DIR = os.path.join(ROOT, "assets", "voice")


def api_key():
    k = os.environ.get("ELEVENLABS_API_KEY")
    if not k and sys.platform == "win32":
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, "Environment") as reg:
            k = winreg.QueryValueEx(reg, "ELEVENLABS_API_KEY")[0]
    if not k:
        sys.exit("ELEVENLABS_API_KEY is not set")
    return k


def scenes_from_script():
    """{scene number: narration text} from SCRIPT.md's '## NN — Title' blocks."""
    text = open(os.path.join(ROOT, "SCRIPT.md"), encoding="utf-8").read()
    out = {}
    for m in re.finditer(r"^## (\d\d) [^\n]*\n(.*?)(?=^## |\Z)", text, re.S | re.M):
        body = " ".join(line.strip() for line in m.group(2).strip().splitlines() if line.strip())
        out[int(m.group(1))] = re.sub(r"\s+", " ", body).replace(" .", ".")
    return out


def speak(text):
    body = {"text": text, "model_id": MODEL, "voice_settings": SETTINGS}
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}/with-timestamps?output_format=mp3_44100_192",
        data=json.dumps(body).encode(), headers={"xi-api-key": api_key(), "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        sys.exit(f"ElevenLabs error {e.code}: {e.read()[:400].decode(errors='replace')}")


def words_from_alignment(al):
    """Character timings -> [{id, text, start, end}], quotes dropped so captions stay clean."""
    chars, starts, ends = al["characters"], al["character_start_times_seconds"], al["character_end_times_seconds"]
    words, cur = [], None
    for ch, s, e in zip(chars, starts, ends):
        if ch.isspace():
            if cur:
                words.append(cur)
            cur = None
            continue
        if cur is None:
            cur = {"text": "", "start": s, "end": e}
        cur["text"] += ch
        cur["end"] = e
    if cur:
        words.append(cur)
    out = []
    for w in words:
        t = w["text"].replace('"', "").replace("“", "").replace("”", "")
        if re.search(r"\w", t):
            out.append({"id": f"w{len(out)}", "text": t, "start": round(w["start"], 3), "end": round(w["end"], 3)})
    return out


def main():
    script = scenes_from_script()
    wanted = [int(a) for a in sys.argv[1:]] or sorted(script)
    for n in wanted:
        text = script[n]
        res = speak(text)
        mp3 = os.path.join(VOICE_DIR, f"{n:02d}.mp3")
        with open(mp3, "wb") as f:
            f.write(base64.b64decode(res["audio_base64"]))
        wav = os.path.join(VOICE_DIR, f"{n:02d}.wav")
        subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", mp3, "-ar", "48000", "-ac", "1", wav], check=True)
        os.remove(mp3)
        with open(os.path.join(VOICE_DIR, f"{n:02d}.txt"), "w", encoding="utf-8", newline="\n") as f:
            f.write(text + "\n")
        words = words_from_alignment(res["alignment"])
        with open(os.path.join(VOICE_DIR, f"{n:02d}.words.json"), "w", encoding="utf-8", newline="\n") as f:
            json.dump(words, f, indent=2)
        print(f"scene {n:02d}: {words[-1]['end']:.1f}s, {len(words)} words")


if __name__ == "__main__":
    main()
