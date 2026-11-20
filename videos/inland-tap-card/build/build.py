"""Builds the HyperFrames compositions for "The Inland Scan Pass: one pass, two jobs".

Writes compositions/frames/NN-*.html (one sub-composition per scene),
compositions/captions.html and index.html from the voice clips' real
lengths and word timings (assets/voice/NN.wav + NN.words.json).

Phone screens and portal panels are rebuilt from the site's own Scan Pass
components, with their real wording (PlateScreen, PlateSuccess, TrailJoinForm,
TapCardPassesCard, CounterPlateCard, TapCardOffersSection).

Run from the project root:  python build/build.py
"""
import json
import re
import os
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)

LEAD = 0.5  # seconds of picture before the voice starts in every scene
TAIL = {1: 0.9, 2: 0.9, 3: 1.0, 4: 1.0, 5: 1.0, 6: 0.9, 7: 1.1, 8: 1.0, 9: 3.0}

SCENES = [
    (1, "what-if"), (2, "two-jobs"), (3, "beer-trail"), (4, "you-earn"), (5, "loyalty"),
    (6, "email-list"), (7, "at-the-counter"), (8, "set-up"), (9, "grow-the-guild"),
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
#{s} .step {{ position: absolute; left: 120px; top: 84px; font: 700 21px "Chivo"; letter-spacing: 0.16em; text-transform: uppercase; color: #E8913A; border: 2px solid #3A332C; border-radius: 99px; padding: 11px 22px; background: rgba(33,28,23,0.7); }}
#{s} .eyebrow {{ font: 700 21px "Chivo"; letter-spacing: 0.24em; text-transform: uppercase; color: #E8913A; }}
#{s} .h {{ font-family: "Bricolage Grotesque"; font-weight: 800; text-transform: uppercase; color: #F7F3EC; line-height: 1.02; letter-spacing: 0.01em; }}
#{s} .accent {{ color: #E8913A; }}
#{s} .sub {{ font: 400 34px/1.4 "Chivo"; color: #B6AC9D; }}
#{s} .left {{ position: absolute; left: 120px; top: 230px; width: 520px; display: flex; flex-direction: column; gap: 26px; }}
#{s} .left .h {{ font-size: 76px; }}
#{s} .left .sub {{ font-size: 31px; }}
#{s} .chip {{ align-self: flex-start; display: inline-flex; align-items: center; gap: 12px; font: 600 27px "Chivo"; color: #F7F3EC; background: #211C17; border: 3px solid #E8913A; border-radius: 16px; padding: 14px 22px; }}
#{s} .chip.quiet {{ border-color: #3A332C; }}
#{s} .panel {{ position: absolute; background: #FBF8F2; color: #241F1A; border-radius: 20px; overflow: hidden; box-shadow: 0 24px 60px rgba(0,0,0,0.45); }}
#{s} .small {{ font: 400 20px/1.4 "Chivo"; color: #6B6156; }}
#{s} .caps {{ font: 700 16px "Chivo"; letter-spacing: 0.12em; text-transform: uppercase; color: #6B6156; }}
#{s} .btn {{ display: inline-flex; align-items: center; justify-content: center; gap: 11px; height: 54px; padding: 0 24px; border-radius: 12px; border: 2px solid #D3CBBD; background: #fff; font: 600 19px "Chivo"; color: #241F1A; }}
#{s} .ring {{ position: absolute; border-radius: 14px; box-shadow: 0 0 0 7px #E8913A; pointer-events: none; }}
/* the customer's phone (TapCardShell: dark page, brand bar, paper canvas card) */
#{s} .phone {{ position: absolute; width: 420px; height: 800px; border-radius: 58px; background: #0D0B09; border: 3px solid #3A332C; padding: 16px; box-shadow: 0 30px 70px rgba(0,0,0,0.6); }}
#{s} .phone .screen {{ position: relative; width: 100%; height: 100%; border-radius: 44px; background: #171410; overflow: hidden; }}
#{s} .phone .notch {{ position: absolute; left: 50%; top: 12px; width: 110px; height: 30px; margin-left: -55px; border-radius: 99px; background: #0D0B09; z-index: 3; }}
#{s} .phone .brand {{ height: 96px; display: flex; align-items: flex-end; gap: 12px; padding: 0 26px 16px; font: 700 15px "Chivo"; letter-spacing: 0.16em; color: #B6AC9D; }}
#{s} .phone .brand i {{ width: 30px; height: 30px; border-radius: 6px; background: #38322A; display: inline-block; }}
#{s} .phone .view {{ position: absolute; left: 10px; right: 10px; top: 104px; }}
#{s} .canvas {{ background: #FBF8F2; color: #241F1A; border-radius: 22px; padding: 30px 24px 30px; display: flex; flex-direction: column; gap: 18px; }}
#{s} .canvas .eb {{ font: 600 14px "Chivo"; letter-spacing: 0.14em; text-transform: uppercase; color: #6B6156; }}
#{s} .canvas .ch {{ font-family: "Bricolage Grotesque"; font-weight: 700; font-size: 31px; line-height: 1.12; color: #241F1A; }}
#{s} .canvas .lead {{ font: 400 18px/1.5 "Chivo"; color: #6B6156; }}
#{s} .canvas .pbtn {{ height: 60px; border-radius: 12px; background: #B3591F; color: #fff; display: flex; align-items: center; justify-content: center; font: 600 19px "Chivo"; }}
#{s} .canvas .sbtn {{ height: 54px; border-radius: 11px; background: #fff; border: 2px solid #DED7CB; color: #241F1A; display: flex; align-items: center; justify-content: center; font: 500 17px "Chivo"; }}
#{s} .canvas .lnk {{ font: 500 17px "Chivo"; color: #B3591F; text-decoration: underline; text-underline-offset: 3px; }}
#{s} .canvas .opt {{ display: flex; align-items: center; gap: 14px; min-height: 54px; border: 2px solid #DED7CB; background: #fff; border-radius: 12px; padding: 10px 16px; font: 400 17px/1.35 "Chivo"; color: #241F1A; }}
#{s} .canvas .dot {{ flex-shrink: 0; width: 22px; height: 22px; border-radius: 50%; border: 2px solid #8A8072; position: relative; }}
#{s} .canvas .dot.on::after {{ content: ""; position: absolute; inset: 4px; border-radius: 50%; background: #B3591F; }}
#{s} .canvas .box {{ flex-shrink: 0; width: 24px; height: 24px; border-radius: 5px; border: 2px solid #8A8072; background: #fff; display: flex; align-items: center; justify-content: center; font: 700 17px "Chivo"; color: #fff; }}
#{s} .canvas .field {{ height: 54px; border: 2px solid #DED7CB; background: #fff; border-radius: 10px; padding: 0 16px; display: flex; align-items: center; font: 400 18px "Chivo"; color: #241F1A; }}
#{s} .qr {{ display: block; }}
"""


def common_js(s, d, out=0.4):
    """Fade the scene in and out, and breathe its glow. Returns JS lines."""
    reps = max(0, int(d // 3.2) - 1)
    return f"""
tl.fromTo("#{s} .stage", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.45, ease: "power1.out" }}, 0);
tl.fromTo("#{s} .stage", {{ opacity: 1 }}, {{ opacity: 0, duration: {out}, ease: "power1.in", immediateRender: false }}, {d - out:.2f});
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


