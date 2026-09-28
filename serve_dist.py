"""Serve smartpyq-frontend/dist with SPA history fallback (no npm needed).
Usage: python serve_dist.py [port]
"""
import http.server, socketserver, os, sys, threading

PORT = int(sys.argv[1] if len(sys.argv) > 1 else 5175)
DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "smartpyq-frontend", "dist")
LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tmp", "serve_dist.log")
os.makedirs(os.path.dirname(LOG), exist_ok=True)

_log_lock = threading.Lock()

def log(line):
    with _log_lock:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")

class SPAHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIST, **kw)

    def send_head(self):
        # SPA history fallback: unknown non-asset paths -> index.html
        path = self.translate_path(self.path)
        if not os.path.exists(path) and not self.path.startswith("/assets"):
            self.path = "/index.html"
        return super().send_head()

    def end_headers(self):
        # hashed assets are immutable; index.html must always revalidate
        p = self.path.split("?")[0]
        if p.startswith("/assets/"):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        else:
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        log("%s %s" % (self.log_date_time_string(), fmt % args))

class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    # Chrome keeps pre-connected idle sockets; without this, handler threads
    # linger forever holding the accept loop's attention.
    request_queue_size = 32

if __name__ == "__main__":
    httpd = Server(("127.0.0.1", PORT), SPAHandler)
    print(f"serving {DIST} on {PORT}", flush=True)
    httpd.serve_forever()
