# Codex HUD

Local workspace for a terminal-first Codex HUD and shared session snapshot core.

## Workspace

- `packages/core` holds the shared snapshot schema and reducers.
- `packages/terminal` will wrap the Codex CLI in a PTY.
- `packages/vscode` will provide the companion VS Code surface.
- `tests/e2e` verifies the wrapper can write a session snapshot end to end.

## Getting started

- Install dependencies with `npm install`.
- Run the workspace tests with `npm test`.

## Local development

1. Install dependencies with `npm install`.
2. Build all packages with `npm run build`.
3. Run the full test suite with `npm test`.
4. Launch the wrapper with `CODEX_HUD_STATE_FILE=/tmp/codex-hud/snapshot.json node packages/terminal/dist/cli.js -- --help`.
5. Install the local Codex plugin with `./scripts/install-local-plugin.sh`.
6. Open the VS Code extension host with `./scripts/open-vscode-extension.sh`.

The terminal wrapper prefers `node-pty` for interactive sessions. When PTY startup is unavailable in a restricted environment, it falls back to a standard child process so snapshot verification can still run locally.
