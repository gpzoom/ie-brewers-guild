"""Builds the HyperFrames compositions for "Your food vendor calendar, Google".

Writes compositions/frames/NN-*.html (one sub-composition per scene),
compositions/captions.html and index.html from the voice clips' real
lengths and word timings (assets/voice/NN.wav + NN.words.json).

Run from the project root:  python build/build.py
"""
import json
import re
import os
import subprocess
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

LEAD = 0.5  # seconds of picture before the voice starts in every scene
TAIL = {1: 1.0, 2: 0.9, 3: 1.1, 4: 1.1, 5: 1.3, 6: 2.4}

SCENES = [
    (1, "promise"), (2, "two-steps"), (3, "add-vendors"),
    (4, "paste-link"), (5, "food-week"), (6, "keep-going"),
]


def wav_len(path):
    with wave.open(path, "rb") as w:
        return w.getnframes() / float(w.getframerate())


VOICE = {n: round(wav_len(f"assets/voice/{n:02d}.wav"), 3) for n, _ in SCENES}
WORDS = {n: json.load(open(f"assets/voice/{n:02d}.words.json", encoding="utf-8")) for n, _ in SCENES}
DUR = {n: round(LEAD + VOICE[n] + TAIL[n], 2) for n, _ in SCENES}
START = {}
t = 0.0
for n, _ in SCENES:
    START[n] = round(t, 2)
    t += DUR[n]
TOTAL = round(t, 2)


def cue(n, word, occurrence=1):
    """Scene-local time a spoken word starts (LEAD + its start in the clip).
    word may be a tuple of alternatives, e.g. ("OK", "okay")."""
    alts = {re.sub(r"[^\w']", "", a).lower() for a in (word if isinstance(word, tuple) else (word,))}
    seen = 0
    for w in WORDS[n]:
        if re.sub(r"[^\w']", "", w["text"]).lower() in alts:
            seen += 1
            if seen == occurrence:
                return round(LEAD + w["start"], 2)
    raise KeyError(f"scene {n}: word {word!r} #{occurrence} not found")


