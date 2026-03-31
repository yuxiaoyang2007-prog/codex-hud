#!/usr/bin/env bash
set -euo pipefail
node "${CLAUDE_PLUGIN_ROOT}/scripts/emit-hook-event.mjs" session-stop
