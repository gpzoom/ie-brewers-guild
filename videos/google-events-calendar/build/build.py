"""Builds the HyperFrames compositions for "Your events calendar, Google".

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
TAIL = {1: 0.9, 2: 0.9, 3: 1.0, 4: 0.9, 5: 1.2, 6: 1.0, 7: 0.9, 8: 1.1, 9: 1.0, 10: 1.2, 11: 2.4}

SCENES = [
    (1, "promise"), (2, "three-steps"), (3, "new-calendar"), (4, "make-public"),
    (5, "all-details"), (6, "copy-link"), (7, "tag-events"), (8, "paste-refresh"),
    (9, "profile"), (10, "homepage"), (11, "keep-going"),
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
def scene1(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-270px; top:-350px"></div>
<div class="stage">
  <div style="position:absolute; left:120px; top:230px; width:960px; display:flex; flex-direction:column; gap:30px">
    <div class="eyebrow">ISC Brewers Guild · Member how-to</div>
    <div class="h" style="font-size:104px"><div class="l1">Your events.</div><div class="l2 accent">On the Guild homepage.</div></div>
    <div class="sub">Set it up once with Google Calendar.</div>
  </div>
  <div class="under" style="position:absolute; right:190px; top:150px; width:410px">
    {page("#9A3412", "M", "Mars Brewing Co.", "OCTOBER", "3", "SATURDAY", "4:00 – 9:00 pm", "Halloween Costume Contest", "position:relative; width:410px")}
  </div>
  <div class="tearwrap" style="position:absolute; right:190px; top:150px; width:410px">
    {page("#B45309", "B", "Bob's Brewery", "OCTOBER", "1", "THURSDAY", "5:00 – 11:00 pm", "VIP Members Party", "position:relative; width:410px")}
  </div>
</div>"""
    js = common_js(s, d)
    js += slide(f"#{s} .eyebrow", 0.3)
    js += rise(f"#{s} .l1", c(1, "Your"), 50)
    js += rise(f"#{s} .l2", c(1, "Guild"), 50)
    js += rise(f"#{s} .sub", c(1, "Here's"), 30)
    js += rise(f"#{s} .tearwrap", 0.35, 60, 0.7)
    tear = c(1, "autopilot") - 0.1
    js += f'tl.fromTo("#{s} .tearwrap", {{ rotation: 0, y: 0, opacity: 1 }}, {{ rotation: -11, y: -330, opacity: 0, duration: 0.75, ease: "power2.in", immediateRender: false }}, {tear:.2f});\n'
    js += f'tl.set("#{s} .tearwrap", {{ transformOrigin: "15% 0%" }}, 0);\n'
    # The next page stays hidden under the top one until the tear (they'd overlap).
    js += f'tl.set("#{s} .under", {{ opacity: 0 }}, 0);\n' + fade(f"#{s} .under", tear + 0.4, 1, 0, 0.3)
    return html, js


def scene2(s, d):
    c = cue
    cards = [("1", "Make an events calendar", "New, public, all event details", ("Create", 1)),
             ("2", "Tag your events", 'Add <span class="mono" style="color:#F7F3EC">#guild</span> to the ones to show', ("Create", 2)),
             ("3", "Paste one link", "On your profile, through the Member Portal", ("paste", 1))]
    cells = ""
    for num, title, line, _ in cards:
        cells += f"""<div class="card c{num}" style="background:#211C17; border:3px solid #3A332C; border-radius:24px; padding:42px; height:460px; display:flex; flex-direction:column; gap:24px">
      <div class="h num" style="font-size:124px; color:#E8913A; line-height:0.9">{num}</div>
      <div style="font:700 44px/1.15 'Chivo'">{title}</div>
      <div style="font:400 26px/1.4 'Chivo'; color:#B6AC9D">{line}</div>
    </div>"""
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-380px; top:-500px"></div>
<div class="stage">
  <div class="h title" style="position:absolute; left:120px; top:120px; font-size:88px">Three steps.</div>
  <div style="position:absolute; left:120px; right:120px; top:320px; display:grid; grid-template-columns:repeat(3,1fr); gap:50px">{cells}</div>