# ---------------------------------------------------------------- shared CSS
def base_css(s):
    """Scene CSS, every selector scoped to the scene root #s (styles are global once assembled)."""
    return f"""
@font-face {{ font-family: "Bricolage Grotesque"; src: url("assets/fonts/BricolageGrotesque-latin.woff2") format("woff2"); font-weight: 200 800; font-display: block; }}
@font-face {{ font-family: "Chivo"; src: url("assets/fonts/Chivo-latin.woff2") format("woff2"); font-weight: 100 900; font-display: block; }}
#{s} {{ position: absolute; inset: 0; width: 100%; height: 100%; background: #171410; overflow: hidden; font-family: "Chivo", system-ui, sans-serif; color: #F7F3EC; }}
#{s} .stage {{ position: absolute; inset: 0; }}
#{s} .glow {{ position: absolute; width: 1150px; height: 1150px; border-radius: 50%; background: radial-gradient(circle, rgba(232,145,58,0.24), rgba(232,145,58,0) 65%); }}
#{s} .step {{ position: absolute; left: 120px; top: 84px; font: 700 21px "Chivo"; letter-spacing: 0.16em; text-transform: uppercase; color: #E8913A; border: 2px solid #3A332C; border-radius: 99px; padding: 11px 22px; background: rgba(33,28,23,0.7); }}
#{s} .eyebrow {{ font: 700 21px "Chivo"; letter-spacing: 0.24em; text-transform: uppercase; color: #E8913A; }}
#{s} .h {{ font-family: "Bricolage Grotesque"; font-weight: 800; text-transform: uppercase; color: #F7F3EC; line-height: 1.02; letter-spacing: 0.01em; }}
#{s} .accent {{ color: #E8913A; }}
#{s} .sub {{ font: 400 34px/1.4 "Chivo"; color: #B6AC9D; }}
#{s} .mono {{ font-family: ui-monospace, Consolas, "Courier New", monospace; }}
#{s} .left {{ position: absolute; left: 120px; top: 230px; width: 500px; display: flex; flex-direction: column; gap: 26px; }}
#{s} .left .h {{ font-size: 76px; }}
#{s} .left .sub {{ font-size: 31px; }}
#{s} .panel {{ position: absolute; background: #FBF8F2; color: #241F1A; border-radius: 20px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.45); }}
#{s} .bar {{ height: 62px; display: flex; align-items: center; justify-content: space-between; padding: 0 30px; background: #EFEAE1; font: 600 20px "Chivo"; color: #6B6156; border-bottom: 2px solid #DED7CB; }}
#{s} .badge {{ font: 700 16px "Chivo"; letter-spacing: 0.14em; text-transform: uppercase; color: #6B6156; border: 2px solid #DED7CB; border-radius: 99px; padding: 5px 13px; background: #FBF8F2; }}
#{s} .lbl {{ font: 700 29px "Chivo"; color: #241F1A; }}
#{s} .small {{ font: 400 20px/1.4 "Chivo"; color: #6B6156; }}
#{s} .caps {{ font: 700 16px "Chivo"; letter-spacing: 0.1em; text-transform: uppercase; color: #6B6156; }}
#{s} .field {{ border: 2px solid #DED7CB; background: #fff; border-radius: 12px; padding: 15px 19px; font: 400 21px "Chivo"; color: #241F1A; min-height: 58px; }}
#{s} .btn {{ display: inline-flex; align-items: center; gap: 11px; height: 58px; padding: 0 25px; border-radius: 12px; border: 2px solid #D3CBBD; background: #FBF8F2; font: 600 20px "Chivo"; color: #241F1A; }}
#{s} .btn.dark {{ background: #241F1A; color: #fff; border-color: #241F1A; }}
#{s} .ringed {{ box-shadow: 0 0 0 7px #E8913A; }}
#{s} .ring {{ position: absolute; border-radius: 14px; box-shadow: 0 0 0 7px #E8913A; pointer-events: none; }}
#{s} .cursor {{ position: absolute; left: 0; top: 0; width: 44px; height: 44px; z-index: 20; }}
#{s} .page {{ position: absolute; background: #FBF8F2; color: #241F1A; border-radius: 10px; overflow: hidden; box-shadow: 0 24px 52px rgba(0,0,0,0.5); }}
#{s} .page .strip {{ display: flex; align-items: center; gap: 17px; height: 77px; padding: 0 34px; color: #fff; font: 600 20px "Chivo"; }}
#{s} .page .logo {{ width: 50px; height: 50px; border-radius: 10px; background: #fff; color: #6B6156; display: flex; align-items: center; justify-content: center; font: 700 19px "Chivo"; }}
#{s} .page .tear {{ margin: 0 13px; border-top: 3px dashed #D3CBBD; }}
#{s} .page .date {{ display: flex; flex-direction: column; align-items: center; padding: 21px 0 25px; }}
#{s} .page .m, #{s} .page .w {{ font: 700 18px "Chivo"; letter-spacing: 0.3em; color: #6B6156; }}
#{s} .page .d {{ font-family: "Bricolage Grotesque"; font-weight: 800; font-size: 160px; line-height: 0.95; letter-spacing: -0.03em; }}
#{s} .page .body {{ border-top: 2px solid #E6DFD2; margin: 0 34px; padding: 19px 0 27px; display: flex; flex-direction: column; gap: 9px; }}
#{s} .page .time {{ font: 600 20px "Chivo"; }}
#{s} .page .title {{ font-family: "Bricolage Grotesque"; font-weight: 800; font-size: 33px; line-height: 1.1; }}
#{s} .browser {{ position: absolute; border-radius: 20px; overflow: hidden; background: #211C17; box-shadow: 0 27px 66px rgba(0,0,0,0.55); border: 2px solid #3A332C; }}
#{s} .browser .top {{ height: 46px; display: flex; align-items: center; gap: 10px; padding: 0 19px; background: #2A241E; }}
#{s} .browser .top span {{ width: 13px; height: 13px; border-radius: 50%; background: #4A4238; }}
#{s} .browser .top em {{ margin-left: 19px; font: 400 17px "Chivo"; font-style: normal; color: #B6AC9D; background: #1D1914; border-radius: 99px; padding: 5px 19px; }}
"""


CURSOR_SVG = '<svg viewBox="0 0 24 24"><path d="M4 2l16 10-7 1.5L9.5 21z" fill="#241F1A" stroke="#fff" stroke-width="1.5"/></svg>'