def hide(sel):
    return f'tl.set("{sel}", {{ opacity: 0 }}, 0);\n'


def ring_js(s, sel, at, w=7):
    return f'tl.fromTo("#{s} {sel}", {{ boxShadow: "0 0 0 0px #E8913A" }}, {{ boxShadow: "0 0 0 {w}px #E8913A", duration: 0.3, immediateRender: false }}, {at:.2f});\n'


def unring_js(s, sel, at):
    return f'tl.to("#{s} {sel}", {{ boxShadow: "0 0 0 0px #E8913A", duration: 0.3 }}, {at:.2f});\n'


def pulse_js(s, sel, at, color="232,145,58"):
    return f'tl.fromTo("#{s} {sel}", {{ boxShadow: "0 0 0 0px rgba({color},0.6)" }}, {{ boxShadow: "0 0 0 22px rgba({color},0)", duration: 0.9, ease: "power1.out", repeat: 1, immediateRender: false }}, {at:.2f});\n'


def count_js(sel, frm, to, at, dur, fmt="n"):
    """Counts a number up in `sel` (seek-safe: text derived from a tweened value)."""
    return (
        f'(function () {{ const el = document.querySelector("{sel}"); const p = {{ v: {frm} }};\n'
        f'  tl.fromTo(p, {{ v: {frm} }}, {{ v: {to}, duration: {dur}, ease: "power1.inOut", immediateRender: false,\n'
        f'    onUpdate() {{ el.textContent = String(Math.round(p.v)); }} }}, {at:.2f});\n'
        f'  tl.set(el, {{ textContent: "{frm}" }}, 0); }})();\n'
    )


def qr_svg(seed, size, fg="#241F1A", bg="#FFFFFF"):
    """A QR-looking pattern (decorative; deterministic from `seed`)."""
    n = 25
    x = seed * 2654435761 % 4294967296
    cells = []

    def finder(r, c):
        return (r < 7 and c < 7) or (r < 7 and c >= n - 7) or (r >= n - 7 and c < 7)

    for r in range(n):
        for c in range(n):
            if finder(r, c):
                rr, cc = r % (n - 7) if r >= n - 7 else r, c % (n - 7) if c >= n - 7 else c
                on = rr in (0, 6) or cc in (0, 6) or (2 <= rr <= 4 and 2 <= cc <= 4)
            elif (r == 7 or c == 7 or (r == n - 8 and c < 8) or (c == n - 8 and r < 8)):
                on = False
            else:
                x = (1103515245 * x + 12345) % 2147483648
                on = (x >> 16) & 1
            if on:
                cells.append(f'<rect x="{c}" y="{r}" width="1.02" height="1.02"/>')
    return (f'<svg class="qr" width="{size}" height="{size}" viewBox="-2 -2 {n + 4} {n + 4}" shape-rendering="crispEdges">'
            f'<rect x="-2" y="-2" width="{n + 4}" height="{n + 4}" fill="{bg}"/><g fill="{fg}">{"".join(cells)}</g></svg>')


def phone(cls, view_html, style):
    return f"""<div class="phone {cls}" style="{style}"><div class="screen"><div class="notch"></div>
  <div class="brand"><i></i>ISC BREWERS GUILD</div>
  {view_html}
</div></div>"""


def hero_phone(cls, style):
    """The hero prop: the Scan Pass on a phone. Camera view scans a QR code, then the green screen."""
    br = "position:absolute; width:46px; height:46px; border-color:#E8913A; border-style:solid; border-width:0"
    cam = f"""<div class="cam" style="position:absolute; inset:0; background:radial-gradient(circle at 50% 45%, #3A332C, #0D0B09 75%)">
    <div style="position:absolute; left:0; right:0; top:120px; text-align:center; font:600 19px 'Chivo'; color:#F7F3EC">Scan the QR code</div>
    <div class="qrbox" style="position:absolute; left:84px; top:250px; width:220px; height:220px">
      <div class="qrimg" style="position:absolute; inset:14px; border-radius:8px; overflow:hidden">{qr_svg(11, 192)}</div>
      <div class="bk" style="{br}; left:0; top:0; border-top-width:6px; border-left-width:6px; border-top-left-radius:14px"></div>
      <div class="bk" style="{br}; right:0; top:0; border-top-width:6px; border-right-width:6px; border-top-right-radius:14px"></div>
      <div class="bk" style="{br}; left:0; bottom:0; border-bottom-width:6px; border-left-width:6px; border-bottom-left-radius:14px"></div>
      <div class="bk" style="{br}; right:0; bottom:0; border-bottom-width:6px; border-right-width:6px; border-bottom-right-radius:14px"></div>
      <div class="scanline" style="position:absolute; left:16px; right:16px; top:16px; height:4px; background:#E8913A; box-shadow:0 0 16px #E8913A"></div>
    </div>
  </div>"""
    done = """<div class="view done"><div class="canvas" style="gap:14px; padding:16px">
    <div class="green" style="height:580px; box-sizing:border-box; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:18px; border:3px solid #12B76A; background:#ECFDF3; border-radius:18px; padding:34px 18px; text-align:center">
      <span class="tick" style="width:96px; height:96px; border-radius:50%; background:#12B76A; color:#fff; display:flex; align-items:center; justify-content:center; font:700 52px 'Chivo'">✓</span>
      <span style="font:600 14px 'Chivo'; letter-spacing:0.08em; text-transform:uppercase; color:#05603A">Sample Brewery</span>
      <div class="ch">Visit #1 recorded</div>
      <span style="font:400 14px 'Chivo'; color:#6B6156">Confirmed at 4:32:10 PM</span>
    </div>
  </div></div>"""
    return f"""<div class="phone {cls}" style="{style}"><div class="screen"><div class="notch"></div>
  {cam}
  <div class="brand bar" style="position:relative; z-index:2"><i></i>ISC BREWERS GUILD</div>
  {done}
  <div class="flash" style="position:absolute; inset:0; background:#fff; opacity:0; z-index:4"></div>
</div></div>"""


# ---------------------------------------------------------------- scenes
def scene1(s, d):
    c = lambda w, o=1: cue(1, w, o)
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-300px; top:-380px"></div>
<div class="stage">
  <div style="position:absolute; left:120px; top:150px; width:980px; display:flex; flex-direction:column; gap:30px">
    <div class="eyebrow">ISC Brewers Guild · For members</div>
    <div class="h" style="font-size:96px"><div class="l1">What if your membership</div><div class="l2">paid for itself?</div></div>
    <div class="l3" style="font:500 40px/1.35 'Chivo'; color:#B6AC9D">And a loyalty program came with it. <span style="color:#F7F3EC; font-weight:700">Free.</span></div>
    <div class="h l4 accent" style="font-size:84px; margin-top:20px">The Inland Scan Pass.</div>
  </div>
  {hero_phone("tc", "left:1330px; top:150px")}
