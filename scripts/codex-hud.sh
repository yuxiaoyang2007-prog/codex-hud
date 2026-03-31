#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cli_path="${repo_root}/packages/terminal/dist/cli.js"

if [[ ! -f "${cli_path}" ]]; then
  (
    cd "${repo_root}"
    npm run build --workspace @codex-hud/terminal
  )
fi

exec node "${cli_path}" "$@"