def common_js(s, d):
    """Fade the scene in and out, and breathe its glow. Returns JS lines."""
    reps = max(0, int(d // 3.2) - 1)
    return f"""
tl.fromTo("#{s} .stage", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.45, ease: "power1.out" }}, 0);
tl.fromTo("#{s} .stage", {{ opacity: 1 }}, {{ opacity: 0, duration: 0.4, ease: "power1.in", immediateRender: false }}, {d - 0.4:.2f});
tl.fromTo("#{s} .glow", {{ scale: 1 }}, {{ scale: 1.12, duration: 3.2, ease: "sine.inOut", yoyo: true, repeat: {reps} }}, 0);
"""


def rise(sel, at, y=40, dur=0.6, ease="power3.out"):
    return f'tl.fromTo("{sel}", {{ opacity: 0, y: {y} }}, {{ opacity: 1, y: 0, duration: {dur}, ease: "{ease}" }}, {at:.2f});\n'


def slide(sel, at, x=-40, dur=0.6, ease="power3.out"):
    return f'tl.fromTo("{sel}", {{ opacity: 0, x: {x} }}, {{ opacity: 1, x: 0, duration: {dur}, ease: "{ease}" }}, {at:.2f});\n'


def pop(sel, at, dur=0.55):
    return f'tl.fromTo("{sel}", {{ opacity: 0, scale: 0.7 }}, {{ opacity: 1, scale: 1, duration: {dur}, ease: "back.out(2.2)" }}, {at:.2f});\n'


def fade(sel, at, to=1, frm=0, dur=0.4):
    return f'tl.fromTo("{sel}", {{ opacity: {frm} }}, {{ opacity: {to}, duration: {dur}, ease: "power1.inOut", immediateRender: false }}, {at:.2f});\n'


def show(sel, at):
    """Opacity 0 until `at`, then 1 (seek-safe)."""
    return f'tl.fromTo("{sel}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.01 }}, {at:.2f});\n'


def cursor_path(s, points, press_at=()):
    """points: [(time, x, y), ...] absolute in the scene. First point is where it appears."""
    js = f'tl.fromTo("#{s} .cursor", {{ opacity: 0, x: {points[0][1]}, y: {points[0][2]} }}, {{ opacity: 1, duration: 0.3 }}, {points[0][0]:.2f});\n'
    for (t0, x0, y0), (t1, x1, y1) in zip(points, points[1:]):
        js += f'tl.fromTo("#{s} .cursor", {{ x: {x0}, y: {y0} }}, {{ x: {x1}, y: {y1}, duration: {max(0.1, t1 - t0 - 0.06):.2f}, ease: "power2.inOut", immediateRender: false }}, {t0 + 0.05:.2f});\n'
    for p in press_at:
        js += f'tl.fromTo("#{s} .cursor svg", {{ scale: 1 }}, {{ scale: 0.8, duration: 0.1, ease: "power1.in", yoyo: true, repeat: 1, immediateRender: false }}, {p:.2f});\n'
    return js


def typing(sel, text, at, dur):
    """Types `text` into `sel` (seek-safe: text is derived from a tweened counter)."""
    t = json.dumps(text)
    return (
        f'(function () {{ const el = document.querySelector("{sel}"); const txt = {t}; const p = {{ n: 0 }};\n'
        f'  tl.fromTo(p, {{ n: 0 }}, {{ n: txt.length, duration: {dur}, ease: "none", immediateRender: false,\n'
        f'    onUpdate() {{ el.textContent = txt.slice(0, Math.round(p.n)); }} }}, {at:.2f});\n'
        f'  tl.set(el, {{ textContent: "" }}, 0); }})();\n'
    )


def page(strip, logo, name, month, day, weekday, time, title, extra_style=""):
    return f"""<div class="page" style="{extra_style}">
  <div class="strip" style="background:{strip}"><span class="logo">{logo}</span>{name}</div>
  <div class="tear"></div>
  <div class="date"><span class="m">{month}</span><span class="d" style="color:{strip}">{day}</span><span class="w">{weekday}</span></div>
  <div class="body"><div class="time">{time}</div><div class="title">{title}</div></div>
</div>"""


# ---------------------------------------------------------------- scenes
def food_row(wd, day, mon, title, time, desc="", cls="", style=""):
    """One day of "Food for the next week", drawn like the profile's card."""
    body = (f'<div style="font:700 30px \'Chivo\'">{title}</div>'
            f'<div style="font:400 22px \'Chivo\'; color:#6B6156">{time}</div>'
            + (f'<div style="font:400 21px/1.4 \'Chivo\'; color:#3A332C">{desc}</div>' if desc else ""))
    return f"""<div class="{cls}" style="display:flex; gap:26px; align-items:flex-start; background:#FFFFFF; color:#241F1A; border:2px solid #DED7CB; border-radius:18px; padding:22px 28px; box-shadow:0 20px 46px rgba(0,0,0,0.4); {style}">
      <div style="width:70px; flex-shrink:0; display:flex; flex-direction:column; align-items:center">
        <span style="font:700 16px 'Chivo'; letter-spacing:0.12em; color:#6B6156">{wd}</span>
        <span style="font-family:'Bricolage Grotesque'; font-weight:800; font-size:40px; line-height:1.05">{day}</span>
        <span style="font:700 16px 'Chivo'; letter-spacing:0.12em; color:#6B6156">{mon}</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:7px">{body}</div>
    </div>"""


PLAY_SVG = '<svg width="30" height="30" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="7.2" stroke="#E8913A" stroke-width="1.4"/><path d="M6.5 5.2v5.6L11 8z" fill="#E8913A"/></svg>'


def scene1(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-270px; top:-350px"></div>
<div class="stage">
  <div style="position:absolute; left:120px; top:170px; width:1000px; display:flex; flex-direction:column; gap:28px">
    <div class="eyebrow">ISC Brewers Guild · Member how-to</div>
    <div class="h" style="font-size:100px"><div class="l1">Food vendors.</div><div class="l2 accent">On your profile.</div></div>
    <div class="sub">Builds on your events calendar.</div>
    <div class="start" style="align-self:flex-start; display:flex; flex-direction:column; gap:10px; background:#211C17; border:3px solid #E8913A; border-radius:18px; padding:22px 28px">
      <div style="font:700 19px 'Chivo'; letter-spacing:0.18em; color:#E8913A">START HERE FIRST</div>
      <div style="display:flex; align-items:center; gap:14px; font:600 29px 'Chivo'; color:#F7F3EC">{PLAY_SVG}Watch how to connect a Google Calendar for EVENTS</div>
    </div>
  </div>
  <div style="position:absolute; right:150px; top:210px; width:520px; display:flex; flex-direction:column; gap:22px">
    {food_row("THU", "1", "OCT", "Tacos El Gordo", "5:00 – 9:00 pm", "Street tacos, fish tacos, burritos and tortas", cls="f1")}
    {food_row("FRI", "2", "OCT", "Pizza Pied Piper", "5:00 – 10:00 pm", "Fresh made pizza", cls="f2")}
  </div>
</div>"""
    js = common_js(s, d)
    js += slide(f"#{s} .eyebrow", 0.3)
    js += rise(f"#{s} .l1", c(1, "Want"), 50)
    js += rise(f"#{s} .f1", 0.6, 60, 0.7)
    js += rise(f"#{s} .f2", 1.0, 60, 0.7)
    js += rise(f"#{s} .l2", c(1, "Food", 2), 50)
    js += rise(f"#{s} .sub", c(1, "builds"), 30)
    js += pop(f"#{s} .start", c(1, "Haven't"))
    js += f'tl.fromTo("#{s} .start", {{ boxShadow: "0 0 0 0px rgba(232,145,58,0.55)" }}, {{ boxShadow: "0 0 0 16px rgba(232,145,58,0)", duration: 0.9, ease: "power1.out", repeat: 1, immediateRender: false }}, {c(1, "Watch"):.2f});\n'
    return html, js


def scene2(s, d):
    c = cue
    cards = [("1", "Add vendor visits", 'To your events calendar, tagged <span class="mono" style="color:#F7F3EC">#food</span>', ("Add", 1)),
             ("2", "Paste the same link", "On your Food page, in the Member Portal", ("paste", 1))]
    cells = ""
    for num, title, line, _ in cards:
        cells += f"""<div class="card c{num}" style="background:#211C17; border:3px solid #3A332C; border-radius:24px; padding:46px; height:430px; display:flex; flex-direction:column; gap:26px">
      <div class="h num" style="font-size:124px; color:#E8913A; line-height:0.9">{num}</div>
      <div style="font:700 48px/1.15 'Chivo'">{title}</div>
      <div style="font:400 29px/1.4 'Chivo'; color:#B6AC9D">{line}</div>
    </div>"""
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-380px; top:-500px"></div>
<div class="stage">
  <div class="h title" style="position:absolute; left:120px; top:120px; font-size:88px">Two steps.</div>
  <div style="position:absolute; left:120px; right:120px; top:320px; display:grid; grid-template-columns:repeat(2,1fr); gap:60px">{cells}</div>
</div>"""
    js = common_js(s, d)
    js += slide(f"#{s} .title", 0.35, -50)
    for num, _, _, word in cards:
        at = c(2, *word)
        js += rise(f"#{s} .c{num}", at - 0.15, 70, 0.6)
        js += pop(f"#{s} .c{num} .num", at)
    return html, js


def gpanel_bar(label):
    return f'<div class="bar"><span>{label}</span><span class="badge">simplified</span></div>'


def ring_js(s, sel, at, w=7):
    return f'tl.fromTo("#{s} {sel}", {{ boxShadow: "0 0 0 0px #E8913A" }}, {{ boxShadow: "0 0 0 {w}px #E8913A", duration: 0.3, immediateRender: false }}, {at:.2f});\n'


def unring_js(s, sel, at):
    return f'tl.to("#{s} {sel}", {{ boxShadow: "0 0 0 0px #E8913A", duration: 0.3 }}, {at:.2f});\n'


def scene3(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-460px; bottom:-600px"></div>
<div class="stage">
  <div class="step">Step 1 of 2 · Add your vendors</div>
  <div class="left">
    <div class="h head">Add <span class="mono accent" style="text-transform:none">#food</span></div>
    <div class="sub path">The vendor's name in the title. A menu link, or a few words, in the description.</div>
  </div>
  <div class="panel gp" style="left:690px; top:163px; width:1110px; height:475px">
    {gpanel_bar("Google Calendar · Event")}
    <div style="padding:30px 42px; display:flex; flex-direction:column; gap:17px">
      <div class="ttl" style="align-self:flex-start; font:700 37px 'Chivo'; border-radius:10px; padding:2px 8px; margin-left:-8px">Tacos El Gordo</div>
      <div class="small">Thursday, October 1 · 5:00 – 9:00 pm · Bob's Brewery Events</div>
      <div class="field desc" style="line-height:1.55">
        <div>Delicious Mexican food featuring street tacos,</div>
        <div>fish tacos, burritos and tortas!</div>
        <div><span class="mono tag" style="font-weight:700; background:#FCE7D2; border-radius:6px; padding:0 6px"></span><span class="caret" style="display:inline-block; width:3px; height:26px; background:#241F1A; vertical-align:middle; margin-left:2px"></span></div>
      </div>
    </div>
  </div>
  <div style="position:absolute; left:690px; top:672px; width:1110px; display:grid; grid-template-columns:1fr 1fr; gap:27px">
    <div class="r1" style="background:#211C17; border:3px solid #E8913A; border-radius:16px; padding:19px 25px">
      <div style="font:700 25px 'Chivo'">Tacos El Gordo · <span class="mono">#food</span></div>
      <div style="font:600 21px 'Chivo'; color:#E8913A">✓ Food for the next week</div>
    </div>
    <div class="r2" style="background:#211C17; border:3px solid #3A332C; border-radius:16px; padding:19px 25px">
      <div style="font:700 25px 'Chivo'; color:#F7F3EC">VIP Members Party · <span class="mono">#guild</span></div>
      <div style="font:600 21px 'Chivo'; color:#B6AC9D">✓ Stays in Upcoming events</div>
    </div>
  </div>
</div>"""
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", c(3, "Step"), -50)
    js += rise(f"#{s} .gp", 0.45, 70, 0.7)
    name, menu, ty, only, stay = c(3, "name"), c(3, "menu"), c(3, "hashtag"), c(3, "Only"), c(3, "stay")
    js += rise(f"#{s} .path", c(3, "Put"), 24)
    js += f'tl.fromTo("#{s} .ttl", {{ backgroundColor: "rgba(252,231,210,0)" }}, {{ backgroundColor: "rgba(252,231,210,1)", duration: 0.3, immediateRender: false }}, {name:.2f});\n'
    js += f'tl.to("#{s} .ttl", {{ backgroundColor: "rgba(252,231,210,0)", duration: 0.3 }}, {menu:.2f});\n'
    js += ring_js(s, ".desc", menu)
    js += typing(f"#{s} .tag", "#food", ty, 0.6)
    blinks = max(0, int((d - 1) // 0.5) - 1)
    js += f'tl.fromTo("#{s} .caret", {{ opacity: 1 }}, {{ opacity: 0, duration: 0.25, ease: "steps(1)", yoyo: true, repeat: {blinks} }}, 0.6);\n'
    js += rise(f"#{s} .r1", only, 40, 0.55)
    js += rise(f"#{s} .r2", stay - 0.3, 40, 0.55)
    return html, js


def scene4(s, d):
    c = cue
    side = "".join(
        f'<div class="{"navfood" if n == "Food" else ""}" style="padding:10px 15px; border-radius:10px;{" background:#241F1A; color:#F9F6F0; font-weight:600;" if n == "Food" else ""}">{n}</div>'
        for n in ["Basics &amp; hours", "Logo &amp; cover", "Photos", "Events", "Food", "Links &amp; contact", "Theme", "People"])
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-500px; top:-560px"></div>
<div class="stage">
  <div class="step">Step 2 of 2 · Paste the same link</div>
  <div class="panel portal" style="left:120px; top:163px; width:1680px; height:700px; background:#F9F6F0">
    <div style="height:58px; background:#171410; display:flex; align-items:center; justify-content:space-between; padding:0 31px; font:600 17px 'Chivo'; letter-spacing:0.14em; color:#B6AC9D">ISC BREWERS GUILD · MEMBER PORTAL<span style="letter-spacing:0; font-weight:500; color:#F7F3EC">Bob's Brewery</span></div>
    <div style="display:flex; height:642px">
      <div style="width:288px; border-right:2px solid #EFEAE1; padding:27px 19px; display:flex; flex-direction:column; gap:7px; font:400 19px 'Chivo'">{side}</div>
      <div style="flex:1; padding:34px 42px; display:flex; flex-direction:column; gap:23px">
        <div style="font-family:'Bricolage Grotesque'; font-weight:700; font-size:44px">Food</div>
        <div class="box" style="position:relative; background:#fff; border:2px solid #DED7CB; border-radius:19px; padding:30px 35px; display:flex; flex-direction:column; gap:23px; min-height:300px">
          <div style="position:relative; height:110px">
            <div class="add" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:space-between; gap:27px">
              <div style="display:flex; flex-direction:column; gap:6px"><div style="font:600 24px 'Chivo'">Add a food calendar</div><div class="small" style="max-width:780px">Calendars connect by subscription link (ICS), which your calendar app updates on its own schedule.</div></div>
              <span class="btn addbtn">Add calendar</span>
            </div>
            <div class="conn" style="position:absolute; inset:0; display:flex; align-items:center; gap:27px">
              <div style="width:58px; height:58px; border-radius:13px; background:#EFEAE1; display:flex; align-items:center; justify-content:center; color:#6B6156; font:700 24px 'Chivo'">▦</div>
              <div style="flex:1; display:flex; flex-direction:column; gap:6px">
                <div style="font:600 25px 'Chivo'">Food calendar</div>
                <div class="small">calendar.google.com · importing vendors tagged <b style="color:#241F1A">#food</b></div>
                <div class="small" style="position:relative; height:28px">
                  <span class="st1" style="position:absolute; left:0; top:0; display:flex; align-items:center; gap:10px"><span style="width:12px; height:12px; border-radius:50%; background:#A89D8E"></span>Not yet synced · the site checks it automatically</span>
                  <span class="st2" style="position:absolute; left:0; top:0; display:flex; align-items:center; gap:10px"><span style="width:12px; height:12px; border-radius:50%; background:#4E9A4A"></span>Last synced just now · the site checks it automatically</span>
                </div>
              </div>
              <span class="btn refresh">↻ Refresh now</span>
              <span class="small" style="padding:0 15px">Edit link</span>
            </div>
          </div>
          <div class="fields" style="border-top:2px solid #EFEAE1; padding-top:21px; display:grid; grid-template-columns:2fr 1fr; gap:23px">
            <div style="display:flex; flex-direction:column; gap:9px"><div class="small" style="color:#241F1A; font-weight:600">ICS subscription URL</div><div class="field mono url" style="font-size:18px"></div></div>
            <div style="display:flex; flex-direction:column; gap:9px"><div class="small" style="color:#241F1A; font-weight:600">Sync tag</div><div class="field mono stag" style="font-size:18px"></div></div>
          </div>
        </div>
        <div class="where" style="align-self:flex-start; display:flex; gap:15px; align-items:center; background:#FFF7EE; border:3px solid #E8913A; border-radius:15px; padding:17px 24px; font:500 23px 'Chivo'; color:#241F1A"><span style="color:#B45309; font-weight:800">?</span><span>Where's the link? Your <b>Events</b> page → <b>Edit link</b>. It's the same one.</span></div>
      </div>
    </div>
    <div class="cursor">{CURSOR_SVG}</div>
  </div>
</div>"""
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += rise(f"#{s} .portal", 0.4, 70, 0.8)
    openf, addc, paste, find, typ, then, refresh = (c(4, "open"), c(4, "Add"), c(4, "Paste"), c(4, "find"),
                                                    c(4, "Type"), c(4, "then"), c(4, "Refresh"))
    js += f'tl.set("#{s} .conn", {{ opacity: 0 }}, 0); tl.set("#{s} .fields", {{ opacity: 0 }}, 0); tl.set("#{s} .st2", {{ opacity: 0 }}, 0); tl.set("#{s} .where", {{ opacity: 0 }}, 0);\n'
    js += ring_js(s, ".navfood", openf, 5)
    js += unring_js(s, ".navfood", addc - 0.3)
    js += ring_js(s, ".addbtn", addc)
    js += rise(f"#{s} .fields", addc + 0.45, 20, 0.45)
    js += ring_js(s, ".url", paste)
    js += f'tl.set("#{s} .url", {{ textContent: "" }}, 0); tl.set("#{s} .url", {{ textContent: "https://calendar.google.com/calendar/ical/…/public/basic.ics" }}, {paste + 0.3:.2f});\n'
    js += pop(f"#{s} .where", find - 0.1)
    js += typing(f"#{s} .stag", "#food", typ + 0.1, 0.6)
    js += fade(f"#{s} .add", then - 0.45, 0, 1, 0.3)
    js += fade(f"#{s} .conn", then - 0.35, 1, 0, 0.35)
    js += ring_js(s, ".refresh", refresh)
    js += fade(f"#{s} .st1", refresh + 0.55, 0, 1, 0.2) + fade(f"#{s} .st2", refresh + 0.6, 1, 0, 0.3)
    js += cursor_path(s, [(openf - 1.0, 900, 560), (openf - 0.05, 150, 272), (addc - 0.7, 150, 272), (addc + 0.05, 1480, 230),
                          (paste - 0.5, 1480, 230), (paste + 0.1, 700, 420), (typ, 700, 420), (typ + 0.1, 1330, 420),
                          (refresh - 0.6, 1330, 420), (refresh + 0.05, 1190, 225)],
                      press_at=(openf, addc + 0.1, paste + 0.15, typ + 0.15, refresh + 0.1))
    return html, js


# The profile screenshot is 1264x800, shown 1110 wide.
SHOT_K = 1110 / 1264
# Rows of "Food for the next week" in the screenshot (x, y, w, h): today (Closed),
# Tacos El Gordo, Pizza Pied Piper, then "Bring your own food".
FOOD_ROWS = [(112, 68, 420, 81), (112, 159, 420, 115), (112, 286, 420, 96), (112, 393, 420, 81)]


def shot_ring(cls, box):
    x, y, w, h = (round(v * SHOT_K) for v in box)
    return f'<div class="ring {cls}" style="left:{x - 3}px; top:{y - 3}px; width:{w + 6}px; height:{h + 6}px; box-shadow:0 0 0 5px #E8913A"></div>'


def scene5(s, d):
    c = cue
    sx, sy, sw, sh = (round(v * SHOT_K) for v in (112, 40, 420, 710))
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-380px; top:-460px"></div>
<div class="stage">
  <div class="left">
    <div class="eyebrow">Right away</div>
    <div class="h head" style="font-size:68px">Food for the next week</div>
    <div class="sub path">Seven days, starting today.</div>
  </div>
  <div class="browser win" style="left:690px; top:115px; width:1110px; height:750px">
    <div class="top"><span></span><span></span><span></span><em>iscbrewersguild.org/members/bob-s-brewery</em></div>
    <div style="position:relative; height:704px; overflow:hidden">
      <div class="push" data-layout-allow-overflow style="position:absolute; left:0; top:0; width:1110px; height:703px">
        <img src="assets/screens/profile-food.png" alt="Bob's Brewery profile showing Food for the next week" style="display:block; width:1110px; height:703px">
        {shot_ring("rweek", (112, 40, 420, 710))}
        {shot_ring("rv1", FOOD_ROWS[1])}
        {shot_ring("rv2", FOOD_ROWS[2])}
        {shot_ring("rbyo", FOOD_ROWS[3])}
        {shot_ring("rclosed", FOOD_ROWS[0])}
      </div>
    </div>
  </div>
</div>"""
    js = common_js(s, d)
    js += slide(f"#{s} .eyebrow", c(5, "Your"), -40)
    js += slide(f"#{s} .head", c(5, "Your") + 0.1, -50)
    js += rise(f"#{s} .path", c(5, "Seven"), 24)
    js += rise(f"#{s} .win", 0.35, 80, 0.8)
    # Zoomed onto the food column (its first four days fill the window), easing in a touch more.
    js += f'tl.set("#{s} .push", {{ transformOrigin: "{sx + 116}px 30px" }}, 0);\n'
    js += f'tl.fromTo("#{s} .push", {{ scale: 1.42 }}, {{ scale: 1.5, duration: {d - 1.0:.2f}, ease: "sine.inOut" }}, 0.4);\n'
    steps = [("rweek", c(5, "Seven"), c(5, "Each")),
             ("rv1", c(5, "vendors"), c(5, "Bring")),
             ("rv2", c(5, "vendors") + 0.25, c(5, "Bring")),
             ("rbyo", c(5, "Bring"), c(5, "closed")),
             ("rclosed", c(5, "closed"), d)]
    for cls, on, off in steps:
        js += f'tl.set("#{s} .{cls}", {{ opacity: 0 }}, 0);\n' + pop(f"#{s} .{cls}", on, 0.45)
        if off < d - 0.5:
            js += fade(f"#{s} .{cls}", off - 0.1, 0, 1, 0.3)
    return html, js


def scene6(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:420px; top:-190px; width:1340px; height:1340px"></div>
<div class="stage">
  <div style="position:absolute; left:120px; top:200px; width:1080px; display:flex; flex-direction:column; gap:36px">
    <div class="h" style="font-size:84px"><div class="l1">Add vendor visits with <span class="mono" style="text-transform:none">#food</span>.</div><div class="l2 accent">The site keeps up.</div></div>
    <div style="display:flex; flex-direction:column; gap:14px; font:400 33px/1.45 'Chivo'; color:#B6AC9D">
      <div class="n2">Need help? Press <b style="color:#F7F3EC">Help</b> in the Member Portal.</div>
    </div>
  </div>
  <div class="card6" style="position:absolute; right:150px; top:260px; width:520px">
    {food_row("THU", "1", "OCT", "Tacos El Gordo", "5:00 – 9:00 pm", "Street tacos, fish tacos, burritos and tortas")}
  </div>
  <div class="mark" style="position:absolute; left:120px; top:780px; font:700 21px 'Chivo'; letter-spacing:0.22em; color:#B6AC9D">ISC BREWERS GUILD</div>
</div>"""
    js = common_js(s, d).replace(f"{d - 0.4:.2f});", f"{d - 0.9:.2f});").replace("duration: 0.4, ease: \"power1.in\"", "duration: 0.9, ease: \"power1.in\"")
    js += rise(f"#{s} .l1", c(6, "From"), 50)
    js += rise(f"#{s} .l2", c(6, "The"), 50)
    js += rise(f"#{s} .n2", c(6, "Need"), 24)
    js += rise(f"#{s} .card6", 0.6, 60, 0.8)
    js += f'tl.fromTo("#{s} .card6", {{ rotation: 0 }}, {{ rotation: -2.5, duration: 4, ease: "sine.inOut", yoyo: true, repeat: 1, immediateRender: false }}, 2);\n'
    js += fade(f"#{s} .mark", 1.2, 1, 0, 0.6)
    return html, js


BUILDERS = {1: scene1, 2: scene2, 3: scene3, 4: scene4, 5: scene5, 6: scene6}


def write_scene(n, name):
    s = f"s{n:02d}"
    d = DUR[n]
    body, js = BUILDERS[n](s, d)
    doc = f"""<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><!-- generated by build/build.py -- edit there, not here --></head>
  <body>
    <template>
      <style>{base_css(s)}</style>
      <div id="{s}" data-composition-id="{s}" data-width="1920" data-height="1080">{body}
      </div>
      <script>
        (function () {{
          const tl = gsap.timeline({{ paused: true }});
{js}
          window.__timelines["{s}"] = tl;
        }})();
      </script>
    </template>
  </body>
</html>
"""
    os.makedirs("compositions/frames", exist_ok=True)
    path = f"compositions/frames/{n:02d}-{name}.html"
    open(path, "w", encoding="utf-8", newline="\n").write(doc)
    return path


# ---------------------------------------------------------------- captions
def caption_groups():
    groups = []
    for n, _ in SCENES:
        words = WORDS[n]
        # merge "hashtag food" into "#food" (any tag), "free busy" into "free/busy"
        merged = []
        i = 0
        while i < len(words):
            w = dict(words[i])
            nxt = words[i + 1]["text"] if i + 1 < len(words) else ""
            lead = re.match(r"\W*", w["text"]).group()  # keep an opening "(" before "hashtag"
            if w["text"][len(lead):].lower() == "hashtag" and nxt:
                w["text"] = lead + "#" + nxt
                w["end"] = words[i + 1]["end"]
                i += 1
            elif w["text"].lower() == "free" and nxt.lower().startswith("busy"):
                w["text"] = "free/" + nxt
                w["end"] = words[i + 1]["end"]
                i += 1
            merged.append(w)
            i += 1
        # One caption per sentence; a long sentence splits once, near its middle,
        # so a line never breaks off one or two words ("Guild homepage.").
        sentences, cur = [], []
        for w in merged:
            cur.append(w)
            if w["text"].endswith((".", "?", "!")):
                sentences.append(cur)
                cur = []
        if cur:
            sentences.append(cur)
        joints = {"and", "so", "next", "to", "with", "in", "on", "for", "then", "also", "under"}
        for sent in sentences:
            if len(sent) <= 11:
                groups.append((n, sent))
                continue
            half = len(sent) / 2
            cands = [k for k in range(2, len(sent) - 1) if sent[k]["text"].lower() in joints]
            cut = min(cands, key=lambda k: abs(k - half)) if cands else int(half)
            groups.append((n, sent[:cut]))
            groups.append((n, sent[cut:]))
    out = []
    for n, ws in groups:
        a = START[n] + LEAD + ws[0]["start"]
        b = START[n] + LEAD + ws[-1]["end"] + 0.15
        out.append((round(a, 2), round(b, 2), " ".join(w["text"] for w in ws)))
    # never overlap
    for i in range(len(out) - 1):
        if out[i][1] > out[i + 1][0]:
            out[i] = (out[i][0], out[i + 1][0], out[i][2])
    return out


def write_captions():
    groups = caption_groups()
    divs = "\n".join(f'        <div class="cap" id="cap-{i:03d}">{text}</div>' for i, (_, _, text) in enumerate(groups))
    sets = "\n".join(
        f'          tl.set("#cap-{i:03d}", {{ opacity: 1 }}, {a:.2f}); tl.set("#cap-{i:03d}", {{ opacity: 0 }}, {b:.2f});'
        for i, (a, b, _) in enumerate(groups))
    doc = f"""<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><!-- generated by build/build.py -- edit there, not here --></head>
  <body>
    <template>
      <style>
@font-face {{ font-family: "Chivo"; src: url("assets/fonts/Chivo-latin.woff2") format("woff2"); font-weight: 100 900; font-display: block; }}
#captions {{ position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }}
#captions .band {{ position: absolute; left: 0; right: 0; top: 915px; height: 110px; display: flex; align-items: center; justify-content: center; }}
#captions .cap {{ position: absolute; opacity: 0; max-width: 1500px; text-align: center; font: 600 40px/1.25 "Chivo"; color: #F7F3EC; background: rgba(15,13,10,0.84); padding: 14px 30px; border-radius: 14px; }}
      </style>
      <div id="captions" data-composition-id="captions" data-width="1920" data-height="1080">
       <div class="band">
{divs}
       </div>
      </div>
      <script>
        (function () {{
          const tl = gsap.timeline({{ paused: true }});
{sets}
          window.__timelines["captions"] = tl;
        }})();
      </script>
    </template>
  </body>
</html>
"""
    open("compositions/captions.html", "w", encoding="utf-8", newline="\n").write(doc)
    return len(groups)


# ---------------------------------------------------------------- index
def write_index(paths):
    hosts = []
    audio = []
    for (n, name), path in zip(SCENES, paths):
        s = f"s{n:02d}"
        hosts.append(
            f'      <div id="{s}-host" data-composition-id="{s}" data-composition-src="{path}" data-start="{START[n]}" '
            f'data-duration="{DUR[n]}" data-track-index="1" data-width="1920" data-height="1080"></div>')
        audio.append(
            f'      <audio id="vo{n:02d}" src="assets/voice/{n:02d}.wav" data-start="{round(START[n] + LEAD, 2)}" '
            f'data-duration="{VOICE[n]}" data-track-index="4" data-volume="1"></audio>')
    doc = f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>Your food vendor calendar, Google — ISC Brewers Guild how-to</title>
    <!-- generated by build/build.py -- edit there, not here -->
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #171410; }}
      #root {{ position: relative; width: 100%; height: 100%; background: #171410; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{TOTAL}" data-width="1920" data-height="1080">
{chr(10).join(hosts)}
      <div id="captions-host" data-composition-id="captions" data-composition-src="compositions/captions.html" data-track-kind="captions" data-start="0" data-duration="{TOTAL}" data-track-index="3" data-width="1920" data-height="1080"></div>
{chr(10).join(audio)}
    </div>
    <script>
      const tl = gsap.timeline({{ paused: true }});
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
"""
    open("index.html", "w", encoding="utf-8", newline="\n").write(doc)


if __name__ == "__main__":
    paths = [write_scene(n, name) for n, name in SCENES]
    ncap = write_captions()
    write_index(paths)
    print(f"total {TOTAL}s · {len(paths)} scenes · {ncap} caption groups")
    for n, name in SCENES:
        print(f"  {n:02d} {name:14s} start {START[n]:7.2f}  dur {DUR[n]:6.2f}  voice {VOICE[n]:6.2f}")