</div>"""
    js = common_js(s, d)
    js += slide(f"#{s} .eyebrow", 0.3)
    js += rise(f"#{s} .l1", c("What"), 50)
    js += rise(f"#{s} .l2", c("paid"), 50)
    js += rise(f"#{s} .l3", c("And"), 30)
    # the phone arrives with its camera open, scans a QR code, then flips to the green screen
    t0 = c("That's") - 0.6
    js += f'tl.fromTo("#{s} .tc", {{ opacity: 0, y: 110, rotation: 0 }}, {{ opacity: 1, y: 0, rotation: -4, duration: 0.8, ease: "power3.out" }}, {t0:.2f});\n'
    js += hide(f"#{s} .tc .done") + hide(f"#{s} .tc .bar")
    js += f'tl.fromTo("#{s} .qrbox", {{ scale: 1.25 }}, {{ scale: 1, duration: 0.6, ease: "power2.out" }}, {t0 + 0.3:.2f});\n'
    js += f'tl.fromTo("#{s} .scanline", {{ y: 0 }}, {{ y: 184, duration: 0.45, ease: "sine.inOut", yoyo: true, repeat: 2, immediateRender: false }}, {t0 + 0.7:.2f});\n'
    lock = t0 + 0.7 + 0.45 * 3
    js += f'tl.to("#{s} .bk", {{ borderColor: "#12B76A", duration: 0.15 }}, {lock:.2f});\n'
    js += f'tl.to("#{s} .scanline", {{ opacity: 0, duration: 0.1 }}, {lock:.2f});\n'
    js += f'tl.fromTo("#{s} .qrbox", {{ scale: 1 }}, {{ scale: 0.9, duration: 0.15, yoyo: true, repeat: 1, ease: "power1.inOut", immediateRender: false }}, {lock:.2f});\n'
    js += f'tl.fromTo("#{s} .flash", {{ opacity: 0 }}, {{ opacity: 0.85, duration: 0.08, yoyo: true, repeat: 1, immediateRender: false }}, {lock + 0.3:.2f});\n'
    js += fade(f"#{s} .cam", lock + 0.38, 0, 1, 0.05)
    js += fade(f"#{s} .bar", lock + 0.38, 1, 0, 0.05) + fade(f"#{s} .done", lock + 0.38, 1, 0, 0.05)
    js += f'tl.fromTo("#{s} .tick", {{ scale: 0.3 }}, {{ scale: 1, duration: 0.5, ease: "back.out(2.6)", immediateRender: false }}, {lock + 0.4:.2f});\n'
    js += pulse_js(s, ".green", lock + 0.55, "18,183,106")
    js += rise(f"#{s} .l4", c("Inland"), 50)
    return html, js


def welcome_view(member="Sample Brewery"):
    return f"""<div class="view"><div class="canvas">
    <span class="eb">{member}</span>
    <div class="ch">Welcome to the Inland Scan Pass</div>
    <div class="lead">Collect Beer Trail stops and earn rewards at {member} and every Guild member.</div>
    <div class="pbtn join">Join the Beer Trail</div>
    <span class="lnk">Just get the free loyalty pass</span>
    <div class="sbtn">I have a Scan Pass: sign in</div>
  </div></div>"""


def scene2(s, d):
    c = lambda w, o=1: cue(2, w, o)
    job = lambda k, title, line, extra="": f"""<div class="job{k}" style="background:#211C17; border:3px solid {'#E8913A' if k == 1 else '#3A332C'}; border-radius:24px; padding:38px 40px; display:flex; flex-direction:column; gap:18px {extra}">
      <div class="h" style="font-size:104px; color:#E8913A; line-height:0.9">{k}</div>
      <div style="font:700 44px/1.15 'Chivo'">{title}</div>
      <div style="font:400 27px/1.4 'Chivo'; color:#B6AC9D">{line}</div>
    </div>"""
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-420px; top:-480px"></div>
<div class="stage">
  {phone("ph", welcome_view(), "left:150px; top:110px")}
  <div class="ga" style="position:absolute; left:720px; top:200px; width:1080px; display:flex; flex-direction:column; gap:34px">
    <div class="h" style="font-size:88px">On your customer's phone.</div>
    <div class="chip quiet n1"><span class="accent">✕</span> No app to download</div>
    <div class="chip quiet n2"><span class="accent">✕</span> No plastic to lose</div>
  </div>
  <div class="gb" style="position:absolute; left:720px; top:150px; width:1080px; display:flex; flex-direction:column; gap:40px">
    <div class="h" style="font-size:88px">One pass. <span class="accent">Two jobs.</span></div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:36px">
      {job(1, "Beer Trail pass", "Paid, for the year. You earn on every one sold at your counter.")}
      {job(2, "Loyalty pass", "Free, at every Guild member. Your rewards, your regulars.")}
    </div>
  </div>
</div>"""
    js = common_js(s, d)
    js += rise(f"#{s} .ph", 0.3, 90, 0.9)
    js += slide(f"#{s} .ga .h", c("lives") - 0.2, -50)
    js += rise(f"#{s} .n1", c("no"), 30, 0.5)
    js += rise(f"#{s} .n2", c("plastic") - 0.2, 30, 0.5)
    js += fade(f"#{s} .ga", c("And", 2) - 0.3, 0, 1, 0.35)
    js += hide(f"#{s} .gb")
    js += fade(f"#{s} .gb", c("And", 2) - 0.05, 1, 0, 0.01)
    js += hide(f"#{s} .gb .h") + rise(f"#{s} .gb .h", c("And", 2), 40)
    js += rise(f"#{s} .job1", c("Beer") - 0.2, 70, 0.6)
    js += rise(f"#{s} .job2", c("loyalty") - 0.2, 70, 0.6)
    js += ring_js(s, ".ph .join", c("Beer"), 5) + unring_js(s, ".ph .join", c("loyalty") - 0.3)
    return html, js


