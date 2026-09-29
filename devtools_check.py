"""DevTools/inspection freedom guard. Source preflight + runtime probe.

Usage: python devtools_check.py <base_url>
Exit non-zero on any failure. Writes tmp/devtools_results.json + tmp/devtools_summary.md.

Two layers:
  1. Source preflight — grep src/, public/, index.html and the built dist/ for
     anti-inspection patterns (contextmenu blockers, F12/shortcut traps,
     `debugger`, devtools-detection, script-keystroke blocking).
  2. Runtime probe — load the app via CDP, dispatch contextmenu + F12 +
     Ctrl+Shift+I/J/U synthetic events, assert nothing calls preventDefault()
     and no inline oncontextmenu attributes exist in the served DOM.
"""
import json, os, re, sys

os.makedirs("tmp", exist_ok=True)
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5175"
results = []

def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": str(detail)[:200]})
    print(("PASS " if ok else "FAIL ") + name + (" :: " + str(detail)[:160] if detail and not ok else ""), flush=True)

def fail_early(name, detail):
    check(name, False, detail)
    print("::error title=DevTools guard failed::" + f"{name}: {detail}".replace("\n", " | "), flush=True)
    json.dump(results, open(os.path.join("tmp", "devtools_results.json"), "w"), indent=1)
    sys.exit(1)

