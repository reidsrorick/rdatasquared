"""Dev static server for the local RBS Budget app.

Plain `python -m http.server` caches ES modules aggressively, so an edit to a
.js file often doesn't show up without a hard reload. This server sends
`Cache-Control: no-store` so every reload picks up the latest source.

    python tools/serve.py [port]      # default 4173

Production doesn't use this — GitHub Pages serves the static files directly.
"""
import sys
import os
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 4173


class NoCacheHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()


if __name__ == '__main__':
    print(f'RBS Budget (local) — http://localhost:{PORT}   serving {ROOT}')
    ThreadingHTTPServer(('127.0.0.1', PORT), NoCacheHandler).serve_forever()