def scene3(s, d):
    c = lambda w, o=1: cue(3, w, o)
    stops = [("Sample Brewery", 0), ("Canyon Ale Works", 1), ("Orchard Hill Brewing", 2), ("Your taproom", 3)]
    pins = ""
    for name, i in stops:
        mine = i == 3
        x = 700 + i * 290
        y = 330 if i % 2 == 0 else 250
        pins += f"""<div class="stop st{i}" style="position:absolute; left:{x}px; top:{y}px; width:250px; display:flex; flex-direction:column; align-items:center; gap:14px">
      <div class="pin" style="width:92px; height:92px; border-radius:50%; background:{'#E8913A' if mine else '#211C17'}; border:4px solid #E8913A; display:flex; align-items:center; justify-content:center; font-family:'Bricolage Grotesque'; font-weight:800; font-size:40px; color:{'#171410' if mine else '#E8913A'}">{i + 1}</div>
      <div style="font:700 25px/1.2 'Chivo'; text-align:center; color:{'#E8913A' if mine else '#F7F3EC'}">{name}</div>
    </div>"""
    path = "M 825 376 C 960 300, 1000 290, 1115 296 S 1290 380, 1405 376 S 1590 290, 1695 296"
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-460px; bottom:-600px"></div>
<div class="stage">
  <div class="step">Job 1 · The Beer Trail</div>
  <div class="left">
    <div class="h head">The Beer Trail</div>
    <div class="sub s1">One pass. The whole year.</div>
  </div>
  <svg data-layout-allow-overflow style="position:absolute; left:0; top:0; width:1920px; height:1080px" viewBox="0 0 1920 1080"><path class="trail" d="{path}" fill="none" stroke="#6B6156" stroke-width="5" stroke-dasharray="4 16" stroke-linecap="round"/></svg>
  {pins}
  <div class="offer" style="position:absolute; left:700px; top:560px; width:520px; display:flex; align-items:center; gap:26px; background:#FBF8F2; color:#241F1A; border-radius:22px; padding:28px 32px; box-shadow:0 24px 60px rgba(0,0,0,0.45)">
    <div style="flex-shrink:0; width:120px; height:120px; border-radius:50%; background:#E8913A; display:flex; align-items:center; justify-content:center; font-family:'Bricolage Grotesque'; font-weight:800; font-size:62px; color:#171410">5¢</div>
    <div style="display:flex; flex-direction:column; gap:6px"><span class="caps">Beer Trail offer</span><span style="font-family:'Bricolage Grotesque'; font-weight:800; font-size:36px; line-height:1.1">Your first beer for a nickel</span><span class="small" style="font-size:18px">Once per stop, each year</span></div>
  </div>
  <div class="mile" style="position:absolute; left:1270px; top:560px; width:530px; display:flex; align-items:center; gap:24px; background:#211C17; border:3px solid #3A332C; border-radius:22px; padding:28px 32px">
    <div style="flex-shrink:0; width:84px; height:84px; border-radius:50%; border:4px solid #E8913A; display:flex; align-items:center; justify-content:center; font:800 30px 'Chivo'; color:#E8913A">★</div>
    <div style="display:flex; flex-direction:column; gap:6px"><span style="font:700 18px 'Chivo'; letter-spacing:0.14em; color:#B6AC9D">GUILD REWARDS</span><span style="font:700 30px/1.2 'Chivo'">Earned at milestones as they visit more stops</span></div>
  </div>
</div>"""
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", c("Job"), -50)
    js += rise(f"#{s} .s1", c("Customers"), 24)
    trail_at = c("every")
    js += f'tl.fromTo("#{s} .trail", {{ strokeDashoffset: 0, opacity: 0 }}, {{ opacity: 1, duration: 0.5 }}, {trail_at - 0.3:.2f});\n'
    for i in range(4):
        js += pop(f"#{s} .st{i}", trail_at - 0.3 + i * 0.28, 0.5)
    js += rise(f"#{s} .offer", c("first") - 0.2, 50, 0.6)
    js += rise(f"#{s} .mile", c("earn") - 0.1, 50, 0.6)
    js += pulse_js(s, ".st3 .pin", c("yours") - 0.1)
    js += f'tl.fromTo("#{s} .st3", {{ scale: 1 }}, {{ scale: 1.12, duration: 0.4, ease: "back.out(2)", immediateRender: false }}, {c("yours") - 0.1:.2f});\n'
    return html, js


def passes_panel(cls, style):
    rows = [("March 2027", "6"), ("April 2027", "9"), ("May 2027", "14")]
    trs = "".join(
        f'<div class="pr pr{i}" style="display:grid; grid-template-columns:1.6fr 0.6fr 1fr; align-items:center; border-top:2px solid #EFEAE1; padding:14px 0; font:400 22px \'Chivo\'"><span style="font-weight:600">{m}</span><span style="text-align:right">{n}</span><span style="display:flex; justify-content:flex-end"><span style="width:96px; height:22px; border-radius:6px; background:#DED7CB"></span></span></div>'
        for i, (m, n) in enumerate(rows))
    return f"""<div class="panel {cls}" style="{style}; background:#fff; border:2px solid #DED7CB; padding:34px 38px; display:flex; flex-direction:column; gap:18px">
  <div style="font-family:'Bricolage Grotesque'; font-weight:700; font-size:32px">Beer Trail Passes</div>
  <div class="small">When a customer joins the Beer Trail from your counter plate, the sale is credited to you and you earn a commission. The Guild pays commissions; these are your running totals.</div>
  <div style="display:grid; grid-template-columns:1.5fr 1fr; gap:34px; margin-top:6px">
    <div style="display:flex; flex-direction:column">
      <span class="caps" style="margin-bottom:10px">Passes sold</span>
      <div style="display:grid; grid-template-columns:1.6fr 0.6fr 1fr; padding-bottom:8px; font:500 17px 'Chivo'; color:#6B6156"><span>Month</span><span style="text-align:right">Sold</span><span style="text-align:right">Commission</span></div>
      {trs}
    </div>
    <div class="elist" style="display:flex; flex-direction:column; gap:10px; border-left:2px solid #EFEAE1; padding-left:34px">
      <span class="caps">Your email list</span>
      <span class="ecount" style="font-family:'Bricolage Grotesque'; font-weight:700; font-size:64px; line-height:1">48</span>
      <span class="small" style="font-size:18px">customers have agreed to get your emails when they joined at your counter.</span>
    </div>
  </div>