</div>"""
    js = common_js(s, d)
    js += slide(f"#{s} .title", c(2, "It"), -50)
    for num, _, _, word in cards:
        at = c(2, *word)
        js += rise(f"#{s} .c{num}", at - 0.15, 70, 0.6)
        js += pop(f"#{s} .c{num} .num", at)
    return html, js


def gpanel_bar(label):
    return f'<div class="bar"><span>{label}</span><span class="badge">simplified</span></div>'


def scene3(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-460px; top:-540px"></div>
<div class="stage">
  <div class="step">Step 1 of 3 · Make an events calendar</div>
  <div class="left">
    <div class="h head">A calendar just for events</div>
    <div class="sub keep">Keep it separate from your own calendar.</div>
    <div class="warn" style="display:flex; gap:17px; align-items:flex-start; background:#211C17; border:3px solid #E8913A; border-radius:16px; padding:20px 24px; font:500 27px/1.4 'Chivo'; color:#F7F3EC"><span style="color:#E8913A; font-weight:800">!</span><span>Anyone with its link can see everything on it.</span></div>
  </div>
  <div class="panel gp" style="left:690px; top:163px; width:1110px; height:700px">
    {gpanel_bar("Google Calendar")}
    <div style="display:flex; height:638px">
      <div style="width:400px; border-right:2px solid #DED7CB; padding:32px 24px; display:flex; flex-direction:column; gap:17px; position:relative">
        <div class="caps">My calendars</div>
        <div class="small">Personal</div>
        <div style="display:flex; align-items:center; justify-content:space-between; margin-top:12px">
          <span class="caps">Other calendars</span>
          <span class="plus" style="width:44px; height:44px; border-radius:50%; background:#fff; border:2px solid #DED7CB; display:flex; align-items:center; justify-content:center; font:700 30px 'Chivo'; color:#241F1A">+</span>
        </div>
        <div class="menu" style="margin-left:40px; background:#fff; border-radius:10px; box-shadow:0 12px 28px rgba(0,0,0,0.16); display:flex; flex-direction:column; font:500 20px 'Chivo'">
          <div class="small" style="padding:11px 17px">Subscribe to calendar</div>
          <div class="create" style="padding:11px 17px; font-weight:700">Create new calendar</div>
          <div class="small" style="padding:11px 17px">Browse calendars of interest</div>
        </div>
        <div class="newcal small" style="display:flex; align-items:center; gap:12px; font-weight:600; color:#241F1A"><span style="width:19px; height:19px; border-radius:4px; background:#B45309"></span>Bob's Brewery Events</div>
      </div>
      <div style="flex:1; position:relative">
        <div class="week" style="position:absolute; inset:0; padding:32px 38px; display:grid; grid-template-columns:repeat(5,1fr); gap:12px">
          {"".join('<div style="border-left:2px solid #EFEAE1"></div>' for _ in range(5))}
        </div>
        <div class="form" style="position:absolute; inset:0; padding:36px 40px; display:flex; flex-direction:column; gap:24px">
          <div class="lbl">Create new calendar</div>
          <div style="display:flex; flex-direction:column; gap:9px">
            <div class="small" style="color:#241F1A; font-weight:600">Name</div>
            <div class="field name mono" style="font-family:'Chivo'"></div>
          </div>
          <div style="display:flex; flex-direction:column; gap:9px; opacity:0.8">
            <div class="small">Description</div>
            <div class="field"></div>
          </div>
          <div><span class="btn dark createbtn">Create calendar</span></div>
        </div>
      </div>
    </div>
    <div class="cursor">{CURSOR_SVG}</div>
  </div>
</div>"""
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", c(3, "starts"), -50)
    js += pop(f"#{s} .warn", c(3, "Anyone") - 0.1)
    js += rise(f"#{s} .keep", c(3, "So"), 24)
    js += rise(f"#{s} .gp", 0.9, 70, 0.8)
    plus, choose, create_word, name, press = c(3, "plus"), c(3, "Choose"), c(3, "Create"), c(3, "Name"), c(3, "Create", 2)
    js += show(f"#{s} .menu", plus + 0.35) + f'tl.set("#{s} .menu", {{ opacity: 0 }}, 0);\n'
    js += f'tl.fromTo("#{s} .plus", {{ boxShadow: "0 0 0 0px #E8913A" }}, {{ boxShadow: "0 0 0 7px #E8913A", duration: 0.3 }}, {plus:.2f});\n'
    js += f'tl.fromTo("#{s} .create", {{ backgroundColor: "rgba(252,231,210,0)" }}, {{ backgroundColor: "rgba(252,231,210,1)", duration: 0.25 }}, {create_word - 0.3:.2f});\n'
    js += fade(f"#{s} .menu", create_word + 0.35, 0, 1, 0.25)
    js += fade(f"#{s} .week", create_word + 0.4, 0, 1, 0.3)
    js += fade(f"#{s} .form", create_word + 0.4, 1, 0, 0.35) + f'tl.set("#{s} .form", {{ opacity: 0 }}, 0);\n'
    js += typing(f"#{s} .name", "Bob's Brewery Events", name, 1.0)
    js += f'tl.fromTo("#{s} .name", {{ boxShadow: "0 0 0 0px #E8913A" }}, {{ boxShadow: "0 0 0 7px #E8913A", duration: 0.3 }}, {name - 0.2:.2f});\n'
    js += fade(f"#{s} .newcal", press + 0.35) + f'tl.set("#{s} .newcal", {{ opacity: 0 }}, 0);\n'
    # cursor: panel-local coords
    js += cursor_path(s, [(plus - 1.4, 700, 420), (plus - 0.1, 360, 205), (choose - 0.2, 360, 205), (create_word - 0.1, 210, 300),
                          (name - 0.4, 700, 260), (press - 0.5, 700, 300), (press - 0.05, 610, 470)],
                      press_at=(plus, create_word, press))
    return html, js


