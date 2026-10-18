#!/usr/bin/env bash
# Runner entry point; no shell evaluation of forwarded arguments.
set -Eeuo pipefail
exec python3 "$(dirname "$0")/orchestrate.py" "$@"
