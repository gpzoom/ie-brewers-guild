"""Builds the HyperFrames compositions for "Sending email from your guild address".

Writes compositions/frames/NN-*.html (one sub-composition per scene),
compositions/captions.html and index.html from the voice clips' real
lengths and word timings (assets/voice/NN.wav + NN.words.json).
Shares its helpers and look with ../google-food-calendar/build/build.py.

Run from the project root:  python build/build.py
"""
import json
import re
import os
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

LEAD = 0.5  # seconds of picture before the voice starts in every scene
TAIL = {1: 1.0, 2: 1.0, 3: 1.1, 4: 1.1, 5: 1.2, 6: 1.1, 7: 1.1, 8: 1.2, 9: 1.2, 10: 2.4}

SCENES = [
    (1, "welcome"), (2, "before"), (3, "open-settings"), (4, "name-address"), (5, "server"),
    (6, "confirm"), (7, "reply"), (8, "try-it"), (9, "rules"), (10, "help"),
]

# Spoken spellings in SCRIPT.md turned back into written ones for the captions.
CAPTION_FIXES = [
    (r"(\w+),? at I S C brewers guild dot org", r"\1@iscbrewersguild.org"),
    (r"I S C", "ISC"),
    (r"smtp dot resend dot com", "smtp.resend.com"),
    (r"one hundred", "100"),
]

GUILD_ADDR = "president@iscbrewersguild.org"
GUILD_NAME = "ISC Brewers Guild President"


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
    """Scene-local time a spoken word starts (LEAD + its start in the clip)."""
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
#{s} .step {{ position: absolute; left: 120px; top: 70px; font: 700 21px "Chivo"; letter-spacing: 0.16em; text-transform: uppercase; color: #E8913A; border: 2px solid #3A332C; border-radius: 99px; padding: 11px 22px; background: rgba(33,28,23,0.7); }}
#{s} .eyebrow {{ font: 700 21px "Chivo"; letter-spacing: 0.24em; text-transform: uppercase; color: #E8913A; }}
#{s} .h {{ font-family: "Bricolage Grotesque"; font-weight: 800; text-transform: uppercase; color: #F7F3EC; line-height: 1.02; letter-spacing: 0.01em; }}
#{s} .accent {{ color: #E8913A; }}
#{s} .sub {{ font: 400 34px/1.4 "Chivo"; color: #B6AC9D; }}
#{s} .mono {{ font-family: ui-monospace, Consolas, "Courier New", monospace; }}
#{s} .left {{ position: absolute; left: 120px; top: 190px; width: 500px; display: flex; flex-direction: column; gap: 26px; }}
#{s} .left .h {{ font-size: 70px; }}
#{s} .left .sub {{ font-size: 30px; }}
#{s} .panel {{ position: absolute; background: #FBF8F2; color: #241F1A; border-radius: 20px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.45); }}
#{s} .bar {{ height: 62px; display: flex; align-items: center; justify-content: space-between; padding: 0 30px; background: #EFEAE1; font: 600 20px "Chivo"; color: #6B6156; border-bottom: 2px solid #DED7CB; }}
#{s} .badge {{ font: 700 16px "Chivo"; letter-spacing: 0.14em; text-transform: uppercase; color: #6B6156; border: 2px solid #DED7CB; border-radius: 99px; padding: 5px 13px; background: #FBF8F2; }}
#{s} .in {{ position: absolute; left: 0; right: 0; top: 62px; bottom: 0; }}
#{s} .abs {{ position: absolute; }}
#{s} .small {{ font: 400 20px/1.4 "Chivo"; color: #6B6156; }}
#{s} .lab {{ position: absolute; font: 600 22px "Chivo"; color: #241F1A; }}
#{s} .field {{ position: absolute; border: 2px solid #DED7CB; background: #fff; border-radius: 10px; padding: 0 18px; height: 58px; line-height: 54px; font: 400 22px/54px "Chivo"; color: #241F1A; white-space: nowrap; overflow: hidden; }}
#{s} .btn {{ position: absolute; display: inline-flex; align-items: center; justify-content: center; height: 58px; padding: 0 26px; border-radius: 10px; border: 2px solid #D3CBBD; background: #FBF8F2; font: 600 21px "Chivo"; color: #241F1A; }}
#{s} .btn.dark {{ background: #241F1A; color: #fff; border-color: #241F1A; }}
#{s} .link {{ color: #1F5FBF; text-decoration: underline; }}
#{s} .ring {{ position: absolute; border-radius: 14px; box-shadow: 0 0 0 7px #E8913A; pointer-events: none; }}
#{s} .cursor {{ position: absolute; left: 0; top: 0; width: 44px; height: 44px; z-index: 20; }}
#{s} .radio {{ display: inline-block; width: 24px; height: 24px; border-radius: 50%; border: 3px solid #6B6156; vertical-align: -4px; margin-right: 12px; position: relative; }}
#{s} .radio i {{ position: absolute; inset: 4px; border-radius: 50%; background: #241F1A; }}
#{s} .check {{ display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 5px; background: #241F1A; color: #fff; font: 700 18px "Chivo"; vertical-align: -4px; margin-right: 12px; }}
#{s} .card {{ background: #211C17; border: 3px solid #3A332C; border-radius: 22px; }}
#{s} .tip {{ display: flex; gap: 15px; align-items: flex-start; background: #FFF7EE; border: 3px solid #E8913A; border-radius: 15px; padding: 17px 22px; font: 500 23px/1.4 "Chivo"; color: #241F1A; }}
#{s} .tip b.q {{ color: #B45309; font-weight: 800; }}
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