def scene4(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-460px; bottom:-580px"></div>
<div class="stage">
  <div class="step">Step 1 of 3 · Make an events calendar</div>
  <div class="left">
    <div class="h head">Make it public</div>
    <div class="sub path">Settings and sharing → Access permissions for events</div>
  </div>
  <div class="panel gp" style="left:690px; top:163px; width:1110px; height:700px">
    {gpanel_bar("Google Calendar · Settings")}
    <div style="display:flex; height:638px">
      <div style="width:400px; border-right:2px solid #DED7CB; padding:32px 24px; display:flex; flex-direction:column; gap:17px">
        <div class="caps">Other calendars</div>
        <div class="row" style="display:flex; align-items:center; gap:13px; border-radius:10px; padding:12px 14px; font:600 20px 'Chivo'"><span style="width:19px; height:19px; border-radius:4px; background:#B45309"></span>Bob's Brewery Events<span style="margin-left:auto; color:#6B6156">⋮</span></div>
        <div class="sas" style="margin-left:40px; background:#fff; border-radius:10px; padding:12px 17px; font:600 20px 'Chivo'; box-shadow:0 12px 28px rgba(0,0,0,0.16)">Settings and sharing</div>
      </div>
      <div style="flex:1; position:relative">
        <div class="perm" style="position:absolute; inset:0; padding:36px 40px; display:flex; flex-direction:column; gap:28px">
          <div class="lbl">Access permissions for events</div>
          <div class="pubrow" style="display:flex; align-items:center; gap:19px; padding:19px 23px; border-radius:14px; background:#fff; border:2px solid #DED7CB">
            <span class="box" style="width:34px; height:34px; border-radius:7px; border:3px solid #6B6156; display:flex; align-items:center; justify-content:center; position:relative"><span class="tick" style="position:absolute; inset:-3px; border-radius:7px; background:#241F1A; color:#fff; display:flex; align-items:center; justify-content:center; font:700 22px 'Chivo'">✓</span></span>
            <span style="font:600 25px 'Chivo'">Make available to public</span>
          </div>
          <div class="field" data-layout-allow-overlap style="opacity:0.8">See only free/busy (hide details) ▾</div>
          <div class="small" style="opacity:0.8">Share with specific people or groups</div>
        </div>
      </div>
    </div>
    <div class="dim" style="position:absolute; inset:62px 0 0 0; background:rgba(36,31,26,0.38); z-index:14"></div>
    <div class="modal" data-layout-allow-overlap style="position:absolute; left:440px; top:190px; width:560px; z-index:15; background:#fff; border-radius:16px; padding:30px 32px; box-shadow:0 24px 60px rgba(0,0,0,0.28); display:flex; flex-direction:column; gap:16px">
      <div style="font:700 27px 'Chivo'">Make this calendar public?</div>
      <div style="font:400 20px/1.45 'Chivo'; color:#6B6156">Everyone will be able to see all events on it, including in Google search.</div>
      <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:6px">
        <span style="font:600 20px 'Chivo'; padding:11px 20px; color:#6B6156">Cancel</span>
        <span class="okbtn" style="font:700 20px 'Chivo'; padding:11px 26px; border-radius:9px; background:#241F1A; color:#fff">OK</span>
      </div>
    </div>
    <div class="cursor">{CURSOR_SVG}</div>
  </div>
</div>"""
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", c(4, "Next"), -50)
    js += rise(f"#{s} .path", c(4, "Settings"), 24)
    js += rise(f"#{s} .gp", 0.45, 70, 0.8)
    name, openw, under, tick = c(4, "calendar's"), c(4, "open"), c(4, "Scroll"), c(4, "Make")
    warn, ok = c(4, "warning"), c(4, ("OK", "okay"))
    js += f'tl.fromTo("#{s} .row", {{ backgroundColor: "rgba(239,234,225,0)" }}, {{ backgroundColor: "rgba(239,234,225,1)", duration: 0.3 }}, {name + 0.2:.2f});\n'
    js += pop(f"#{s} .sas", openw) + f'tl.set("#{s} .sas", {{ opacity: 0 }}, 0);\n'
    js += f'tl.fromTo("#{s} .sas", {{ boxShadow: "0 0 0 0px #E8913A" }}, {{ boxShadow: "0 0 0 7px #E8913A", duration: 0.3, immediateRender: false }}, {c(4, "Settings"):.2f});\n'
    js += fade(f"#{s} .perm", under - 0.4, 1, 0, 0.45) + f'tl.set("#{s} .perm", {{ opacity: 0 }}, 0);\n'
    js += pop(f"#{s} .tick", tick + 0.1, 0.4) + f'tl.set("#{s} .tick", {{ opacity: 0 }}, 0);\n'
    js += f'tl.fromTo("#{s} .pubrow", {{ boxShadow: "0 0 0 0px #E8913A" }}, {{ boxShadow: "0 0 0 7px #E8913A", duration: 0.3 }}, {tick + 0.1:.2f});\n'
    js += cursor_path(s, [(name - 0.9, 700, 500), (name + 0.1, 330, 150), (openw - 0.2, 330, 150), (c(4, "Settings") + 0.1, 220, 222),
                          (tick - 0.9, 500, 330), (tick - 0.05, 450, 300), (ok - 0.7, 912, 382)],
                      press_at=(name + 0.2, c(4, "Settings") + 0.4, tick + 0.05, ok + 0.05))
    # The confirm box appears as the warning is mentioned and closes when OK is pressed.
    js += f'tl.set("#{s} .dim", {{ opacity: 0 }}, 0);\ntl.set("#{s} .modal", {{ opacity: 0 }}, 0);\n'
    js += fade(f"#{s} .dim", warn, 1, 0, 0.3)
    js += f'tl.fromTo("#{s} .modal", {{ opacity: 0, scale: 0.92 }}, {{ opacity: 1, scale: 1, duration: 0.35, ease: "back.out(1.8)", immediateRender: false }}, {warn + 0.05:.2f});\n'
    js += f'tl.fromTo("#{s} .okbtn", {{ boxShadow: "0 0 0 0px #E8913A" }}, {{ boxShadow: "0 0 0 6px #E8913A", duration: 0.25, immediateRender: false }}, {ok:.2f});\n'
    js += f'tl.fromTo("#{s} .modal", {{ opacity: 1 }}, {{ opacity: 0, duration: 0.3, immediateRender: false }}, {ok + 0.45:.2f});\n'
    js += f'tl.fromTo("#{s} .dim", {{ opacity: 1 }}, {{ opacity: 0, duration: 0.3, immediateRender: false }}, {ok + 0.45:.2f});\n'
    return html, js


def scene5(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-420px; top:-500px"></div>
<div class="stage">
  <div class="step">Step 1 of 3 · Make an events calendar</div>
  <div class="h head" style="position:absolute; left:120px; top:190px; font-size:76px">Pick <span class="accent">See all event details</span></div>
  <div style="position:absolute; left:120px; right:120px; top:350px; display:grid; grid-template-columns:1fr 1fr; gap:58px; perspective:1400px">
    <div class="bad" style="background:#211C17; border:3px solid #3A332C; border-radius:24px; padding:40px; display:flex; flex-direction:column; gap:24px">
      <div style="font:700 25px 'Chivo'; color:#B6AC9D">See only free/busy (hide details)</div>
      <div style="background:#3A332C; border-radius:14px; padding:28px 32px"><div style="font:700 40px 'Chivo'">Busy</div><div style="font:400 24px 'Chivo'; color:#B6AC9D">5:00 – 11:00 pm</div></div>
      <div class="badline" style="font:700 28px 'Chivo'; color:#E0896B">✕ Nothing comes through</div>
    </div>
    <div class="good" style="background:#211C17; border:3px solid #3A332C; border-radius:24px; padding:40px; display:flex; flex-direction:column; gap:24px">
      <div style="font:700 25px 'Chivo'; color:#E8913A">See all event details</div>
      <div style="background:#FBF8F2; color:#241F1A; border-radius:14px; padding:28px 32px"><div style="font:700 40px 'Chivo'">VIP Members Party</div><div style="font:400 24px 'Chivo'; color:#6B6156">5:00 – 11:00 pm</div><div style="font:400 21px 'Chivo'; color:#3A332C; margin-top:10px">RSVP: bobsbrewery.com/vip · <span class="mono" style="font-weight:700">#guild</span></div></div>
      <div class="goodline" style="font:700 28px 'Chivo'; color:#E8913A">✓ Your events come through</div>
    </div>
  </div>
</div>"""
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", c(5, "When"), -50)
    js += f'tl.fromTo("#{s} .bad", {{ opacity: 0, rotationY: 28, x: -60 }}, {{ opacity: 1, rotationY: 0, x: 0, duration: 0.8, ease: "power3.out" }}, {c(5, "See") - 0.1:.2f});\n'
    js += f'tl.fromTo("#{s} .good", {{ opacity: 0, rotationY: -28, x: 60 }}, {{ opacity: 1, rotationY: 0, x: 0, duration: 0.8, ease: "power3.out" }}, {c(5, "See", 2) - 0.1:.2f});\n'
    m = c(5, "important")
    js += fade(f"#{s} .bad", m - 0.2, 0.75, 1, 0.5)
    js += f'tl.fromTo("#{s} .good", {{ borderColor: "#3A332C", scale: 1 }}, {{ borderColor: "#E8913A", scale: 1.03, duration: 0.5, ease: "back.out(2)", immediateRender: false }}, {m - 0.2:.2f});\n'
    js += pop(f"#{s} .goodline", m) + f'tl.set("#{s} .goodline", {{ opacity: 0 }}, 0);\n'
    js += rise(f"#{s} .badline", c(5, "nothing"), 16, 0.5) + f'tl.set("#{s} .badline", {{ opacity: 0 }}, 0);\n'
    return html, js


def scene6(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-420px; top:-540px"></div>
<div class="stage">
  <div class="step">Step 1 of 3 · Make an events calendar</div>
  <div class="left">
    <div class="h head">Copy the iCal link</div>
    <div class="sub path">Integrate calendar → Public address in iCal format</div>
  </div>
  <div class="panel gp" style="left:690px; top:182px; width:1110px; height:653px">
    {gpanel_bar("Google Calendar · Settings")}
    <div class="scroll" data-layout-allow-overflow style="padding:38px 42px; display:flex; flex-direction:column; gap:26px">
      <div class="lbl">Integrate calendar</div>
      <div style="display:flex; flex-direction:column; gap:10px; opacity:0.8"><div class="small">Public URL to this calendar</div><div class="field">https://calendar.google.com/calendar/embed?src=…</div></div>
      <div style="display:flex; flex-direction:column; gap:10px">
        <div class="small" style="color:#241F1A; font-weight:600">Public address in iCal format</div>
        <div style="display:flex; gap:15px; align-items:center">
          <div class="field mono ical" style="flex:1; font-size:20px">https://calendar.google.com/calendar/ical/…/public/basic.ics</div>
          <span class="btn dark copy">Copy</span>
        </div>
        <div class="copied" style="align-self:flex-end; font:700 18px 'Chivo'; color:#fff; background:#2F6B33; border-radius:99px; padding:6px 16px">Copied</div>
      </div>
      <div class="small" style="opacity:0.8">Secret address in iCal format</div>
    </div>
    <div class="cursor">{CURSOR_SVG}</div>
  </div>
</div>"""
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", c(6, "Now"), -50)
    js += rise(f"#{s} .path", c(6, "Integrate"), 24)
    js += rise(f"#{s} .gp", 0.4, 70, 0.7)
    js += f'tl.fromTo("#{s} .scroll", {{ y: 120 }}, {{ y: 0, duration: 1.0, ease: "power2.inOut" }}, {c(6, "scroll"):.2f});\n'
    cp = c(6, "Copy")
    js += f'tl.fromTo("#{s} .ical", {{ boxShadow: "0 0 0 0px #E8913A" }}, {{ boxShadow: "0 0 0 7px #E8913A", duration: 0.3 }}, {cp:.2f});\n'
    press = c(6, "format") - 0.1
    js += pop(f"#{s} .copied", press + 0.2) + f'tl.set("#{s} .copied", {{ opacity: 0 }}, 0);\n'
    js += cursor_path(s, [(cp - 0.6, 700, 520), (press - 0.05, 985, 322)], press_at=(press,))
    return html, js


def scene7(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-460px; bottom:-600px"></div>
<div class="stage">
  <div class="step">Step 2 of 3 · Tag your events</div>
  <div class="left">
    <div class="h head">Add <span class="mono accent" style="text-transform:none">#guild</span></div>
    <div class="sub path">In each title or description. Only tagged events come through.</div>
  </div>
  <div class="panel gp" style="left:690px; top:163px; width:1110px; height:475px">
    {gpanel_bar("Google Calendar · Event")}
    <div style="padding:30px 42px; display:flex; flex-direction:column; gap:17px">
      <div style="font:700 37px 'Chivo'">VIP Members Party</div>
      <div class="small">Thursday, October 1 · 5:00 – 11:00 pm · Bob's Brewery Events</div>
      <div class="field desc" style="line-height:1.55">
        <div>VIP Members ONLY party!</div>
        <div>RSVP: https://bobsbrewery.com/vip</div>
        <div><span class="mono tag" style="font-weight:700; background:#FCE7D2; border-radius:6px; padding:0 6px"></span><span class="caret" style="display:inline-block; width:3px; height:26px; background:#241F1A; vertical-align:middle; margin-left:2px"></span></div>
      </div>
    </div>
  </div>
  <div style="position:absolute; left:690px; top:672px; width:1110px; display:grid; grid-template-columns:1fr 1fr; gap:27px">
    <div class="r1" style="background:#211C17; border:3px solid #E8913A; border-radius:16px; padding:19px 25px">
      <div style="font:700 25px 'Chivo'">VIP Members Party · <span class="mono">#guild</span></div>
      <div style="font:600 21px 'Chivo'; color:#E8913A">✓ Goes to your profile</div>
    </div>
    <div class="r2" style="background:#211C17; border:3px solid #3A332C; border-radius:16px; padding:19px 25px">
      <div style="font:700 25px 'Chivo'; color:#B6AC9D">Staff meeting</div>
      <div style="font:600 21px 'Chivo'; color:#B6AC9D">No tag · stays off</div>
    </div>
  </div>
</div>"""
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", c(7, "Step"), -50)
    js += rise(f"#{s} .path", c(7, "Add"), 24)
    js += rise(f"#{s} .gp", 0.45, 70, 0.7)
    ty = c(7, "hashtag")
    js += typing(f"#{s} .tag", "#guild", ty, 0.7)
    js += f'tl.fromTo("#{s} .desc", {{ boxShadow: "0 0 0 0px #E8913A" }}, {{ boxShadow: "0 0 0 7px #E8913A", duration: 0.3 }}, {ty:.2f});\n'
    blinks = max(0, int((d - 1) // 0.5) - 1)
    js += f'tl.fromTo("#{s} .caret", {{ opacity: 1 }}, {{ opacity: 0, duration: 0.25, ease: "steps(1)", yoyo: true, repeat: {blinks} }}, 0.6);\n'
    only = c(7, "Only")
    js += rise(f"#{s} .r1", only, 40, 0.55)
    js += rise(f"#{s} .r2", only + 0.35, 40, 0.55)
    return html, js


def scene8(s, d):
    c = cue
    side = "".join(
        f'<div style="padding:10px 15px;{" background:#241F1A; color:#F9F6F0; border-radius:10px; font-weight:600;" if n == "Events" else ""}">{n}</div>'
        for n in ["Basics &amp; hours", "Logo &amp; cover", "Photos", "Events", "Food", "Links &amp; contact", "Theme", "People"])
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-500px; top:-560px"></div>
<div class="stage">
  <div class="step">Step 3 of 3 · Paste one link</div>
  <div class="panel portal" style="left:120px; top:163px; width:1680px; height:700px; background:#F9F6F0">
    <div style="height:58px; background:#171410; display:flex; align-items:center; justify-content:space-between; padding:0 31px; font:600 17px 'Chivo'; letter-spacing:0.14em; color:#B6AC9D">ISC BREWERS GUILD · MEMBER PORTAL<span style="letter-spacing:0; font-weight:500; color:#F7F3EC">Bob's Brewery</span></div>
    <div style="display:flex; height:642px">
      <div style="width:288px; border-right:2px solid #EFEAE1; padding:27px 19px; display:flex; flex-direction:column; gap:7px; font:400 19px 'Chivo'">{side}</div>
      <div style="flex:1; padding:34px 42px; display:flex; flex-direction:column; gap:23px">
        <div style="font-family:'Bricolage Grotesque'; font-weight:700; font-size:44px">Events</div>
        <div class="box" style="position:relative; background:#fff; border:2px solid #DED7CB; border-radius:19px; padding:30px 35px; display:flex; flex-direction:column; gap:23px; min-height:340px">
          <div style="position:relative; height:110px">
            <div class="add" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:space-between; gap:27px">
              <div style="display:flex; flex-direction:column; gap:6px"><div style="font:600 24px 'Chivo'">Add an Apple or other calendar</div><div class="small" style="max-width:780px">Calendars connect by subscription link (ICS), which your calendar app updates on its own schedule.</div></div>
              <span class="btn addbtn">Add calendar</span>
            </div>
            <div class="conn" style="position:absolute; inset:0; display:flex; align-items:center; gap:27px">
              <div style="width:58px; height:58px; border-radius:13px; background:#EFEAE1; display:flex; align-items:center; justify-content:center; color:#6B6156; font:700 24px 'Chivo'">▦</div>
              <div style="flex:1; display:flex; flex-direction:column; gap:6px">
                <div style="font:600 25px 'Chivo'">Calendar subscription</div>
                <div class="small">calendar.google.com · importing events tagged <b style="color:#241F1A">#guild</b></div>
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
      </div>
    </div>
    <div class="cursor">{CURSOR_SVG}</div>
  </div>
</div>"""
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += rise(f"#{s} .portal", 0.4, 70, 0.8)
    addc, paste, typ, then, refresh = c(8, "Add"), c(8, "Paste"), c(8, "type"), c(8, "Then"), c(8, "Refresh")
    js += f'tl.set("#{s} .conn", {{ opacity: 0 }}, 0); tl.set("#{s} .fields", {{ opacity: 0 }}, 0); tl.set("#{s} .st2", {{ opacity: 0 }}, 0);\n'
    js += f'tl.fromTo("#{s} .addbtn", {{ boxShadow: "0 0 0 0px #E8913A" }}, {{ boxShadow: "0 0 0 7px #E8913A", duration: 0.3 }}, {addc:.2f});\n'
    js += rise(f"#{s} .fields", addc + 0.45, 20, 0.45)
    js += f'tl.fromTo("#{s} .url", {{ boxShadow: "0 0 0 0px #E8913A" }}, {{ boxShadow: "0 0 0 7px #E8913A", duration: 0.3 }}, {paste:.2f});\n'
    js += f'tl.set("#{s} .url", {{ textContent: "" }}, 0); tl.set("#{s} .url", {{ textContent: "https://calendar.google.com/calendar/ical/…/public/basic.ics" }}, {paste + 0.3:.2f});\n'
    js += typing(f"#{s} .stag", "#guild", typ + 0.1, 0.6)
    js += fade(f"#{s} .add", then - 0.45, 0, 1, 0.3)
    js += fade(f"#{s} .conn", then - 0.35, 1, 0, 0.35)
    js += f'tl.fromTo("#{s} .refresh", {{ boxShadow: "0 0 0 0px #E8913A" }}, {{ boxShadow: "0 0 0 7px #E8913A", duration: 0.3 }}, {refresh:.2f});\n'
    js += fade(f"#{s} .st1", refresh + 0.55, 0, 1, 0.2) + fade(f"#{s} .st2", refresh + 0.6, 1, 0, 0.3)
    js += cursor_path(s, [(addc - 1.0, 900, 520), (addc + 0.05, 1480, 230), (paste - 0.5, 1480, 230), (paste + 0.1, 700, 420),
                          (typ, 700, 420), (typ + 0.1, 1330, 420), (refresh - 0.6, 1330, 420), (refresh + 0.05, 1190, 225)],
                      press_at=(addc + 0.1, paste + 0.15, typ + 0.15, refresh + 0.1))
    return html, js


def scene9(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-380px; top:-460px"></div>
<div class="stage">
  <div class="left">
    <div class="eyebrow">Right away</div>
    <div class="h head">On your profile</div>
    <div class="sub path">Time, place and your description.</div>
  </div>
  <div class="browser win" style="left:690px; top:115px; width:1110px; height:750px">
    <div class="top"><span></span><span></span><span></span><em>iscbrewersguild.org/members/bob-s-brewery</em></div>
    <div style="position:relative; height:704px; overflow:hidden">
      <div class="push" data-layout-allow-overflow style="position:absolute; left:0; top:0; width:1110px; height:694px">
        <img src="assets/screens/profile-top.png" alt="Bob's Brewery profile with its upcoming events" style="display:block; width:1110px; height:694px">
        <div class="ring evring" style="left:500px; top:252px; width:450px; height:90px"></div>
      </div>
    </div>
  </div>
</div>"""
    js = common_js(s, d)
    js += slide(f"#{s} .eyebrow", c(9, "Your"), -40)
    js += slide(f"#{s} .head", c(9, "Your") + 0.1, -50)
    js += rise(f"#{s} .path", c(9, "With"), 24)
    js += rise(f"#{s} .win", 0.35, 80, 0.8)
    js += f'tl.set("#{s} .push", {{ transformOrigin: "65% 45%" }}, 0);\n'
    js += f'tl.fromTo("#{s} .push", {{ scale: 1 }}, {{ scale: 1.1, duration: {d - 1.2:.2f}, ease: "sine.inOut" }}, 0.8);\n'
    js += pop(f"#{s} .evring", c(9, "right"), 0.5) + f'tl.set("#{s} .evring", {{ opacity: 0 }}, 0);\n'
    return html, js


def scene10(s, d):
    c = cue
    # carousel screenshots are 1281x801; shown 1110 wide -> scale 0.8665
    k = 1110 / 1281
    px, py, pw, ph = round(662 * k), round(171 * k), round(441 * k), round(476 * k)
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-420px; bottom:-560px"></div>
<div class="stage">
  <div class="left">
    <div class="eyebrow">Next two weeks</div>
    <div class="h head">On the Guild homepage</div>
    <div class="sub path">Your own calendar page. Your logo. Your color.</div>
  </div>
  <div class="browser win" style="left:690px; top:150px; width:1110px; height:740px">
    <div class="top"><span></span><span></span><span></span><em>iscbrewersguild.org</em></div>
    <div style="position:relative; height:694px; overflow:hidden">
      <div class="push" data-layout-allow-overflow style="position:absolute; left:0; top:0; width:1110px; height:694px">
        <img class="shot2" src="assets/screens/home-carousel-2.png" alt="Homepage carousel, next member's calendar page" style="position:absolute; left:0; top:0; width:1110px; height:694px">
        <img class="shot1" src="assets/screens/home-carousel-1.png" alt="Homepage carousel showing Bob's Brewery's calendar page" style="position:absolute; left:0; top:0; width:1110px; height:694px">
        <div class="tearpiece" style="position:absolute; left:{px}px; top:{py}px; width:{pw}px; height:{ph}px; overflow:hidden; border-radius:9px">
          <div data-layout-allow-overflow style="position:absolute; left:{-px}px; top:{-py}px; width:1110px; height:694px; background:url('assets/screens/home-carousel-1.png') 0 0 / 1110px 694px no-repeat"></div>
        </div>
      </div>
    </div>
  </div>
</div>"""
    js = common_js(s, d)
    js += slide(f"#{s} .eyebrow", c(10, "Events"), -40)
    js += slide(f"#{s} .head", c(10, "Events") + 0.1, -50)
    js += rise(f"#{s} .path", c(10, "Each"), 24)
    js += rise(f"#{s} .win", 0.35, 80, 0.8)
    js += f'tl.set("#{s} .push", {{ transformOrigin: "{px + pw // 2}px {py + ph // 2}px" }}, 0);\n'
    js += f'tl.fromTo("#{s} .push", {{ scale: 1 }}, {{ scale: 1.06, duration: 3.2, ease: "power2.inOut" }}, 0.9);\n'
    tear = c(10, "own") - 0.2
    js += f'tl.set("#{s} .shot1", {{ opacity: 1 }}, 0); tl.set("#{s} .shot1", {{ opacity: 0 }}, {tear:.2f});\n'
    js += f'tl.set("#{s} .tearpiece", {{ transformOrigin: "15% 0%" }}, 0);\n'
    js += f'tl.fromTo("#{s} .tearpiece", {{ rotation: 0, y: 0, opacity: 1 }}, {{ rotation: -11, y: -300, opacity: 0, duration: 0.75, ease: "power2.in", immediateRender: false }}, {tear:.2f});\n'
    return html, js


def scene11(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:420px; top:-190px; width:1340px; height:1340px"></div>
<div class="stage">
  <div style="position:absolute; left:120px; top:200px; width:1130px; display:flex; flex-direction:column; gap:36px">
    <div class="h" style="font-size:88px"><div class="l1">Add events to that calendar.</div><div class="l2 accent">The site keeps up.</div></div>
    <div style="display:flex; flex-direction:column; gap:14px; font:400 33px/1.45 'Chivo'; color:#B6AC9D">
      <div class="n1">Google can take a few hours to update its link.</div>
      <div class="n2">Need help? Press <b style="color:#F7F3EC">Help</b> in the Member Portal.</div>
    </div>
  </div>
  {page("#B45309", "B", "Bob's Brewery", "OCTOBER", "10", "SATURDAY", "6:00 – 10:00 pm", "Halloween Costume Contest", "right:170px; top:170px; width:340px")}
  <div class="mark" style="position:absolute; left:120px; top:780px; font:700 21px 'Chivo'; letter-spacing:0.22em; color:#B6AC9D">ISC BREWERS GUILD</div>
</div>"""
    js = common_js(s, d).replace(f"{d - 0.4:.2f});", f"{d - 0.9:.2f});").replace("duration: 0.4, ease: \"power1.in\"", "duration: 0.9, ease: \"power1.in\"")
    js += rise(f"#{s} .l1", c(11, "From"), 50)
    js += rise(f"#{s} .l2", c(11, "The"), 50)
    js += rise(f"#{s} .n1", c(11, "Google"), 24)
    js += rise(f"#{s} .n2", c(11, "Need"), 24)
    js += rise(f"#{s} .page", 0.6, 60, 0.8)
    js += f'tl.fromTo("#{s} .page", {{ rotation: 0 }}, {{ rotation: -2.5, duration: 4, ease: "sine.inOut", yoyo: true, repeat: 1, immediateRender: false }}, 2);\n'
    js += fade(f"#{s} .mark", 1.2, 1, 0, 0.6)
    return html, js


BUILDERS = {1: scene1, 2: scene2, 3: scene3, 4: scene4, 5: scene5, 6: scene6, 7: scene7,
            8: scene8, 9: scene9, 10: scene10, 11: scene11}


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
        # merge "hashtag guild" into "#guild", "free busy" into "free/busy"
        merged = []
        i = 0
        while i < len(words):
            w = dict(words[i])
            nxt = words[i + 1]["text"] if i + 1 < len(words) else ""
            if w["text"].lower() == "hashtag" and nxt.lower().startswith("guild"):
                w["text"] = "#" + nxt
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
    <title>Your events calendar, Google — ISC Brewers Guild how-to</title>
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