</div>"""


def scene4(s, d):
    c = lambda w, o=1: cue(4, w, o)
    segs = "".join(f'<div class="seg g{i}" style="flex:1; border-radius:8px; background:#E8913A"></div>' for i in range(10))
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-460px; top:-520px"></div>
<div class="stage">
  <div class="step">Job 1 · You earn</div>
  <div class="left">
    <div class="h head">Every pass pays you.</div>
    <div class="sub s1">Sold at your counter, credited to you. Automatically.</div>
  </div>
  <div class="pa">
    {phone("ph", welcome_view(), "left:700px; top:120px; transform:scale(0.92); transform-origin:top left")}
    <div class="cred chip" style="position:absolute; left:1190px; top:200px; font-size:26px">✓ Sale credited to <b style="margin-left:6px">Sample Brewery</b></div>
    <div class="dues" style="position:absolute; left:1190px; top:400px; width:610px; display:flex; flex-direction:column; gap:20px; background:#211C17; border:3px solid #3A332C; border-radius:24px; padding:34px 36px">
      <div style="display:flex; justify-content:space-between; align-items:baseline"><span style="font:700 20px 'Chivo'; letter-spacing:0.18em; color:#B6AC9D">YOUR GUILD DUES</span><span class="covered" style="font-family:'Bricolage Grotesque'; font-weight:800; font-size:38px; color:#E8913A">COVERED</span></div>
      <div style="height:64px; border-radius:12px; background:#171410; border:2px solid #3A332C; padding:7px; display:flex; gap:7px">{segs}</div>
      <div style="display:flex; justify-content:space-between; font:500 22px 'Chivo'; color:#B6AC9D"><span class="lo">Offset</span><span>Paid in full</span></div>
    </div>
  </div>
  {passes_panel("pp", "left:690px; top:170px; width:1110px")}
</div>"""
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", 0.45, -50)
    js += rise(f"#{s} .s1", c("credited") - 0.3, 24)
    js += rise(f"#{s} .ph", 0.6, 90, 0.9)
    js += ring_js(s, ".ph .join", c("joins"), 5)
    js += rise(f"#{s} .cred", c("credited") - 0.1, 30, 0.5)
    js += rise(f"#{s} .dues", c("Sell", 2) - 0.4, 50, 0.6)
    sell, off, cover = c("Sell", 2), c("offset"), c("cover")
    for i in range(10):
        at = sell + 0.15 + i * (off + 0.4 - sell) / 6 if i < 6 else cover - 0.3 + (i - 6) * 0.22
        js += f'tl.fromTo("#{s} .g{i}", {{ opacity: 0.08 }}, {{ opacity: 1, duration: 0.25, immediateRender: false }}, {at:.2f});\n'
        js += f'tl.set("#{s} .g{i}", {{ opacity: 0.08 }}, 0);\n'
    js += hide(f"#{s} .covered") + pop(f"#{s} .covered", c("completely"), 0.5)
    js += ring_js(s, ".dues", c("completely"), 5)
    see = c("You'll")
    js += fade(f"#{s} .pa", see - 0.4, 0, 1, 0.35)
    js += hide(f"#{s} .pp") + rise(f"#{s} .pp", see, 60, 0.7)
    for i in range(3):
        js += f'tl.fromTo("#{s} .pr{i}", {{ backgroundColor: "rgba(252,231,210,0)" }}, {{ backgroundColor: "rgba(252,231,210,1)", duration: 0.25, immediateRender: false }}, {c("month") + i * 0.3:.2f});\n'
    return html, js


def scene5(s, d):
    c = lambda w, o=1: cue(5, w, o)
    tile = lambda k, name, tag, color: f"""<div class="tile t{k}" style="background:#211C17; border:3px solid #3A332C; border-radius:22px; padding:30px 32px; display:flex; flex-direction:column; gap:14px">
      <div style="width:64px; height:64px; border-radius:14px; background:{color}; display:flex; align-items:center; justify-content:center; font:800 26px 'Chivo'; color:#fff">{name[0]}</div>
      <div style="font:700 30px/1.2 'Chivo'">{name}</div>
      <div style="font:700 16px 'Chivo'; letter-spacing:0.14em; color:#B6AC9D">{tag}</div>
      <div style="font:600 21px 'Chivo'; color:#E8913A">✓ Scan Pass works here</div>
    </div>"""
    step = lambda k, label, text: f"""<div class="os os{k}" style="display:flex; align-items:center; gap:22px; border:2px solid #DED7CB; background:#fff; border-radius:14px; padding:20px 24px">
      <span style="flex-shrink:0; font:700 17px 'Chivo'; letter-spacing:0.1em; color:#8F4416; background:#FCE7D2; border-radius:99px; padding:7px 14px">{label}</span>
      <span style="font:600 26px 'Chivo'">{text}</span>
      <span style="margin-left:auto; font:600 16px 'Chivo'; color:#3B7A38">Approved</span>
    </div>"""
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-380px; top:-460px"></div>
<div class="stage">
  <div class="step">Job 2 · Loyalty</div>
  <div class="left">
    <div class="h head">Loyalty. <span class="accent">Free.</span></div>
    <div class="sub s1">At every Guild member, not just breweries.</div>
    <div class="chip zero" style="margin-top:10px"><span class="accent" style="font-family:'Bricolage Grotesque'; font-weight:800; font-size:34px">$0</span> to you</div>
    <div class="chip quiet nr">Visits never reset</div>
  </div>
  <div class="ta" style="position:absolute; left:720px; top:230px; width:1080px; display:grid; grid-template-columns:repeat(3,1fr); gap:30px">
    {tile(1, "Sample Brewery", "BREWERY", "#B3591F")}
    {tile(2, "Sample Taco Truck", "FOOD TRUCK", "#4E7A9A")}
    {tile(3, "Your business", "ANY MEMBER", "#4E9A4A")}
  </div>
  <div class="panel tb" style="left:720px; top:190px; width:1080px; padding:36px 40px; display:flex; flex-direction:column; gap:20px">
    <span class="caps">Member Offers</span>
    <div style="font-family:'Bricolage Grotesque'; font-weight:700; font-size:34px">Your loyalty rewards</div>
    {step(1, "VISIT 3", "Free snack")}
    {step(2, "EVERY 5 VISITS", "$2 off")}
    <span class="add" style="align-self:flex-start; font:600 22px 'Chivo'; color:#B3591F; border:2px dashed #D3CBBD; border-radius:12px; padding:14px 22px">+ Add a step</span>
  </div>
</div>"""
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", c("Job"), -50)
    js += rise(f"#{s} .s1", c("Every"), 24)
    for k in (1, 2, 3):
        js += rise(f"#{s} .t{k}", c("Every") + 0.2 + (k - 1) * 0.35, 60, 0.6)
    js += f'tl.fromTo("#{s} .t2", {{ borderColor: "#3A332C" }}, {{ borderColor: "#E8913A", duration: 0.3, immediateRender: false }}, {c("breweries") - 0.1:.2f});\n'
    js += fade(f"#{s} .ta", c("You") - 0.4, 0, 1, 0.35)
    js += hide(f"#{s} .tb") + rise(f"#{s} .tb", c("You") - 0.05, 60, 0.6)
    js += hide(f"#{s} .os1") + rise(f"#{s} .os1", c("free") - 0.1, 24, 0.45)
    js += hide(f"#{s} .os2") + rise(f"#{s} .os2", c("Two") - 0.1, 24, 0.45)
    js += hide(f"#{s} .add") + pop(f"#{s} .add", c("Whatever"), 0.45)
    js += pop(f"#{s} .zero", c("costs"), 0.5)
    js += rise(f"#{s} .nr", c("Visits"), 24, 0.5)
    return html, js


def join_view():
    return """<div class="view"><div class="canvas" style="gap:16px">
    <span class="eb">Sample Brewery</span>
    <div class="ch">Join the 2027 Beer Trail</div>
    <div style="display:flex; flex-direction:column; gap:7px"><span style="font:500 15px 'Chivo'">Email</span><div class="field">alex@example.com</div></div>
    <div style="display:flex; align-items:center; gap:14px; font:400 17px 'Chivo'"><span class="box" style="background:#B3591F; border-color:#B3591F">✓</span>I am 21 or older</div>
    <div class="optin" style="display:flex; align-items:center; gap:14px; font:400 17px/1.35 'Chivo'; border-radius:10px; padding:6px 8px; margin:-6px -8px"><span class="box ob" style="position:relative"><span class="tick" style="position:absolute; inset:-2px; border-radius:5px; background:#B3591F; display:flex; align-items:center; justify-content:center">✓</span></span>Let Sample Brewery email me news and offers</div>
    <div class="pbtn">Continue to payment</div>
  </div></div>"""


def scene6(s, d):
    c = lambda w, o=1: cue(6, w, o)
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-420px; top:-480px"></div>
<div class="stage">
  <div class="left" style="top:200px">
    <div class="eyebrow">Bonus</div>
    <div class="h head">Your own list of regulars.</div>
    <div class="sub s1">They opt in at your counter. You see it grow.</div>
  </div>
  {phone("ph", join_view(), "left:720px; top:110px")}
  <div class="panel el" style="left:1240px; top:300px; width:560px; background:#fff; border:2px solid #DED7CB; padding:38px 40px; display:flex; flex-direction:column; gap:14px">
    <span class="caps">Your email list</span>
    <span class="num" style="font-family:'Bricolage Grotesque'; font-weight:700; font-size:120px; line-height:1">0</span>
    <span class="small">customers have agreed to get your emails when they joined at your counter.</span>
  </div>
</div>"""
    js = common_js(s, d)
    js += slide(f"#{s} .eyebrow", 0.3)
    js += slide(f"#{s} .head", c("When"), -50)
    js += rise(f"#{s} .s1", c("Your"), 24)
    js += rise(f"#{s} .ph", 0.3, 90, 0.9)
    js += hide(f"#{s} .tick")
    js += ring_js(s, ".optin", c("check") - 0.1, 5)
    js += pop(f"#{s} .tick", c("box"), 0.35)
    js += rise(f"#{s} .el", c("Your") - 0.2, 60, 0.6)
    js += count_js(f"#{s} .num", 0, 48, c("shows"), c("grow") - c("shows") + 0.4)
    return html, js


