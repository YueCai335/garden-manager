#!/usr/bin/env sh
# Starts an isolated FastAPI backend for the end-to-end run: a fresh SQLite
# file, migrated from scratch, on its own port. Used by playwright.config.ts.
set -eu

cd "$(dirname "$0")/../backend"

if [ -x .venv/bin/python ]; then PYTHON=.venv/bin/python; else PYTHON=python; fi

E2E_DB="$(pwd)/.e2e-garden.db"
rm -f "$E2E_DB"
export DATABASE_URL="sqlite+pysqlite:///$E2E_DB"
export FRONTEND_ORIGINS="http://localhost:3100,http://127.0.0.1:3100"

"$PYTHON" -m alembic upgrade head
exec "$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 8100
