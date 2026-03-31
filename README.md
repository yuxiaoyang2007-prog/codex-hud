# Codex HUD

A terminal-first HUD overlay for [OpenAI Codex CLI](https://github.com/openai/codex). Displays live session data — model, context remaining, rate-limit usage, active tools, and plan progress — in a persistent two-line footer at the bottom of your terminal.

## Features

- **Context bar** — real-time percentage of context window remaining (green/yellow/red)
- **Rate-limit usage** — 5-hour and weekly usage with reset times, polled from `codex app-server`
- **Tool tracking** — spinner for active tools, completed tool counts by type
- **Plan progress** — step completion indicator
- **Model badge** — current model and reasoning effort
- **VS Code extension** — mirrors the same session state into the VS Code status bar
- **Ghost-free rendering** — clears footer before scroll-region resets to prevent artifacts

## Architecture

```
packages/
  core/       — shared snapshot schema, reducer, persistence
  terminal/   — CLI wrapper with node-pty, footer renderer, rate-limit poller
  vscode/     — VS Code status bar extension
```

The terminal wrapper launches Codex inside a PTY, reserves the bottom two terminal rows via ANSI scroll regions, and continuously renders session state parsed from PTY output and JSON-RPC queries.

## Quick start

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run the HUD-wrapped Codex
node packages/terminal/dist/cli.js -- [codex args]
```

## Shell integration (recommended)

Add to your `~/.zshrc` or `~/.bashrc` for automatic HUD on every `codex` invocation:

```bash
# --- Codex HUD ---
export CODEX_HUD_ENABLED="${CODEX_HUD_ENABLED:-1}"
_CODEX_HUD_CLI="$HOME/.codex-hud/packages/terminal/dist/cli.js"

codex() {
  if [[ "$CODEX_HUD_ENABLED" == "1" && -f "$_CODEX_HUD_CLI" ]]; then
    node "$_CODEX_HUD_CLI" -- "$@"
  else
    command codex "$@"
  fi
}

codex-hud() {
  case "${1:-status}" in
    on)  export CODEX_HUD_ENABLED=1; echo "[Codex HUD] Enabled" ;;
    off) export CODEX_HUD_ENABLED=0; echo "[Codex HUD] Disabled" ;;
    *)   echo "[Codex HUD] $([ "$CODEX_HUD_ENABLED" = 1 ] && echo Enabled || echo Disabled)" ;;
  esac
}
```

Then toggle with `codex-hud on` / `codex-hud off`.

## Stable install

```bash
# Build and copy to ~/.codex-hud for PATH-independent use
bash scripts/install-local-plugin.sh
```

## VS Code extension

```bash
# Install the companion status bar extension
bash scripts/install-vscode-extension.sh
```

Or package as `.vsix`:

```bash
cd packages/vscode
npx @vscode/vsce package --no-dependencies
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CODEX_HUD_ENABLED` | `1` | Set to `0` to bypass the HUD wrapper |
| `CODEX_HUD_STATE_FILE` | `/tmp/codex-hud/session-<pid>.json` | Snapshot file path |
| `CODEX_HUD_COMMAND` | `codex` | Override the Codex binary path |
| `CODEX_HUD_NO_PTY` | unset | Force shared-stdio fallback (no PTY) |
| `CODEX_HUD_DEBUG` | unset | Enable debug logging to stderr |

## Development

```bash
npm install
npm run build
npm test
```

## License

[MIT](LICENSE)
