"""Vercel Python Function entrypoint — wraps the existing FastAPI app.

Vercel's Python runtime detects the `app` ASGI callable below and serves
every request routed here (see ../vercel.json) through it, unchanged from
the rest of the demo backend. The only Vercel-specific piece is this file
and the env vars set in vercel.json (ANALYTICS_DB points at the bundled
demo.db SQLite file, DEMO_MODE=true, everything else blank).
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# The bundled snapshot of the seeded demo data. Vercel's deployment
# filesystem is read-only, so the connection must open it explicitly via a
# SQLite URI in read-only mode (mode=ro) — a normal path would try to open
# a read-write file descriptor and fail immediately, even for SELECT-only
# queries, before a single query ever runs.
_DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo.db")
os.environ.setdefault("ANALYTICS_DB", f"sqlite+aiosqlite:///file:{_DB_PATH}?mode=ro&uri=true")
os.environ.setdefault("PROD_DB", "")
os.environ.setdefault("DEMO_MODE", "true")

from app.main import app  # noqa: E402