# ---------------- 1. Source preflight ----------------
FRONTEND = os.path.join(os.path.dirname(os.path.abspath(__file__)), "smartpyq-frontend")
SCAN_DIRS = [os.path.join(FRONTEND, "src"), os.path.join(FRONTEND, "public"), FRONTEND, os.path.join(FRONTEND, "dist")]
SCAN_EXT = (".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".htm")

# Regex -> (short label). Each is only an anti-inspection signal in *app* code.
PATTERNS = [
    (r"oncontextmenu\s*=", "inline oncontextmenu attribute"),
    (r"addEventListener\(\s*['\"]contextmenu['\"]", "contextmenu listener"),
    (r"(?:^|[^.\w])contextmenu['\"]?\s*\)", "contextmenu handler call"),
    (r"oncontextmenu", "oncontextmenu anywhere"),
    (r"debugger\s*;", "debugger statement"),
    (r"window\.outerWidth\s*-\s*window\.innerWidth\s*>\s*\d{2,}", "devtools size-detection"),
    (r"console\.clear\s*\(\s*\)\s*;\s*(?:setInterval|setTimeout)", "console.clear loop"),
    (r"['\"](?:F12|123)['\"]\s*(?:===|!==|==|!=)\s*(?:e(?:vent)?\.|evt\.)?(?:key|which|keyCode)", "F12/keycode trap"),
    (r"(?:key|which|keyCode)\s*(?:===|==)\s*['\"]?123['\"]?", "F12 keycode trap"),
    (r"(?:ctrlKey|metaKey)[^;]{0,60}&&[^;]{0,60}(?:shiftKey)[^;]{0,60}&&[^;]{0,60}\[\s*['\"](?:KeyI|KeyJ)['\"]|['\"](?:KeyI|KeyJ)['\"]", "devtools shortcut trap"),
    (r"(?:keydown|keyup)\s*\)[^{]*\{[^}]{0,200}preventDefault\(\)[^}]{0,200}['\"](?:F12|KeyI|KeyJ|KeyU)['\"]", "keydown preventDefault on inspect shortcuts"),
    (r"['\"](?:F12|KeyI|KeyJ|KeyU)['\"][^;]{0,80}preventDefault\(\)", "preventDefault on inspect shortcut"),
]

files_scanned = 0
violations = []

# Sanctioned policy: main.jsx disables the right-click context menu with
# exactly ONE listener (product decision). Strip that exact form — source
# and minified variants — before scanning, so S2 catches any OTHER
# contextmenu blocking but not the sanctioned one.
SANCTIONED_CONTEXTMENU = [
    re.compile(r"document\.addEventListener\(\s*['\"]contextmenu['\"],\s*\(\w+\)\s*=>\s*\w+\.preventDefault\(\)\s*\)"),
    re.compile(r"document\.addEventListener\(\s*[\"']contextmenu[\"'],\s*\w+\s*=>\s*\w+\.preventDefault\(\)\s*\)"),
]

for d in SCAN_DIRS:
    if not os.path.isdir(d):
        continue
    for root, dirs, files in os.walk(d):
        dirs[:] = [x for x in dirs if x not in ("node_modules", ".git", "tmp")]
        for fn in files:
            if not fn.endswith(SCAN_EXT):
                continue
            p = os.path.join(root, fn)
            rel = os.path.relpath(p, os.path.dirname(os.path.abspath(__file__)))
            # Skip React internals' keycode *name* tables (123:"F12" is naming, not blocking)
            if "vendor" in fn and "assets" in p:
                pass  # still scanned below; the exclusion is handled by the refined regexes
            try:
                text = open(p, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            for _sanctioned in SANCTIONED_CONTEXTMENU:
                text = _sanctioned.sub("", text)
            files_scanned += 1
            for pat, label in PATTERNS:
                for m in re.finditer(pat, text):
                    ctx = text[max(0, m.start() - 60):m.end() + 60].replace("\n", " ")
                    violations.append(f"{rel}: {label} :: ...{ctx}...")

check(f"S1 source preflight scanned {files_scanned} files", files_scanned > 0, "no files found — check paths")
check("S2 no anti-inspection patterns in source/dist", not violations, "; ".join(violations[:3]))
if violations:
    fail_early("S2 no anti-inspection patterns in source/dist", "; ".join(violations[:5]))

# ---------------- 2. Runtime probe ----------------
try:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from shot import start_chrome  # reuse the committed CDP launcher
    import asyncio, websockets, shutil
except ImportError as e:
    fail_early("R0 harness imports", str(e))

console_errors = []

async def run():
    proc, ws_url = start_chrome(1440, 900)
    try:
        async with websockets.connect(ws_url, max_size=64 * 1024 * 1024) as ws:
            mid = [0]

            async def rpc(method, params=None):
                mid[0] += 1
                await ws.send(json.dumps({"id": mid[0], "method": method, "params": params or {}}))
                while True:
                    msg = json.loads(await ws.recv())
                    if msg.get("id") == mid[0]:
                        return msg

            async def pump():
                while True:
                    try:
                        msg = json.loads(await ws.recv())
                    except Exception:
                        return
                    if msg.get("method") == "Runtime.consoleAPICalled" and msg["params"]["type"] == "error":
                        console_errors.append(str(msg["params"]["args"])[:200])
                    if msg.get("method") == "Log.entryAdded" and msg["params"]["entry"]["level"] == "error":
                        console_errors.append(msg["params"]["entry"]["text"][:200])

            pump_task = asyncio.create_task(pump())
            await rpc("Runtime.enable"); await rpc("Log.enable"); await rpc("Page.enable")

            async def ev(expr):
                r = await rpc("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
                return r.get("result", {}).get("result", {}).get("value")

            # Page the SPA actually renders content on (home).
            await rpc("Page.navigate", {"url": BASE + "/"})
            await asyncio.sleep(6.0)
            ready = await ev("document.readyState")
            check("R1 page loads", ready == "complete", f"readyState={ready}")

            # App-level providers must not freeze/redirect on load
            check("R2 root mounted", await ev("!!(document.getElementById('root')||{childElementCount:0}).childElementCount"))
            check("R3 still on original URL (no redirect)", (await ev("location.pathname")) == "/",
                  f"at {(await ev('location.pathname'))}")

            # --- The core freedom probes ---
            probe = """(() => {
              const out = {};
              const cm = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
              document.body.dispatchEvent(cm);
              out.contextmenu = cm.defaultPrevented;
              for (const [name, cfg] of [
                ['F12', {key:'F12', code:'F12', keyCode:123, which:123}],
                ['Ctrl+Shift+I', {key:'I', code:'KeyI', ctrlKey:true, shiftKey:true, keyCode:73}],
                ['Ctrl+Shift+J', {key:'J', code:'KeyJ', ctrlKey:true, shiftKey:true, keyCode:74}],
                ['Ctrl+U', {key:'u', code:'KeyU', ctrlKey:true, keyCode:85}],
              ]) {
                const ev = new KeyboardEvent('keydown', { ...cfg, bubbles: true, cancelable: true });
                document.dispatchEvent(ev);
                out[name] = ev.defaultPrevented;
              }
              out.inline_oncontextmenu = document.querySelectorAll('[oncontextmenu]').length;
              out.body_attr_contextmenu = document.body.hasAttribute('oncontextmenu');
              // text selection sanity: no global user-select lock on body content
              const p = document.querySelector('main p, main span, main h1, p, span, h1');
              out.selection_style = p ? getComputedStyle(p).userSelect : 'n/a';
              return JSON.stringify(out);
            })()"""
            r = json.loads(await ev(probe) or "{}")

            # POLICY: right-click context menu is disabled site-wide
            # (main.jsx), so contextmenu MUST be prevented. Keyboard
            # DevTools shortcuts MUST stay free (R5-R8).
            check("R4 right-click (contextmenu) blocked by policy", r.get("contextmenu") is True, f"defaultPrevented={r.get('contextmenu')}")
            check("R5 F12 not blocked", r.get("F12") is False, f"defaultPrevented={r.get('F12')}")
            check("R6 Ctrl+Shift+I not blocked", r.get("Ctrl+Shift+I") is False, f"defaultPrevented={r.get('Ctrl+Shift+I')}")
            check("R7 Ctrl+Shift+J not blocked", r.get("Ctrl+Shift+J") is False, f"defaultPrevented={r.get('Ctrl+Shift+J')}")
            check("R8 Ctrl+U not blocked", r.get("Ctrl+U") is False, f"defaultPrevented={r.get('Ctrl+U')}")
            check("R9 no inline oncontextmenu attributes", r.get("inline_oncontextmenu") == 0,
                  f"count={r.get('inline_oncontextmenu')}")
            check("R10 body has no oncontextmenu attr", r.get("body_attr_contextmenu") is False)
            check("R11 text selection not globally disabled", r.get("selection_style") not in ("none",),
                  f"userSelect={r.get('selection_style')}")

            # URL stability after probes (no reload/redirect/freeze behaviour)
            check("R12 URL unchanged after probes", (await ev("location.pathname")) == "/")

            pump_task.cancel()
    finally:
        proc.kill()
        shutil.rmtree(os.path.join(os.getcwd(), "tmp", f"shot-{os.getpid()}"), ignore_errors=True)

PROFILE_DIR = os.path.join(os.getcwd(), "tmp", f"devtools-{os.getpid()}")
try:
    asyncio.run(run())
except SystemExit:
    raise
except BaseException:
    import traceback
    print("::error title=DevTools harness crashed::" + traceback.format_exc()[-600:].replace("\n", " | "), flush=True)
    sys.exit(1)

# Console noise filter: asset 404s on a local server are not devtools issues.
real_errors = [e for e in console_errors if "Failed to load resource" not in e and "ERR_CONNECTION_REFUSED" not in e]
check("R13 console clean", len(real_errors) == 0, "; ".join(real_errors[:3]))

for _r in results:
    if not _r["ok"]:
        detail = (": " + _r["detail"]) if _r.get("detail") else ""
        print(f"::error title=DevTools check failed::{_r['check']}{detail}".replace("\n", " | "), flush=True)

json.dump(results, open(os.path.join("tmp", "devtools_results.json"), "w"), indent=1)
with open(os.path.join("tmp", "devtools_summary.md"), "w", encoding="utf-8") as f:
    f.write("## DevTools freedom guard results\n\n| # | Check | Result |\n|---|-------|--------|\n")
    for i, r in enumerate(results, 1):
        f.write(f"| {i} | {r['check']} | {'pass' if r['ok'] else '**FAIL**'} |\n")

sys.exit(0 if all(r["ok"] for r in results) else 1)
