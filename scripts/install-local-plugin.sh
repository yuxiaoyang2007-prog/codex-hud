#!/usr/bin/env bash
set -euo pipefail

mkdir -p "${HOME}/.agents/plugins"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cat > "${HOME}/.agents/plugins/marketplace.json" <<EOF
{
  "name": "local-dev",
  "interface": {
    "displayName": "Local Development"
  },
  "plugins": [
    {
      "name": "codex-hud",
      "source": {
        "source": "local",
        "path": "${repo_root}/plugins/codex-hud"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
EOF

echo "Local marketplace wrote ${repo_root}/plugins/codex-hud to ${HOME}/.agents/plugins/marketplace.json"
