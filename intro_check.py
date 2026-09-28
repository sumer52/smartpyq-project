"""Intro integration validation. One Chrome session, sequential lifecycle phases.

Usage: python intro_check.py <base_url>
Prints JSON phases; every assert fails loudly with phase name.
"""
import json, sys, os, time
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from shot import start_chrome, _opener  # reuse chrome launcher + proxy-free opener
import asyncio, websockets, shutil

os.makedirs("tmp", exist_ok=True)  # screenshots + chrome profile (fresh CI checkouts lack it)

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:5175"
results = []
console_errors = []

def check(name, ok, detail=""):
    results.append({"check": name, "ok": bool(ok), "detail": str(detail)[:200]})
    print(("PASS " if ok else "FAIL ") + name + (" :: " + str(detail)[:160] if detail and not ok else ""), flush=True)

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

            async def goto(path, settle=4.0):
                await rpc("Page.navigate", {"url": BASE + path})
                await asyncio.sleep(settle)

            INTRO = "!!document.querySelector('.sp-intro')"
            SCENE = "document.querySelector('.sp-intro__sr-only')?.textContent || ''"

            async def wait_intro(state=True, timeout=8.0):
                """Poll until .sp-intro appears (True) or disappears (False)."""
                for _ in range(int(timeout / 0.2)):
                    v = await ev(INTRO)
                    if bool(v) == state:
                        return True
                    await asyncio.sleep(0.2)
                return False

            async def click_replay(timeout=10.0):
                """Poll for the footer Replay button (footer mount can lag on slow machines)."""
                expr = """(() => {
                  const b=[...document.querySelectorAll('footer button, button')].find(x=>x.textContent.trim()==='Replay Intro');
                  if(!b) return 'missing'; b.click(); return 'clicked';})()"""
                result = None
                for _ in range(int(timeout / 0.25)):
                    result = await ev(expr)
                    if result == "clicked":
                        return result
                    await asyncio.sleep(0.25)
                return result

            # ---------- Phase A: first visit ----------
            await goto("/", settle=6.0)
            check("A1 intro shows on first visit", await wait_intro(True, 12))
            check("A2 flag not set initially", (await ev("localStorage.getItem('smartpyq_intro_seen')")) != "true")
            check("A3 body scroll locked", (await ev("document.body.style.overflow")) == "hidden")

            # click-anywhere next
            await ev("document.querySelector('.sp-intro').click()")
            await asyncio.sleep(0.8)
            check("A4 click anywhere -> scene 2", "Scene 2 of 5" in (await ev(SCENE) or ""))

            # keyboard
            await ev("window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight'}))")
            await asyncio.sleep(0.5)
            check("A5 ArrowRight -> scene 3", "Scene 3 of 5" in (await ev(SCENE) or ""))
            await ev("window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft'}))")
            await asyncio.sleep(0.5)
            check("A6 ArrowLeft -> scene 2", "Scene 2 of 5" in (await ev(SCENE) or ""))

            # focus trap: tab 4 times stays inside intro
            await ev("document.querySelector('.sp-intro__skip').focus()")
            for _ in range(4):
                await ev("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}))")
                await asyncio.sleep(0.15)
            check("A7 focus stays inside intro", await ev("!!document.activeElement.closest('.sp-intro')"))

            # escape skips, restores overflow, sets flag
            await ev("window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))")
            await asyncio.sleep(1.2)
            check("A8 Escape closes intro", await wait_intro(False))
            check("A9 flag set after skip", (await ev("localStorage.getItem('smartpyq_intro_seen')")) == "true")
            check("A10 body scroll restored", (await ev("document.body.style.overflow")) != "hidden")

            # ---------- Phase B: no replay ----------
            await rpc("Page.navigate", {"url": BASE + "/"}); await asyncio.sleep(4)
            check("B1 no replay after refresh", await wait_intro(False))
            await goto("/search", settle=3.5)
            check("B2 no intro on /search", not await ev(INTRO))
            await goto("/", settle=3.5)
            check("B3 no intro on internal nav back", not await ev(INTRO))

            # ---------- Phase C: replay from footer ----------
            btn = await click_replay()
            diag = await ev("'footer=' + !!document.querySelector('footer') + ' buttons=' + document.querySelectorAll('button').length")
            check("C1 Replay Intro button exists+clicks", btn == "clicked", f"{btn} [{diag}]")
            await asyncio.sleep(1.2)
            check("C2 intro replays on demand", await wait_intro(True))
            check("C3 flag still true during replay", (await ev("localStorage.getItem('smartpyq_intro_seen')")) == "true")

            # thumbnails: jump to scene 5, Enter SmartPYQ
            await ev("document.querySelector('.thumbnail-carousel [data-index=\"4\"]')?.click()")
            await asyncio.sleep(1.0)
            check("C4 thumbnail jump -> scene 5", "Scene 5 of 5" in (await ev(SCENE) or ""))
            enter = None
            for _ in range(30):  # Enter button animates in ~1.6s after scene 5 lands
                enter = await ev("""(() => {
                  const b=[...document.querySelectorAll('.sp-intro button')].find(x=>/Enter SmartPYQ/.test(x.textContent));
                  if(!b) return 'missing'; b.click(); return 'clicked';})()""")
                if enter == "clicked":
                    break
                await asyncio.sleep(0.2)
            await asyncio.sleep(1.4)
            check("C5 Enter SmartPYQ closes intro", enter == "clicked" and await wait_intro(False))

            # skip button path
            await click_replay()
            await asyncio.sleep(1.0)
            await ev("[...document.querySelectorAll('.sp-intro button')].find(x=>/Skip Intro/.test(x.textContent))?.click()")
            await asyncio.sleep(1.2)
            check("C6 Skip Intro closes", await wait_intro(False))

            # ---------- Phase D: viewports (overflow at intro + homepage) ----------
            for w, h, label in [(1440,900,"1440"), (1366,768,"1366"), (1024,768,"1024"), (768,1024,"768"), (390,844,"390"), (360,740,"360")]:
                await rpc("Emulation.setDeviceMetricsOverride", {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": w < 500})
                # intro view
                await click_replay()
                await asyncio.sleep(1.3)
                ow_intro = await ev("document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth")
                shot = await rpc("Page.captureScreenshot", {"format": "png"})
                open(f"tmp/intro_{label}.png", "wb").write(__import__("base64").b64decode(shot["result"]["data"]))
                await ev("[...document.querySelectorAll('.sp-intro button')].find(x=>/Skip Intro/.test(x.textContent))?.click()")
                await asyncio.sleep(1.0)
                ow_home = await ev("document.scrollingElement.scrollWidth - document.scrollingElement.clientWidth")
                shot = await rpc("Page.captureScreenshot", {"format": "png"})
                open(f"tmp/home_{label}.png", "wb").write(__import__("base64").b64decode(shot["result"]["data"]))
                check(f"D_{label} no overflow (intro/home)", (ow_intro or 0) <= 0 and (ow_home or 0) <= 0, f"intro={ow_intro} home={ow_home}")

            # ---------- Phase E: reduced motion ----------
            await rpc("Emulation.setEmulatedMedia", {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]})
            await rpc("Emulation.setDeviceMetricsOverride", {"width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False})
            await click_replay()
            await asyncio.sleep(1.2)
            check("E1 reduced-motion: intro still shows", await ev(INTRO))
            check("E2 reduced-motion: no particles canvas", not await ev("!!document.querySelector('.sp-intro__particles')"))
            await ev("[...document.querySelectorAll('.sp-intro button')].find(x=>/Skip Intro/.test(x.textContent))?.click()")
            await asyncio.sleep(1.0)
            check("E3 reduced-motion: escape/skip closes", await wait_intro(False))
            await rpc("Emulation.setEmulatedMedia", {"features": []})

            # ---------- console errors ----------
            real_errors = [e for e in console_errors if "ERR_CONNECTION_REFUSED" not in e and "Failed to load resource" not in e]
            check("F1 console clean", len(real_errors) == 0, "; ".join(real_errors[:3]))

            pump_task.cancel()
            print(json.dumps({"summary": f"{sum(1 for r in results if r['ok'])}/{len(results)} passed"}))
            json.dump(results, open(os.path.join("tmp", "intro_results.json"), "w"), indent=1)
    finally:
        proc.kill()
        shutil.rmtree(PROFILE_DIR, ignore_errors=True) if False else None

PROFILE_DIR = os.path.join(os.getcwd(), "tmp", f"intro-{os.getpid()}")
try:
    asyncio.run(run())
except SystemExit:
    raise
except BaseException:
    import traceback
    # Hard crashes must surface as annotations too (check results never populate).
    print("::error title=Intro harness crashed::" + traceback.format_exc()[-600:], flush=True)
    sys.exit(1)

# Surface each failing check as a GitHub annotation (visible on the commit and
# via the API without log access).
for _r in results:
    if not _r["ok"]:
        detail = (": " + _r["detail"]) if _r.get("detail") else ""
        print(f"::error title=Intro check failed::{_r['check']}{detail}", flush=True)

sys.exit(0 if all(r["ok"] for r in results) else 1)  # fail the CI job on any check failure