def hide(s, *classes):
    """Start these elements hidden (seek-safe set at 0)."""
    return "".join(f'tl.set("#{s} {c}", {{ opacity: 0 }}, 0);\n' for c in classes)


def swap(s, old, new, at):
    """Show `old` until `at`, then `new` in its place (display toggles, seek-safe)."""
    return (f'tl.set("#{s} {new}", {{ display: "none" }}, 0); tl.set("#{s} {old}", {{ display: "inline" }}, 0);\n'
            f'tl.set("#{s} {old}", {{ display: "none" }}, {at:.2f}); tl.set("#{s} {new}", {{ display: "inline" }}, {at:.2f});\n')


def cursor_path(s, points, press_at=()):
    """points: [(time, x, y), ...] in frame coordinates. First point is where it appears."""
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


def ring_js(s, sel, at, w=7):
    return f'tl.fromTo("#{s} {sel}", {{ boxShadow: "0 0 0 0px #E8913A" }}, {{ boxShadow: "0 0 0 {w}px #E8913A", duration: 0.3, immediateRender: false }}, {at:.2f});\n'


def unring_js(s, sel, at):
    return f'tl.to("#{s} {sel}", {{ boxShadow: "0 0 0 0px #E8913A", duration: 0.3 }}, {at:.2f});\n'


def gbar(label):
    return f'<div class="bar"><span>{label}</span><span class="badge">simplified</span></div>'


# Gmail panels all sit at the same place, so cursor targets are panel-local + this offset.
PX, PY, PW, PH = 690, 150, 1110, 720


def at_panel(x, y):
    return PX + x, PY + y


def gmail_panel(cls, label, inner, h=PH):
    return f"""<div class="panel {cls}" style="left:{PX}px; top:{PY}px; width:{PW}px; height:{h}px">
    {gbar(label)}
    <div class="in">{inner}</div>
  </div>"""


def step_left(step, head, sub):
    return f"""<div class="step">Step {step} of 4</div>
  <div class="left">
    <div class="h head">{head}</div>
    <div class="sub path">{sub}</div>
  </div>"""


def settings_inner(send_rows, reply=True):
    """Gmail Settings › Accounts and Import, drawn panel-local (y is below the bar)."""
    tabs = [("General", 40), ("Labels", 150), ("Inbox", 245), ("Accounts and Import", 335), ("Filters and Blocked Addresses", 590), ("Add-ons", 900)]
    tab_html = "".join(
        f'<span class="abs{" tabacc" if n.startswith("Accounts") else ""}" style="left:{x}px; top:72px; font:{"700" if n.startswith("Accounts") else "400"} 19px \'Chivo\'; padding:6px 8px; margin-left:-8px; border-radius:8px; color:{"#241F1A" if n.startswith("Accounts") else "#6B6156"}">{n}</span>'
        for n, x in tabs)
    rows = f"""
      <div class="abs" style="left:40px; top:16px; font-family:'Bricolage Grotesque'; font-weight:700; font-size:34px">Settings</div>
      {tab_html}
      <div class="abs" style="left:30px; right:30px; top:118px; border-top:2px solid #E6DFD2"></div>
      <div class="lab" style="left:40px; top:150px">Change account settings:</div>
      <div class="abs small" style="left:370px; top:150px"><span class="link">Change password</span> · <span class="link">Google Account settings</span></div>
      <div class="lab" style="left:40px; top:225px">Import mail and contacts:</div>
      <div class="abs small" style="left:370px; top:225px"><span class="link">Import from another address</span></div>
      <div class="lab sendas" style="left:30px; top:300px; padding:4px 10px; border-radius:10px">Send mail as:</div>
      <div class="abs" style="left:370px; top:302px; display:flex; flex-direction:column; gap:12px; font:400 21px 'Chivo'">{send_rows}
        <span class="addlink link" style="align-self:flex-start; padding:2px 8px; margin-left:-8px; border-radius:8px">Add another email address</span>
      </div>"""
    if reply:
        rows += """
      <div class="lab" style="left:40px; top:520px">When replying to a message:</div>
      <div class="abs" style="left:370px; top:518px; display:flex; flex-direction:column; gap:16px; font:400 21px 'Chivo'">
        <span class="rsame" style="align-self:flex-start; padding:4px 10px; margin-left:-10px; border-radius:10px"><span class="radio"><i class="dsame"></i></span>Reply from the same address the message was sent to</span>
        <span class="rdef" style="align-self:flex-start; padding:4px 10px; margin-left:-10px; border-radius:10px"><span class="radio"><i class="ddef"></i></span>Always reply from default address</span>
      </div>"""
    return rows


GUILD_ROW = '<span><b>Guild Gmail</b> <span style="color:#6B6156">&lt;the guild\'s Gmail address&gt;</span> <span class="small">· default</span></span>'
NEW_ROW = f'<span class="newrow" style="align-self:flex-start; padding:2px 8px; margin-left:-8px; border-radius:8px"><b>{GUILD_NAME}</b> <span style="color:#6B6156">&lt;{GUILD_ADDR}&gt;</span> <span class="small">· treat as an alias</span></span>'


