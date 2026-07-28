#!/usr/bin/env python3
"""Serve the mockup board and persist picks to picks.json on every click."""
import json
import os
from http.server import HTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = 3013


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def do_POST(self):
        if self.path != "/save":
            self.send_response(404)
            self.end_headers()
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            picks = json.loads(self.rfile.read(length))
        except ValueError:
            self.send_response(400)
            self.end_headers()
            return
        # An empty object means the board just loaded and localStorage has no picks yet, not
        # that every pick should be cleared. Only a real payload overwrites the saved file.
        if picks:
            with open(os.path.join(ROOT, "picks.json"), "w") as f:
                json.dump(picks, f, indent=2)
        self.send_response(204)
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
