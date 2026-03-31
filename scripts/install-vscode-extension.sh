#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
extension_root="${repo_root}/packages/vscode"

npm run build --workspace codex-hud-vscode

publisher="$(node -p "require('${extension_root}/package.json').publisher")"
name="$(node -p "require('${extension_root}/package.json').name")"
version="$(node -p "require('${extension_root}/package.json').version")"
target_dir="${HOME}/.vscode/extensions/${publisher}.${name}-${version}"

rm -rf "${target_dir}"
mkdir -p "${target_dir}"
cp "${extension_root}/package.json" "${target_dir}/package.json"
cp -R "${extension_root}/dist" "${target_dir}/dist"

echo "Installed ${publisher}.${name}@${version} to ${target_dir}"
echo "Reload VS Code to activate the extension."