def scene7(s, d):
    c = lambda w, o=1: cue(7, w, o)
    choose = """<div class="view v1"><div class="canvas" style="gap:14px">
    <span class="eb">Sample Brewery</span>
    <div class="ch">Hi Alex — this will be visit #1</div>
    <span style="font:500 15px 'Chivo'">Choose one:</span>
    <div class="opt o1"><span class="dot on"></span>Use my Beer Trail offer: Your first beer for a nickel</div>
    <div class="opt"><span class="dot"></span>Just check in</div>
    <div class="pbtn cont">Continue</div>
  </div></div>"""
    scan = """<div class="view v2"><div class="canvas" style="gap:14px">
    <span class="eb">Sample Brewery</span>
    <div class="ch">Now scan the staff QR code</div>
    <div class="lead" style="font-size:17px">Ask a staff member for the Scan Pass QR code they keep behind the counter, and scan it with your camera within 10 minutes.</div>
    <div style="border:2px solid #DED7CB; background:#fff; border-radius:12px; padding:12px 16px; font:400 16px/1.35 'Chivo'">Use my Beer Trail offer: Your first beer for a nickel</div>
    <div style="height:170px; border-radius:14px; background:#241F1A; position:relative; overflow:hidden"><div class="scanline" style="position:absolute; left:20px; right:20px; top:20px; height:3px; background:#E8913A; box-shadow:0 0 12px #E8913A"></div></div>
  </div></div>"""
    done = """<div class="view v3"><div class="canvas" style="gap:14px">
    <div class="green" style="display:flex; flex-direction:column; align-items:center; gap:12px; border:3px solid #12B76A; background:#ECFDF3; border-radius:18px; padding:26px 18px; text-align:center">
      <span style="width:74px; height:74px; border-radius:50%; background:#12B76A; color:#fff; display:flex; align-items:center; justify-content:center; font:700 40px 'Chivo'">✓</span>
      <span style="font:600 14px 'Chivo'; letter-spacing:0.08em; text-transform:uppercase; color:#05603A">Sample Brewery</span>
      <div class="ch">Visit #1 recorded</div>
      <span style="font:700 25px/1.25 'Chivo'; color:#241F1A">Your first beer for a nickel</span>
      <span class="pour" style="font:400 17px 'Chivo'; color:#241F1A; border-radius:8px; padding:4px 8px">Used just now. Staff member: please pour.</span>
      <span style="font:600 26px ui-monospace, Consolas, monospace; color:#05603A">4:32:<span class="sec">10</span> PM</span>
      <span style="font:400 14px 'Chivo'; color:#6B6156">Confirmed at 4:32:10 PM</span>
    </div>
  </div></div>"""
    steps = [("1", "Scan the counter plate", "scans"), ("2", "Check in, pick a reward", "check"),
             ("3", "Scan the staff QR code", "holds"), ("4", "Show the green screen", "show")]
    rows = "".join(f'<div class="srow r{k}" style="display:flex; align-items:center; gap:20px; font:600 30px \'Chivo\'; color:#F7F3EC"><span style="flex-shrink:0; width:54px; height:54px; border-radius:50%; border:3px solid #E8913A; display:flex; align-items:center; justify-content:center; font:800 26px \'Chivo\'; color:#E8913A">{k}</span>{t}</div>' for k, t, _ in steps)
    html = f"""
<div class="glow" data-layout-allow-overflow style="right:-420px; top:-500px"></div>
<div class="stage">
  <div class="step">At the counter</div>
  <div style="position:absolute; left:120px; top:200px; width:560px; display:flex; flex-direction:column; gap:34px">
    <div class="h head" style="font-size:76px">It takes seconds.</div>
    {rows}
  </div>
  <div class="plate" style="position:absolute; left:720px; top:300px; width:300px; display:flex; flex-direction:column; align-items:center; gap:12px; background:#211C17; border:3px solid #3A332C; border-radius:24px; padding:26px 22px">
    <span style="font:700 16px 'Chivo'; letter-spacing:0.18em; color:#E8913A">INLAND SCAN PASS</span>
    <div style="border-radius:10px; overflow:hidden">{qr_svg(11, 220)}</div>
    <span style="font:600 20px ui-monospace, Consolas, monospace; color:#B6AC9D">ABCD-1234</span>
    <span style="font:700 15px 'Chivo'; letter-spacing:0.14em; color:#B6AC9D">COUNTER PLATE</span>
  </div>
  {phone("ph", choose + scan + done, "left:1070px; top:110px")}
  <div class="staff" style="position:absolute; left:1540px; top:330px; width:260px; display:flex; flex-direction:column; align-items:center; gap:12px; background:#FBF8F2; border-radius:20px; padding:24px 20px; box-shadow:0 24px 60px rgba(0,0,0,0.5)">
    <span style="font:700 15px 'Chivo'; letter-spacing:0.14em; color:#B3591F">STAFF QR CODE</span>
    {qr_svg(23, 190)}
    <span style="font:600 19px ui-monospace, Consolas, monospace; color:#6B6156">K7PX-2QMD</span>
  </div>
</div>"""
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += slide(f"#{s} .head", c("At"), -50)
    js += rise(f"#{s} .plate", 0.5, 60, 0.7)
    js += rise(f"#{s} .ph", 0.7, 90, 0.9)
    for k, _, w in steps:
        js += slide(f"#{s} .r{k}", c(w) - 0.15, -40, 0.5)
    scans, holds, green = c("scans"), c("holds"), c("green")
    js += pulse_js(s, ".plate", scans)
    js += ring_js(s, ".o1", c("collect"), 5) + unring_js(s, ".o1", c("Your", 2) - 0.6)
    js += ring_js(s, ".cont", c("Your", 2) - 0.6, 5)
    js += hide(f"#{s} .v2") + hide(f"#{s} .v3")
    js += fade(f"#{s} .v1", c("Your", 2) - 0.25, 0, 1, 0.25) + fade(f"#{s} .v2", c("Your", 2) - 0.1, 1, 0, 0.3)
    js += f'tl.fromTo("#{s} .staff", {{ opacity: 0, y: 120, rotation: 6 }}, {{ opacity: 1, y: 0, rotation: -3, duration: 0.7, ease: "power3.out" }}, {holds - 0.1:.2f});\n'
    js += f'tl.fromTo("#{s} .scanline", {{ y: 0 }}, {{ y: 126, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: 3, immediateRender: false }}, {c("Your", 2) + 0.2:.2f});\n'
    js += pulse_js(s, ".staff", c("scans", 2) - 0.1)
    js += fade(f"#{s} .v2", c("show") - 0.3, 0, 1, 0.25) + fade(f"#{s} .v3", c("show") - 0.15, 1, 0, 0.3)
    js += pulse_js(s, ".green", green, "18,183,106")
    js += count_js(f"#{s} .sec", 10, 10 + int(d - c("show")), c("show"), d - c("show"))
    js += f'tl.fromTo("#{s} .pour", {{ backgroundColor: "rgba(232,145,58,0)" }}, {{ backgroundColor: "rgba(232,145,58,0.35)", duration: 0.3, immediateRender: false }}, {c("pour") - 0.2:.2f});\n'
    return html, js


