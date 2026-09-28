"""CDP screenshot helper.

Usage: python shot.py <url> <out.png> [width] [height] [full]
full=1 -> capture the whole page (beyond viewport).
Prints JSON: {ok, url, title, consoleErrors, shotBytes}.
"""
import json, subprocess, time, urllib.request, socket, sys, os, shutil, base64
import asyncio
import websockets

os.environ["NO_PROXY"] = "*"
os.environ["no_proxy"] = "*"
for _v in ("HTTP_PROXY", "HTTPS_PROXY", "http_proxy", "https_proxy"):
    os.environ.pop(_v, None)
_opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
urllib.request.install_opener(_opener)

CHROME_CANDIDATES = ([
    os.environ.get("CHROME_PATH"),  # explicit override (e.g. browser-actions/setup-chrome)
] if os.environ.get("CHROME_PATH") else []) + [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    # Linux (GitHub Actions runners: google-chrome-stable is preinstalled)
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
]
# Sandboxing is unavailable inside CI containers; Windows keeps defaults.
LINUX_FLAGS = [] if os.name == "nt" else ["--no-sandbox", "--disable-dev-shm-usage"]
PROFILE = os.path.join(os.getcwd(), "tmp", f"shot-{os.getpid()}")


def free_port():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); p = s.getsockname()[1]; s.close(); return p


def start_chrome(w, h):
    chrome = next((c for c in CHROME_CANDIDATES if c and os.path.exists(c)), None)
    if not chrome:
        print("::error title=Chrome not found::checked " + " | ".join(str(c) for c in CHROME_CANDIDATES if c), flush=True)
        sys.exit(1)
        return
    port = free_port()
    shutil.rmtree(PROFILE, ignore_errors=True)
    os.makedirs(PROFILE, exist_ok=True)
    args = [chrome, "--headless=new", f"--remote-debugging-port={port}",
            f"--user-data-dir={PROFILE}", "--no-first-run", "--disable-gpu",
            "--disable-extensions", "--no-default-browser-check",
            *LINUX_FLAGS,
            f"--window-size={w},{h}", "about:blank"]
    proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(50):
        try:
            with _opener.open(f"http://127.0.0.1:{port}/json/list", timeout=2) as r:
                tabs = json.loads(r.read())
            pages = [t for t in tabs if t.get("type") == "page"]
            if pages:
                return proc, pages[0]["webSocketDebuggerUrl"]
        except Exception:
            time.sleep(0.3)
    proc.kill()
    print(json.dumps({"error": "no CDP target"})); sys.exit(1)


async def main(url, out, w, h, full):
    proc, ws_url = start_chrome(w, h)
    console_errors = []
    try:
        async with websockets.connect(ws_url, max_size=64 * 1024 * 1024) as ws:
            mid = 0
            async def rpc(method, params=None):
                nonlocal mid
                mid += 1
                await ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
                while True:
                    msg = json.loads(await ws.recv())
                    if msg.get("id") == mid:
                        return msg

            async def pump():
                while True:
                    try:
                        msg = json.loads(await ws.recv())
                    except Exception:
                        return
                    if msg.get("method") == "Runtime.consoleAPICalled" and msg["params"]["type"] == "error":
                        console_errors.append(str(msg["params"]["args"])[:300])
                    if msg.get("method") == "Log.entryAdded" and msg["params"]["entry"]["level"] == "error":
                        console_errors.append(msg["params"]["entry"]["text"][:300])

            pump_task = asyncio.create_task(pump())
            await rpc("Runtime.enable")
            await rpc("Log.enable")
            await rpc("Page.enable")
            await rpc("Emulation.setDeviceMetricsOverride",
                      {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": w < 500})
            await rpc("Page.navigate", {"url": url})
            await asyncio.sleep(10.0)
            # let React/lazy chunks settle
            for _ in range(10):
                r = await rpc("Runtime.evaluate", {"expression": "document.readyState", "returnByValue": True})
                if r["result"]["result"].get("value") == "complete":
                    break
                await asyncio.sleep(1.0)
            await asyncio.sleep(2.0)
            full_expr = ("Math.ceil(document.documentElement.scrollHeight) + 40" if full else str(h))
            r = await rpc("Runtime.evaluate", {"expression": full_expr, "returnByValue": True})
            page_h = min(int(r["result"]["result"]["value"] or h), 12000)
            await rpc("Emulation.setDeviceMetricsOverride",
                      {"width": w, "height": page_h, "deviceScaleFactor": 1, "mobile": w < 500})
            await asyncio.sleep(1.0)
            shot = await rpc("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": True})
            data = base64.b64decode(shot["result"]["data"])
            os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
            with open(out, "wb") as f:
                f.write(data)
            pump_task.cancel()
            title = await rpc("Runtime.evaluate", {"expression": "document.title", "returnByValue": True})
            print(json.dumps({"ok": True, "out": out, "bytes": len(data),
                              "title": title["result"]["result"].get("value", ""),
                              "consoleErrors": console_errors[:10]}))
    finally:
        proc.kill()
        shutil.rmtree(PROFILE, ignore_errors=True)


if __name__ == "__main__":
    url = sys.argv[1]
    out = sys.argv[2]
    w = int(sys.argv[3]) if len(sys.argv) > 3 else 1262
    h = int(sys.argv[4]) if len(sys.argv) > 4 else 900
    full = (len(sys.argv) > 5 and sys.argv[5] == "1")
    asyncio.run(main(url, out, w, h, full))
