#!/usr/bin/env python3
"""Local dev server that routes like Cloudflare's asset server.

The deployed site serves pages extensionless (/pricing, not /pricing.html) and
308s the .html form, so every internal link is written that way. Plain
`python -m http.server` 404s on all of them, which would make the local preview
a worse copy of production than the source deserves.

Lives at the repo root, not in website/, because wrangler publishes that whole
directory — anything in there is a public URL.
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class AssetHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        local = Path(super().translate_path(path))
        if not local.exists() and not local.suffix:
            candidate = local.with_suffix(".html")
            if candidate.is_file():
                return str(candidate)
        return str(local)

    def send_head(self):
        # Mirror production's 308 so a stale .html link is caught locally too
        clean = self.path.split("?", 1)[0].split("#", 1)[0]
        if clean.endswith(".html") and clean != "/index.html":
            self.send_response(308)
            self.send_header("Location", clean[: -len(".html")])
            self.end_headers()
            return None
        return super().send_head()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8099
    root = Path(__file__).parent / "website"
    ThreadingHTTPServer(("127.0.0.1", port), partial(AssetHandler, directory=str(root))).serve_forever()