def scene8(s, d):
    c = lambda w, o=1: cue(8, w, o)
    side = "".join(
        f'<div class="{"navtc" if n == "Scan Pass" else ""}" style="padding:10px 15px; border-radius:10px;{" background:#241F1A; color:#F9F6F0; font-weight:600;" if n == "Scan Pass" else ""}">{n}</div>'
        for n in ["Notifications", "Basics &amp; hours", "Logo, Photos &amp; Cover", "Theme", "Links &amp; contact", "Events", "Food", "Jobs", "Scan Pass", "Discount", "People"])
    card = lambda cls, title, body: f'<div class="{cls}" style="background:#fff; border:2px solid #DED7CB; border-radius:16px; padding:24px 26px; display:flex; flex-direction:column; gap:14px">' \
                                    f'<div style="font-family:\'Bricolage Grotesque\'; font-weight:700; font-size:24px">{title}</div>{body}</div>'
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:-500px; top:-560px"></div>
<div class="stage">
  <div class="step">Getting set up</div>
  <div class="panel portal" style="left:120px; top:163px; width:1680px; height:700px; background:#F9F6F0">
    <div style="height:58px; background:#171410; display:flex; align-items:center; justify-content:space-between; padding:0 31px; font:600 17px 'Chivo'; letter-spacing:0.14em; color:#B6AC9D">ISC BREWERS GUILD · MEMBER PORTAL<span style="letter-spacing:0; font-weight:500; color:#F7F3EC">Sample Brewery</span></div>
    <div style="display:flex; height:642px">
      <div style="width:300px; border-right:2px solid #EFEAE1; padding:24px 19px; display:flex; flex-direction:column; gap:3px; font:400 19px 'Chivo'">{side}</div>
      <div style="flex:1; padding:30px 40px; display:flex; flex-direction:column; gap:22px">
        <div style="font-family:'Bricolage Grotesque'; font-weight:700; font-size:44px">Scan Pass</div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:22px; align-items:start">
          {card("k1", "Staff code (backup)", '<div class="small" style="font-size:17px">A staff member can type this on the customer&rsquo;s phone if the staff QR code isn&rsquo;t handy.</div><div class="code" style="height:56px; width:170px; border:2px solid #DED7CB; border-radius:10px; display:flex; align-items:center; justify-content:center; font:700 28px Chivo; letter-spacing:0.3em"><span class="pin"></span></div><span class="btn" style="align-self:flex-start; height:48px; background:#241F1A; color:#fff; border-color:#241F1A">Save</span>')}
          {card("k2", "Counter plate", f'<div style="align-self:center; border:2px solid #EFEAE1; border-radius:10px; overflow:hidden">{qr_svg(11, 170)}</div><span class="btn b2" style="height:48px">Download QR code</span>')}
          {card("k3", "Staff QR code", f'<div style="align-self:center; border:2px solid #EFEAE1; border-radius:10px; overflow:hidden">{qr_svg(23, 170)}</div><span class="btn b3" style="height:48px">Download staff QR</span>')}
          {card("k4", "Member Offers", '<div class="small" style="font-size:17px">Your loyalty rewards. The Guild checks each one before it goes live.</div><span class="btn b4" style="height:48px; color:#B3591F">+ Add a step</span>')}
        </div>
      </div>
    </div>
  </div>
</div>"""
    js = common_js(s, d)
    js += fade(f"#{s} .step", 0.3)
    js += rise(f"#{s} .portal", 0.4, 70, 0.8)
    js += ring_js(s, ".navtc", c("Open"), 5) + unring_js(s, ".navtc", c("Set") - 0.3)
    js += ring_js(s, ".k1", c("Set"), 5) + unring_js(s, ".k1", c("print") - 0.2)
    js += (f'(function () {{ const el = document.querySelector("#{s} .pin"); const p = {{ n: 0 }};\n'
           f'  tl.fromTo(p, {{ n: 0 }}, {{ n: 4, duration: 0.8, ease: "none", immediateRender: false, onUpdate() {{ el.textContent = "•".repeat(Math.round(p.n)); }} }}, {c("four-digit"):.2f});\n'
           f'  tl.set(el, {{ textContent: "" }}, 0); }})();\n')
    js += ring_js(s, ".b2", c("print"), 5) + unring_js(s, ".b2", c("staff", 2) - 0.2)
    js += ring_js(s, ".b3", c("staff", 2), 5) + unring_js(s, ".b3", c("add") - 0.2)
    js += ring_js(s, ".b4", c("add"), 5)
    return html, js


def scene9(s, d):
    c = lambda w, o=1: cue(9, w, o)
    nodes = [(1260, 300), (1560, 340), (1690, 560), (1520, 760), (1190, 780), (1060, 560), (1380, 190), (1720, 300), (1760, 760), (1060, 330), (1330, 900)]
    cx, cy = 1400, 540
    lines = "".join(f'<line class="ln ln{i}" x1="{cx}" y1="{cy}" x2="{x}" y2="{y}" stroke="#6B6156" stroke-width="3"/>' for i, (x, y) in enumerate(nodes))
    dots = "".join(
        f'<div class="nd nd{i}" style="position:absolute; left:{x - 30}px; top:{y - 30}px; width:60px; height:60px; border-radius:50%; background:{"#E8913A" if i % 3 == 0 else "#211C17"}; border:4px solid #E8913A"></div>'
        for i, (x, y) in enumerate(nodes))
    html = f"""