# ---------------------------------------------------------------- scenes
def scene1(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-270px; top:-350px"></div>
<div class="stage">
  <div style="position:absolute; left:120px; top:170px; width:900px; display:flex; flex-direction:column; gap:28px">
    <div class="eyebrow">ISC Brewers Guild · Officer how-to</div>
    <div class="h" style="font-size:100px"><div class="l1">Send email from</div><div class="l2 accent">your guild address.</div></div>
    <div class="sub">One-time setup in the guild Gmail account.</div>
  </div>
  <div class="panel mail" style="left:1080px; top:200px; width:720px; height:330px">
    <div class="bar"><span>New Message</span><span class="badge">simplified</span></div>
    <div style="padding:26px 34px; display:flex; flex-direction:column; gap:18px; font:400 23px 'Chivo'">
      <div class="from" style="align-self:flex-start; padding:6px 10px; margin-left:-10px; border-radius:10px"><span style="color:#6B6156">From</span>&nbsp;&nbsp;<b>{GUILD_NAME}</b><br><span class="mono" style="font-size:21px; color:#3A332C">{GUILD_ADDR}</span></div>
      <div style="border-top:2px solid #E6DFD2"></div>
      <div style="color:#6B6156">To&nbsp;&nbsp;<span style="color:#241F1A">a member</span></div>
      <div style="color:#6B6156">Subject&nbsp;&nbsp;<span style="color:#241F1A">Next guild meeting</span></div>
    </div>
  </div>
  <div style="position:absolute; left:1080px; top:570px; width:720px; display:grid; grid-template-columns:1fr 1fr; gap:24px">
    <div class="card in1" style="padding:20px 24px"><div style="font:700 25px 'Chivo'">Receiving</div><div style="font:600 21px 'Chivo'; color:#B6AC9D">✓ Already works</div></div>
    <div class="card out1" style="padding:20px 24px; border-color:#E8913A"><div style="font:700 25px 'Chivo'">Sending</div><div style="font:600 21px 'Chivo'; color:#E8913A">Set up today</div></div>
  </div>
</div>"""
    js = common_js(s, d)
    js += slide(f"#{s} .eyebrow", 0.3)
    js += rise(f"#{s} .l1", 0.5, 50)
    js += rise(f"#{s} .l2", c(1, "send") - 0.2, 50)
    js += rise(f"#{s} .mail", 0.9, 60, 0.7)
    js += ring_js(s, ".from", c(1, "president"))
    js += unring_js(s, ".from", c(1, "Mail"))
    js += rise(f"#{s} .sub", c(1, "right"), 30)
    js += rise(f"#{s} .in1", c(1, "Mail"), 40, 0.55)
    js += rise(f"#{s} .out1", c(1, "sending"), 40, 0.55)
    return html, js


def scene2(s, d):
    c = cue
    cards = [("1", "A computer", "The Gmail phone app can't do this step.", "computer"),
             ("2", "The guild Gmail", "Signed in, not your personal account.", "guild"),
             ("3", "The sending password", "From the webmaster, by phone or in person.", "sending")]
    cells = ""
    for num, title, line, _ in cards:
        cells += f"""<div class="card c{num}" style="padding:40px; height:360px; display:flex; flex-direction:column; gap:22px">
      <div class="h num" style="font-size:110px; color:#E8913A; line-height:0.9">{num}</div>
      <div style="font:700 42px/1.15 'Chivo'">{title}</div>
      <div style="font:400 28px/1.4 'Chivo'; color:#B6AC9D">{line}</div>
    </div>"""
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-380px; top:-500px"></div>
<div class="stage">
  <div class="h title" style="position:absolute; left:120px; top:110px; font-size:88px">You'll need</div>
  <div style="position:absolute; left:120px; right:120px; top:270px; display:grid; grid-template-columns:repeat(3,1fr); gap:48px">{cells}</div>
  <div class="tip keep" style="position:absolute; left:120px; top:690px; width:1080px"><b class="q">!</b><span><b>Keep the sending password private.</b> Never email it, and never show it on screen.</span></div>
</div>"""
    js = common_js(s, d)
    js += slide(f"#{s} .title", 0.35, -50)
    for num, _, _, word in cards:
        at = c(2, word)
        js += rise(f"#{s} .c{num}", at - 0.15, 70, 0.6)
        js += pop(f"#{s} .c{num} .num", at)
    js += ring_js(s, ".c3", c(2, "Keep") - 0.1)
    js += pop(f"#{s} .keep", c(2, "Keep"))
    return html, js


def scene3(s, d):
    c = cue
    inbox = """
      <div class="abs" style="left:34px; top:24px; font-family:'Bricolage Grotesque'; font-weight:700; font-size:34px">Gmail</div>
      <div class="abs" style="left:220px; top:20px; width:560px; height:52px; border-radius:26px; background:#EFEAE1; font:400 21px/52px 'Chivo'; color:#6B6156; padding-left:26px">Search mail</div>
      <div class="abs gear" style="left:936px; top:22px; width:50px; height:50px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:32px; color:#3A332C">⚙</div>
      <div class="abs avatar" style="left:1010px; top:20px; width:56px; height:56px; border-radius:50%; background:#B3591F; color:#fff; display:flex; align-items:center; justify-content:center; font:700 26px 'Chivo'">G</div>
      <div class="abs who" style="left:820px; top:94px; width:260px; background:#241F1A; color:#fff; border-radius:10px; padding:10px 16px; font:600 19px 'Chivo'">Guild Gmail<br><span style="font-weight:400; color:#DED7CB">the guild account ✓</span></div>
      <div class="abs" style="left:34px; top:110px; display:flex; flex-direction:column; gap:14px; font:400 20px 'Chivo'; color:#3A332C">
        <span style="background:#FCE7D2; border-radius:14px; padding:14px 22px; font-weight:600">✎ Compose</span><span style="padding:0 22px; font-weight:700">Inbox</span><span style="padding:0 22px">Starred</span><span style="padding:0 22px">Sent</span>
      </div>
      <div class="abs" style="left:260px; right:40px; top:120px; display:flex; flex-direction:column; font:400 20px 'Chivo'">
        """ + "".join(f'<div style="display:flex; gap:24px; padding:16px 10px; border-bottom:2px solid #EFEAE1"><b style="width:200px">{a}</b><span style="color:#6B6156">{b}</span></div>'
                      for a, b in [("A member", "Question about the next meeting"), ("Website", "New member application"),
                                   ("A brewery", "Collaboration day idea"), ("A member", "Thanks for the newsletter")]) + """
      </div>
      <div class="abs qs" style="left:690px; top:84px; width:390px; background:#fff; border:2px solid #DED7CB; border-radius:14px; box-shadow:0 18px 40px rgba(0,0,0,0.2); padding:20px 24px; display:flex; flex-direction:column; gap:14px">
        <div style="font:700 22px 'Chivo'">Quick settings</div>
        <div class="seeall" style="border:2px solid #D3CBBD; border-radius:24px; text-align:center; padding:10px 0; font:600 20px 'Chivo'; color:#1F5FBF">See all settings</div>
        <div class="small">Density · Theme · Inbox type</div>
      </div>"""
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-460px; bottom:-600px"></div>
<div class="stage">
  {step_left(1, "Open settings", "Gear icon → See all settings → Accounts and Import.")}
  <div class="panel gp" style="left:{PX}px; top:{PY}px; width:{PW}px; height:{PH}px">
    {gbar("Gmail")}
    <div class="in v1">{inbox}</div>
    <div class="in v2">{settings_inner(GUILD_ROW, reply=False)}</div>
  </div>
  <div class="cursor">{CURSOR_SVG}</div>
</div>"""
    pic, gear, see, acc, find, add = (c(3, "picture"), c(3, "gear"), c(3, "See"), c(3, "Accounts"), c(3, "Find"), c(3, "Add"))
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", c(3, "Step"), -50)
    js += rise(f"#{s} .path", gear, 24)
    js += rise(f"#{s} .gp", 0.45, 70, 0.7)
    js += hide(s, ".who", ".qs", ".v2")
    js += ring_js(s, ".avatar", pic) + pop(f"#{s} .who", pic + 0.2, 0.45)
    js += unring_js(s, ".avatar", gear - 0.4) + fade(f"#{s} .who", gear - 0.4, 0, 1, 0.3)
    js += ring_js(s, ".gear", gear) + unring_js(s, ".gear", gear + 0.6)
    js += rise(f"#{s} .qs", gear + 0.25, 16, 0.35)
    js += ring_js(s, ".seeall", see)
    js += fade(f"#{s} .v1", see + 0.45, 0, 1, 0.3) + fade(f"#{s} .v2", see + 0.5, 1, 0, 0.35)
    js += ring_js(s, ".tabacc", acc)
    js += unring_js(s, ".tabacc", find - 0.2) + ring_js(s, ".sendas", find)
    js += unring_js(s, ".sendas", add - 0.2) + ring_js(s, ".addlink", add)
    js += cursor_path(s, [(pic - 0.9, 1250, 640), (pic, *at_panel(1040, 110)), (gear - 0.5, *at_panel(1040, 110)),
                          (gear, *at_panel(962, 110)), (see - 0.6, *at_panel(962, 110)), (see, *at_panel(900, 194)),
                          (acc - 0.6, *at_panel(900, 194)), (acc, *at_panel(450, 152)), (add - 0.7, *at_panel(450, 152)),
                          (add, *at_panel(470, 418))],
                      press_at=(gear + 0.05, see + 0.05, acc + 0.05, add + 0.1))
    return html, js


def scene4(s, d):
    c = cue
    inner = """
      <div class="abs" style="left:60px; top:40px; font:700 32px 'Chivo'">Add another email address you own</div>
      <div class="abs small" style="left:60px; top:92px">Enter information about your other email address.<br>(your name and email address will be shown on mail you send)</div>
      <div class="lab" style="left:60px; top:224px">Name:</div>
      <div class="field fname" style="left:300px; top:208px; width:660px"></div>
      <div class="lab" style="left:60px; top:314px">Email address:</div>
      <div class="field femail" style="left:300px; top:298px; width:660px"></div>
      <div class="abs alias" style="left:290px; top:390px; padding:6px 10px; border-radius:10px; font:400 22px 'Chivo'"><span class="check">✓</span>Treat as an alias. <span class="link small">Learn more</span></div>
      <div class="abs small" style="left:300px; top:450px"><span class="link">Specify a different "reply-to" address</span> (optional)</div>
      <div class="btn" style="left:560px; top:560px">Cancel</div>
      <div class="btn dark next" style="left:720px; top:560px; width:240px">Next Step »</div>"""
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-500px; top:-560px"></div>
<div class="stage">
  {step_left(2, "Name and address", "The name people see, and your guild address.")}
  <div class="tip blocked" style="position:absolute; left:120px; top:640px; width:500px"><b class="q">?</b><span>No window? Allow pop-ups for <b>mail.google.com</b>, then click again.</span></div>
  {gmail_panel("pop", "Gmail · Add another email address", inner, 680)}
  <div class="cursor">{CURSOR_SVG}</div>
</div>"""
    win, blocked, typ, addr, leave, nxt = (c(4, "window"), c(4, "doesn't"), c(4, "Type"), c(4, "address"), c(4, "Leave"), c(4, "Next"))
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", c(4, "Step"), -50)
    js += rise(f"#{s} .path", typ, 24)
    js += rise(f"#{s} .pop", win - 0.1, 60, 0.6)
    js += pop(f"#{s} .blocked", blocked)
    js += ring_js(s, ".fname", typ) + typing(f"#{s} .fname", GUILD_NAME, c(4, "name") + 0.1, 2.2)
    js += unring_js(s, ".fname", addr - 0.4) + ring_js(s, ".femail", addr - 0.3)
    js += typing(f"#{s} .femail", GUILD_ADDR, addr - 0.2, 1.6)
    js += unring_js(s, ".femail", leave - 0.2) + ring_js(s, ".alias", leave)
    js += unring_js(s, ".alias", nxt - 0.3) + ring_js(s, ".next", nxt)
    js += cursor_path(s, [(win + 0.4, 1300, 700), (typ, *at_panel(620, 300)), (addr - 0.6, *at_panel(620, 300)),
                          (addr - 0.3, *at_panel(620, 390)), (leave - 0.5, *at_panel(620, 390)), (leave, *at_panel(316, 470)),
                          (nxt - 0.6, *at_panel(316, 470)), (nxt, *at_panel(840, 650))],
                      press_at=(typ + 0.05, addr - 0.25, leave + 0.05, nxt + 0.1))
    return html, js


def scene5(s, d):
    c = cue
    inner = """
      <div class="abs" style="left:60px; top:34px; font:700 32px 'Chivo'">Send mail through your SMTP server</div>
      <div class="abs small" style="left:60px; top:84px">Configure your mail to be sent through iscbrewersguild.org SMTP servers</div>
      <div class="lab" style="left:60px; top:166px">SMTP Server:</div>
      <div class="field fsrv mono" style="left:270px; top:150px; width:470px"></div>
      <div class="lab" style="left:780px; top:166px">Port:</div>
      <div class="field fport" style="left:850px; top:150px; width:150px"><span class="p587">587 ▾</span><span class="p465">465 ▾</span></div>
      <div class="lab" style="left:60px; top:256px">Username:</div>
      <div class="field fuser mono" style="left:270px; top:240px; width:470px"></div>
      <div class="lab" style="left:60px; top:346px">Password:</div>
      <div class="field fpw" style="left:270px; top:330px; width:470px; letter-spacing:3px"></div>
      <div class="abs small pwnote" style="left:770px; top:346px">Shown as dots</div>
      <div class="abs" style="left:260px; top:420px; display:flex; flex-direction:column; gap:14px; font:400 22px 'Chivo'">
        <span class="rssl" style="align-self:flex-start; padding:4px 10px; border-radius:10px"><span class="radio"><i class="dssl"></i></span>Secured connection using <span class="link">SSL</span> <b>(recommended)</b></span>
        <span style="padding:4px 10px"><span class="radio"><i class="dtls"></i></span>Secured connection using <span class="link">TLS</span></span>
      </div>
      <div class="btn" style="left:470px; top:570px">Cancel</div>
      <div class="btn" style="left:620px; top:570px">« Back</div>
      <div class="btn dark addacc" style="left:770px; top:570px; width:250px">Add Account »</div>"""
    rows = [("SMTP Server", "smtp.resend.com"), ("Port", "465"), ("Username", "resend"),
            ("Password", "from the webmaster"), ("Connection", "SSL")]
    cheat = "".join(f'<div class="cr cr{i}" style="display:flex; justify-content:space-between; gap:16px; padding:12px 18px; border-radius:12px"><span style="color:#B6AC9D">{k}</span><b class="{"mono" if i in (0, 1, 2) else ""}" style="color:#F7F3EC">{v}</b></div>'
                    for i, (k, v) in enumerate(rows))
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-380px; top:-460px"></div>
<div class="stage">
  <div class="step">Step 3 of 4</div>
  <div class="left" style="gap:22px">
    <div class="h head">Server settings</div>
    <div class="card cheat" style="padding:14px; display:flex; flex-direction:column; gap:4px; font:400 24px 'Chivo'">{cheat}</div>
  </div>
  {gmail_panel("pop", "Gmail · Add another email address", inner, 680)}
  <div class="cursor">{CURSOR_SVG}</div>
</div>"""
    srv, pick, user, word, pw, choose, add = (c(5, "smtp", 2), c(5, "Pick"), c(5, "username"), c(5, "word"), c(5, "paste"), c(5, "Choose"), c(5, "Add"))
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", c(5, "Step"), -50)
    js += rise(f"#{s} .pop", 0.4, 60, 0.6)
    js += rise(f"#{s} .cheat", c(5, "Type"), 30)
    hl = lambda i, on, off: (f'tl.fromTo("#{s} .cr{i}", {{ backgroundColor: "rgba(232,145,58,0)" }}, {{ backgroundColor: "rgba(232,145,58,0.28)", duration: 0.25, immediateRender: false }}, {on:.2f});\n'
                             f'tl.to("#{s} .cr{i}", {{ backgroundColor: "rgba(232,145,58,0)", duration: 0.25 }}, {off:.2f});\n')
    js += hl(0, srv - 0.3, pick - 0.2) + hl(1, pick, user - 0.2) + hl(2, user, pw - 0.6) + hl(3, pw - 0.4, choose - 0.2) + hl(4, choose, add)
    js += ring_js(s, ".fsrv", srv - 0.3) + typing(f"#{s} .fsrv", "smtp.resend.com", srv, 1.4) + unring_js(s, ".fsrv", pick - 0.3)
    js += hide(s, ".dssl", ".pwnote") + swap(s, ".p587", ".p465", pick + 0.5)
    js += fade(f"#{s} .dtls", pick + 0.55, 0, 1, 0.15) + fade(f"#{s} .dssl", pick + 0.55, 1, 0, 0.15)
    js += ring_js(s, ".fport", pick) + unring_js(s, ".fport", user - 0.3)
    js += ring_js(s, ".fuser", user) + typing(f"#{s} .fuser", "resend", word + 0.2, 0.7) + unring_js(s, ".fuser", pw - 0.6)
    js += ring_js(s, ".fpw", pw - 0.4)
    js += f'tl.set("#{s} .fpw", {{ textContent: "" }}, 0); tl.set("#{s} .fpw", {{ textContent: "••••••••••••••••••••••••" }}, {pw + 0.35:.2f});\n'
    js += fade(f"#{s} .pwnote", pw + 0.5) + unring_js(s, ".fpw", choose - 0.3)
    js += ring_js(s, ".rssl", choose)
    js += unring_js(s, ".rssl", add - 0.3) + ring_js(s, ".addacc", add)
    js += cursor_path(s, [(srv - 0.9, 1300, 760), (srv - 0.3, *at_panel(500, 240)), (pick - 0.5, *at_panel(500, 240)),
                          (pick, *at_panel(930, 240)), (user - 0.4, *at_panel(930, 240)), (user, *at_panel(500, 330)),
                          (pw - 0.8, *at_panel(500, 330)), (pw - 0.3, *at_panel(500, 420)), (choose - 0.5, *at_panel(500, 420)),
                          (choose + 0.3, *at_panel(286, 502)), (add - 0.6, *at_panel(286, 502)), (add, *at_panel(900, 660))],
                      press_at=(srv - 0.25, pick + 0.05, user + 0.05, pw + 0.1, choose + 0.4, add + 0.1))
    return html, js


def scene6(s, d):
    c = cue
    rows = "".join(f'<div style="display:flex; gap:24px; padding:16px 10px; border-bottom:2px solid #EFEAE1"><b style="width:200px; font-weight:400">{a}</b><span style="color:#6B6156">{b}</span></div>'
                   for a, b in [("A member", "Question about the next meeting"), ("Website", "New member application"), ("A brewery", "Collaboration day idea")])
    inner = f"""
      <div class="v1">
        <div class="abs" style="left:34px; top:24px; font-family:'Bricolage Grotesque'; font-weight:700; font-size:34px">Inbox</div>
        <div class="abs" style="left:30px; right:30px; top:100px; display:flex; flex-direction:column; font:400 20px 'Chivo'">
          <div class="newmail" style="display:flex; gap:24px; padding:16px 10px; border-bottom:2px solid #EFEAE1; border-radius:10px; background:#FFF7EE"><b style="width:200px">Gmail Team</b><b>Gmail Confirmation - Send Mail as {GUILD_ADDR}</b></div>
          {rows}
        </div>
      </div>
      <div class="v2">
        <div class="abs" style="left:50px; top:30px; right:50px; font:700 28px/1.3 'Chivo'">Gmail Confirmation - Send Mail as {GUILD_ADDR}</div>
        <div class="abs small" style="left:50px; top:120px">Gmail Team</div>
        <div class="abs" style="left:50px; top:180px; right:60px; display:flex; flex-direction:column; gap:20px; font:400 22px/1.5 'Chivo'">
          <span>You have requested to add <b>{GUILD_ADDR}</b> to your Gmail account.</span>
          <span>To confirm your request, click the link below:</span>
          <span class="vlink link" style="align-self:flex-start; padding:4px 10px; margin-left:-10px; border-radius:10px">https://mail-settings.google.com/mail/vf-…</span>
        </div>
        <div class="abs okmsg" style="left:50px; top:450px; background:#E7F2E5; color:#2F6B2B; border-radius:14px; padding:18px 26px; font:700 26px 'Chivo'">✓ Confirmation Success!</div>
      </div>"""
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-500px; bottom:-600px"></div>
<div class="stage">
  {step_left(4, "Confirm", "The email comes back to this same inbox.")}
  <div class="tip spam" style="position:absolute; left:120px; top:640px; width:500px"><b class="q">?</b><span>Not there after a few minutes? Check your <b>Spam</b> folder.</span></div>
  {gmail_panel("gp", "Gmail", inner, 620)}
  <div class="cursor">{CURSOR_SVG}</div>
</div>"""
    arr, opn, link, nothing = c(6, "arrives"), c(6, "Open"), c(6, "link"), c(6, "Nothing")
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", c(6, "Step"), -50)
    js += rise(f"#{s} .path", c(6, "sends"), 24)
    js += rise(f"#{s} .gp", 0.4, 60, 0.6)
    js += hide(s, ".v2", ".okmsg")
    js += rise(f"#{s} .newmail", arr, -30, 0.5) + ring_js(s, ".newmail", arr + 0.3)
    js += fade(f"#{s} .v1", opn + 0.4, 0, 1, 0.25) + fade(f"#{s} .v2", opn + 0.45, 1, 0, 0.3)
    js += ring_js(s, ".vlink", link) + pop(f"#{s} .okmsg", link + 0.6, 0.45)
    js += pop(f"#{s} .spam", nothing)
    js += cursor_path(s, [(arr + 0.3, 1400, 700), (opn, *at_panel(600, 132)), (link - 0.6, *at_panel(600, 132)), (link, *at_panel(300, 318))],
                      press_at=(opn + 0.1, link + 0.2))
    return html, js


def scene7(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-380px; top:-460px"></div>
<div class="stage">
  <div class="left">
    <div class="eyebrow">One last setting</div>
    <div class="h head">Reply from the same address</div>
    <div class="sub path">Replies go out from the address they were sent to.</div>
  </div>
  <div class="panel gp" style="left:{PX}px; top:{PY}px; width:{PW}px; height:{PH}px">
    {gbar("Gmail · Settings")}
    <div class="in">{settings_inner(GUILD_ROW + NEW_ROW)}</div>
  </div>
  <div class="cursor">{CURSOR_SVG}</div>
</div>"""
    back, when, choose, now = c(7, "Back"), c(7, "When"), c(7, "choose"), c(7, "Now")
    js = common_js(s, d)
    js += slide(f"#{s} .eyebrow", 0.3)
    js += slide(f"#{s} .head", when, -50)
    js += rise(f"#{s} .path", now, 24)
    js += rise(f"#{s} .gp", 0.4, 60, 0.6)
    js += ring_js(s, ".tabacc", back) + ring_js(s, ".newrow", back + 0.5)
    js += unring_js(s, ".tabacc", when - 0.3) + unring_js(s, ".newrow", when - 0.3)
    js += hide(s, ".dsame") + ring_js(s, ".rsame", choose)
    js += fade(f"#{s} .ddef", choose + 0.75, 0, 1, 0.15) + fade(f"#{s} .dsame", choose + 0.75, 1, 0, 0.15)
    js += cursor_path(s, [(when - 0.2, 1400, 760), (choose + 0.5, *at_panel(386, 552))], press_at=(choose + 0.6,))
    return html, js


def scene8(s, d):
    c = cue
    inner = f"""
      <div class="abs from" style="left:30px; top:24px; padding:6px 12px; border-radius:10px; font:400 23px 'Chivo'"><span style="color:#6B6156">From</span>&nbsp;&nbsp;<span class="f1"><b>Guild Gmail</b> ▾</span><span class="f2"><b>{GUILD_NAME}</b> <span style="color:#6B6156">&lt;{GUILD_ADDR}&gt;</span> ▾</span></div>
      <div class="abs" style="left:30px; right:30px; top:88px; border-top:2px solid #E6DFD2"></div>
      <div class="abs" style="left:42px; top:112px; font:400 23px 'Chivo'; color:#6B6156">To&nbsp;&nbsp;<span class="to" style="color:#241F1A"></span></div>
      <div class="abs" style="left:30px; right:30px; top:166px; border-top:2px solid #E6DFD2"></div>
      <div class="abs" style="left:42px; top:190px; font:400 23px 'Chivo'; color:#6B6156">Subject&nbsp;&nbsp;<span style="color:#241F1A">Test</span></div>
      <div class="abs" style="left:30px; right:30px; top:244px; border-top:2px solid #E6DFD2"></div>
      <div class="abs" style="left:42px; top:274px; font:400 23px 'Chivo'">Testing my guild address.</div>
      <div class="btn dark send" style="left:42px; top:530px; width:140px; border-radius:29px">Send</div>
      <div class="abs dd" style="left:130px; top:70px; width:760px; background:#fff; border:2px solid #DED7CB; border-radius:12px; box-shadow:0 18px 40px rgba(0,0,0,0.2); display:flex; flex-direction:column; font:400 22px 'Chivo'">
        <div style="padding:16px 22px; border-bottom:2px solid #EFEAE1">Guild Gmail <span style="color:#6B6156">&lt;the guild's Gmail address&gt;</span></div>
        <div class="opt2" style="padding:16px 22px; border-radius:10px"><b>{GUILD_NAME}</b> <span style="color:#6B6156">&lt;{GUILD_ADDR}&gt;</span></div>
      </div>"""
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-500px; top:-560px"></div>
<div class="stage">
  <div class="left">
    <div class="eyebrow">Test it</div>
    <div class="h head">Pick your guild address</div>
    <div class="sub path">Send a test to your personal email.</div>
  </div>
  {gmail_panel("gp", "Gmail · New Message", inner, 640)}
  <div class="panel recv" style="left:840px; top:330px; width:900px; height:180px">
    <div class="bar"><span>Your personal inbox</span><span class="badge">simplified</span></div>
    <div style="padding:22px 30px; display:flex; flex-direction:column; gap:8px; font:400 22px 'Chivo'">
      <div><b>{GUILD_NAME}</b> <span class="mono" style="font-size:19px; color:#6B6156">{GUILD_ADDR}</span></div>
      <div style="color:#3A332C">Test — Testing my guild address.</div>
    </div>
  </div>
  <div class="done" style="position:absolute; left:120px; top:640px; background:#E8913A; color:#171410; border-radius:16px; padding:18px 28px; font:800 30px 'Chivo'">✓ Setup done</div>
  <div class="cursor">{CURSOR_SVG}</div>
</div>"""
    comp, frm, pick, send, there, setw = c(8, "Compose"), c(8, "From"), c(8, "pick"), c(8, "Send"), c(8, "There"), c(8, "set")
    js = common_js(s, d)
    js += slide(f"#{s} .eyebrow", 0.3)
    js += slide(f"#{s} .head", pick, -50)
    js += rise(f"#{s} .path", send, 24)
    js += rise(f"#{s} .gp", comp - 0.1, 60, 0.6)
    js += hide(s, ".dd", ".recv", ".done") + swap(s, ".f1", ".f2", pick + 0.85)
    js += ring_js(s, ".from", frm) + rise(f"#{s} .dd", frm + 0.35, -10, 0.3)
    js += f'tl.fromTo("#{s} .opt2", {{ backgroundColor: "rgba(252,231,210,0)" }}, {{ backgroundColor: "rgba(252,231,210,1)", duration: 0.2, immediateRender: false }}, {pick + 0.2:.2f});\n'
    js += fade(f"#{s} .dd", pick + 0.8, 0, 1, 0.2)
    js += unring_js(s, ".from", send - 0.4)
    js += typing(f"#{s} .to", "your.name@example.com", send + 0.2, 1.0)
    js += ring_js(s, ".send", c(8, "email") + 0.1)
    js += unring_js(s, ".send", there - 0.3) + fade(f"#{s} .gp", there - 0.3, 0.35, 1, 0.4) + fade(f"#{s} .cursor", there - 0.3, 0, 1, 0.3) + rise(f"#{s} .recv", there - 0.2, 60, 0.6) + ring_js(s, ".recv", there + 0.5)
    js += pop(f"#{s} .done", setw)
    js += cursor_path(s, [(frm - 0.6, 1300, 700), (frm, *at_panel(120, 98)), (pick - 0.4, *at_panel(120, 98)),
                          (pick + 0.1, *at_panel(400, 196)), (send - 0.2, *at_panel(400, 196)), (send + 0.1, *at_panel(400, 186)),
                          (c(8, "email"), *at_panel(110, 622))],
                      press_at=(frm + 0.1, pick + 0.2, send + 0.15, c(8, "email") + 0.2))
    return html, js


def scene9(s, d):
    c = cue
    rules = [("Check the From line", "Before every send.", "Check"),
             ("No mass mailings", "100 emails a day in total, shared with the website.", "No"),
             ("Guild business only", "The inbox passes to the next officer.", "Use"),
             ("Never share a password", "Not by email, not by text.", "never")]
    cells = "".join(f"""<div class="card r{i}" style="padding:30px 36px; display:flex; gap:28px; align-items:flex-start">
      <div class="h" style="font-size:72px; color:#E8913A; line-height:0.9">{i + 1}</div>
      <div style="display:flex; flex-direction:column; gap:10px"><div style="font:700 38px/1.15 'Chivo'">{t}</div><div style="font:400 27px/1.4 'Chivo'; color:#B6AC9D">{l}</div></div>
    </div>""" for i, (t, l, _) in enumerate(rules))
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-380px; top:-500px"></div>
<div class="stage">
  <div class="h title" style="position:absolute; left:120px; top:100px; font-size:88px">Ground rules</div>
  <div style="position:absolute; left:120px; right:120px; top:250px; display:grid; grid-template-columns:1fr 1fr; gap:36px">{cells}</div>
</div>"""
    js = common_js(s, d)
    js += slide(f"#{s} .title", 0.35, -50)
    for i, (_, _, w) in enumerate(rules):
        js += rise(f"#{s} .r{i}", c(9, w) - 0.15, 60, 0.55)
    return html, js


def scene10(s, d):
    c = cue
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:420px; top:-190px; width:1340px; height:1340px"></div>
<div class="stage">
  <div style="position:absolute; left:120px; top:180px; width:1300px; display:flex; flex-direction:column; gap:36px">
    <div class="h" style="font-size:96px"><div class="l1">Stuck?</div><div class="l2 accent">Email the webmaster.</div></div>
    <div class="addr" style="align-self:flex-start; background:#211C17; border:3px solid #E8913A; border-radius:18px; padding:20px 30px; font:600 40px 'Chivo'" ><span class="mono">webmaster@iscbrewersguild.org</span></div>
    <div class="n1" style="font:400 33px/1.45 'Chivo'; color:#B6AC9D">The written guide has every setting and a troubleshooting list.</div>
  </div>
  <div class="mark" style="position:absolute; left:120px; top:800px; font:700 21px 'Chivo'; letter-spacing:0.22em; color:#B6AC9D">ISC BREWERS GUILD · THANKS FOR SERVING</div>
</div>"""
    js = common_js(s, d).replace(f"{d - 0.4:.2f});", f"{d - 0.9:.2f});").replace("duration: 0.4, ease: \"power1.in\"", "duration: 0.9, ease: \"power1.in\"")
    js += rise(f"#{s} .n1", c(10, "written"), 24)
    js += rise(f"#{s} .l1", c(10, "stuck"), 50)
    js += rise(f"#{s} .l2", c(10, "send") , 50)
    js += pop(f"#{s} .addr", c(10, "webmaster"))
    js += fade(f"#{s} .mark", c(10, "Thanks"), 1, 0, 0.6)
    return html, js


BUILDERS = {1: scene1, 2: scene2, 3: scene3, 4: scene4, 5: scene5, 6: scene6, 7: scene7, 8: scene8, 9: scene9, 10: scene10}


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
        # One caption per sentence; a long sentence splits once, near its middle.
        sentences, cur = [], []
        for w in WORDS[n]:
            cur.append(w)
            if w["text"].endswith((".", "?", "!")):
                sentences.append(cur)
                cur = []
        if cur:
            sentences.append(cur)
        joints = {"and", "so", "then", "like", "right", "because", "since", "by", "from", "for"}
        for sent in sentences:
            if len(sent) <= 12:
                groups.append((n, sent))
                continue
            half = len(sent) / 2
            cands = [k for k in range(3, len(sent) - 2) if sent[k]["text"].lower().strip(",") in joints]
            cut = min(cands, key=lambda k: abs(k - half)) if cands else int(half)
            groups.append((n, sent[:cut]))
            groups.append((n, sent[cut:]))
    out = []
    for n, ws in groups:
        a = START[n] + LEAD + ws[0]["start"]
        b = START[n] + LEAD + ws[-1]["end"] + 0.15
        text = " ".join(w["text"] for w in ws)
        for pat, rep in CAPTION_FIXES:
            text = re.sub(pat, rep, text, flags=re.I)
        out.append((round(a, 2), round(b, 2), text))
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
    return groups


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
    <title>Sending email from your guild address — ISC Brewers Guild officer how-to</title>
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
    caps = write_captions()
    write_index(paths)
    print(f"total {TOTAL}s · {len(paths)} scenes · {len(caps)} caption groups")
    for n, name in SCENES:
        print(f"  {n:02d} {name:14s} start {START[n]:7.2f}  dur {DUR[n]:6.2f}  voice {VOICE[n]:6.2f}")
    if "--captions" in os.sys.argv:
        for a, b, text in caps:
            print(f"  {a:7.2f}  {text}")
