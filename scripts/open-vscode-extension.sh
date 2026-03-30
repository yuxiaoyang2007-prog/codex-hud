#!/usr/bin/env bash
set -euo pipefail

if ! command -v code >/dev/null 2>&1; then
  echo "VS Code CLI 'code' is required to open the extension host." >&2
  exit 1
fi

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
code --extensionDevelopmentPath "${repo_root}/packages/vscode" "${repo_root}"