<div class="glow" data-layout-allow-overflow style="left:380px; top:-200px; width:1340px; height:1340px"></div>
<div class="stage">
  <div class="pa" style="position:absolute; left:0; right:0; top:330px; display:flex; flex-direction:column; align-items:center; gap:10px">
    <div class="h" style="font-size:110px; text-align:center"><span class="w1">Now here's where</span> <span class="you accent" style="display:inline-block; font-size:150px">YOU</span> <span class="w2">come in.</span></div>
  </div>
  <div class="pb">
    <svg data-layout-allow-overflow style="position:absolute; left:0; top:0; width:1920px; height:1080px" viewBox="0 0 1920 1080">{lines}</svg>
    {dots}
    <div class="hub" style="position:absolute; left:{cx - 120}px; top:{cy - 120}px; width:240px; height:240px; border-radius:50%; background:#211C17; border:4px solid #E8913A; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px"><span style="font:700 18px 'Chivo'; letter-spacing:0.2em; padding-left:0.2em; color:#E8913A">INLAND</span><span style="font-family:'Bricolage Grotesque'; font-weight:800; font-size:44px; line-height:0.95; text-align:center">SCAN<br>PASS</span></div>
    <div style="position:absolute; left:120px; top:220px; width:780px; display:flex; flex-direction:column; gap:40px">
      <div class="h b1" style="font-size:72px">More members. <span class="accent">More value.</span></div>
      <div class="chip quiet b2">New producer <span class="accent">→</span> another trail stop</div>
      <div class="chip quiet b3">New member <span class="accent">→</span> another place the pass works</div>
    </div>
  </div>
  <div class="pc" style="position:absolute; left:120px; top:170px; width:1680px; display:flex; flex-direction:column; gap:40px">
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:40px">
      <div class="c1" style="background:#211C17; border:3px solid #3A332C; border-radius:24px; padding:36px 40px; display:flex; flex-direction:column; gap:10px"><span style="font:700 18px 'Chivo'; letter-spacing:0.18em; color:#B6AC9D">THINK ABOUT</span><span style="font:700 46px/1.15 'Chivo'">That brewery down the road</span></div>
      <div class="c2" style="background:#211C17; border:3px solid #3A332C; border-radius:24px; padding:36px 40px; display:flex; flex-direction:column; gap:10px"><span style="font:700 18px 'Chivo'; letter-spacing:0.18em; color:#B6AC9D">THINK ABOUT</span><span style="font:700 46px/1.15 'Chivo'">The food truck out back</span></div>
    </div>
    <div class="h f1" style="font-size:92px; margin-top:30px">Tell them about the Scan Pass.</div>
    <div class="h f2 accent" style="font-size:92px">Let's grow this together.</div>
    <div class="mark" style="margin-top:20px; font:700 21px 'Chivo'; letter-spacing:0.22em; color:#B6AC9D">ISC BREWERS GUILD</div>
  </div>
</div>"""
    js = common_js(s, d, out=1.0)
    you = c("YOU")
    js += rise(f"#{s} .w1", 0.3, 40)
    js += f'tl.fromTo("#{s} .you", {{ opacity: 0, scale: 2.2 }}, {{ opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2.6)" }}, {you - 0.1:.2f});\n'
    js += f'tl.fromTo("#{s} .you", {{ scale: 1 }}, {{ scale: 1.08, duration: 0.5, ease: "sine.inOut", yoyo: true, repeat: 1, immediateRender: false }}, {you + 0.4:.2f});\n'
    js += rise(f"#{s} .w2", c("come"), 30, 0.45)
    every = c("Every")
    js += fade(f"#{s} .pa", every - 0.45, 0, 1, 0.35)
    js += hide(f"#{s} .pb") + fade(f"#{s} .pb", every - 0.1, 1, 0, 0.01)
    js += hide(f"#{s} .hub") + pop(f"#{s} .hub", every, 0.6)
    js += hide(f"#{s} .b1") + slide(f"#{s} .b1", every + 0.1, -50)
    for i in range(len(nodes)):
        at = every + 0.4 + i * (c("works") - every) / len(nodes)
        js += hide(f"#{s} .nd{i}") + pop(f"#{s} .nd{i}", at, 0.45)
        js += f'tl.fromTo("#{s} .ln{i}", {{ opacity: 0 }}, {{ opacity: 1, duration: 0.4, immediateRender: false }}, {at:.2f});\n' + f'tl.set("#{s} .ln{i}", {{ opacity: 0 }}, 0);\n'
    js += hide(f"#{s} .b2") + rise(f"#{s} .b2", c("producer") - 0.3, 30, 0.5)
    js += hide(f"#{s} .b3") + rise(f"#{s} .b3", c("member") - 0.3, 30, 0.5)
    think = c("think")
    js += fade(f"#{s} .pb", think - 0.6, 0, 1, 0.35)
    js += hide(f"#{s} .pc") + fade(f"#{s} .pc", think - 0.25, 1, 0, 0.01)
    js += hide(f"#{s} .c1") + rise(f"#{s} .c1", c("brewery") - 0.2, 50, 0.6)
    js += hide(f"#{s} .c2") + rise(f"#{s} .c2", c("food") - 0.2, 50, 0.6)
    js += hide(f"#{s} .f1") + rise(f"#{s} .f1", c("Tell"), 40, 0.6)
    js += hide(f"#{s} .f2") + rise(f"#{s} .f2", c("Let's"), 40, 0.6)
    js += hide(f"#{s} .mark") + fade(f"#{s} .mark", c("together") + 0.6, 1, 0, 0.6)
    return html, js


BUILDERS = {1: scene1, 2: scene2, 3: scene3, 4: scene4, 5: scene5, 6: scene6, 7: scene7, 8: scene8, 9: scene9}


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
        # One caption per sentence; a long sentence splits once, near its middle.
        sentences, cur = [], []
        for w in words:
            cur.append(w)
            if w["text"].endswith((".", "?", "!")):
                sentences.append(cur)
                cur = []
        if cur:
            sentences.append(cur)
        joints = {"and", "so", "or", "to", "with", "in", "on", "for", "then", "at", "as", "that", "including"}
        for sent in sentences:
            if len(sent) <= 11:
                groups.append((n, sent))
                continue
            half = len(sent) / 2
            cands = [k for k in range(2, len(sent) - 1) if sent[k]["text"].lower() in joints or sent[k - 1]["text"].endswith(",")]
            cut = min(cands, key=lambda k: abs(k - half)) if cands else int(half)
            groups.append((n, sent[:cut]))
            groups.append((n, sent[cut:]))
    out = []
    for n, ws in groups:
        a = START[n] + LEAD + ws[0]["start"]
        b = START[n] + LEAD + ws[-1]["end"] + 0.15
        out.append((round(a, 2), round(b, 2), " ".join(w["text"] for w in ws)))
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
    <title>The Inland Scan Pass — ISC Brewers Guild</title>
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
        print(f"  {n:02d} {name:16s} start {START[n]:7.2f}  dur {DUR[n]:6.2f}  voice {VOICE[n]:6.2f}")
