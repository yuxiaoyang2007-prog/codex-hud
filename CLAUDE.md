# CLAUDE.md — Codex HUD

## Project Overview

**Codex HUD** is a terminal-first HUD overlay for [OpenAI Codex CLI](https://github.com/openai/codex). It wraps the `codex` command and renders a persistent two-line ANSI footer at the bottom of the terminal, showing real-time session data: model, context remaining, rate-limit usage, active tools, plan progress, and phase.

- **GitHub**: https://github.com/yuxiaoyang2007-prog/codex-hud
- **License**: MIT
- **Author**: Xiaoyang Yu (Joulian)

## Architecture

npm workspaces monorepo with 3 packages:

```
packages/
  core/       @codex-hud/core      — snapshot schema, event reducer, socket server, persistence
  terminal/   @codex-hud/terminal   — CLI entry (cli.ts), PTY launcher, footer renderer, screen, rate-limit poller
  vscode/     codex-hud-vscode      — VS Code status bar extension (optional companion)
```

### Data Flow

1. `cli.ts` spawns Codex inside a PTY via `pty-launcher.ts` (node-pty)
2. `screen.ts` reserves bottom 2 rows via ANSI scroll regions (`\e[1;Nr`)
3. PTY output is parsed in `cli.ts` (`observePtyChunk`) to extract: context %, phase, tool activity
4. Rate limits are polled from `codex app-server --listen stdio://` via JSON-RPC (`rate-limit-poller.ts`)
5. State is managed as `HudSnapshot` (defined in `core/schema.ts`), updated via `applyHudEvent` reducer
6. `footer-renderer.ts` renders the snapshot into a color-coded two-line ANSI string
7. `screen.ts` writes the footer into the reserved terminal rows on every update

### Key Technical Details

- **Scroll region**: `\e[1;Nr` reserves bottom rows; Codex TUI resets with `\e[r` which would create ghost footers
- **Ghost fix**: `getFooterClearSequence()` clears footer rows before forwarding any PTY chunk containing `\e[...r`
- **Rate-limit JSON-RPC**: Spawns `codex app-server --listen stdio://`, sends `initialize` + `account/rateLimits/read`
- **Binary discovery**: `findCodexBinary()` checks VS Code extensions dir first, then PATH
- **Fallback**: If node-pty fails, falls back to shared-stdio mode (no footer, snapshot file only)

## Build & Test

```bash
npm install          # installs all workspaces + node-pty
npm run build        # builds core → terminal → vscode
npm test             # 50 tests: core(25) + terminal(23) + vscode(2)
npm run test:e2e     # e2e tests in tests/e2e/
```

Build order matters: core must build before terminal (terminal imports from core).

## Key Files

| File | Purpose |
|------|---------|
| `packages/core/src/schema.ts` | HudSnapshot, HudEvent, HudPhase types; createEmptySnapshot |
| `packages/core/src/reducer.ts` | applyHudEvent — event → snapshot state machine |
| `packages/core/src/socket-server.ts` | Unix socket server for cross-process snapshot sharing |
| `packages/terminal/src/cli.ts` | Main entry point; PTY observer, render loop, rate-limit poller integration |
| `packages/terminal/src/pty-launcher.ts` | Spawns Codex via node-pty; resolveCommand, fallback to shared-stdio |
| `packages/terminal/src/screen.ts` | Screen class: scroll region, attach, render, dispose, getFooterClearSequence |
| `packages/terminal/src/footer-renderer.ts` | renderFooter — builds the two-line ANSI string from HudSnapshot |
| `packages/terminal/src/rate-limit-poller.ts` | Polls codex app-server for 5h/weekly rate limits via JSON-RPC |
| `packages/vscode/src/extension.ts` | VS Code extension activation; watches snapshot file, updates status bar |
| `scripts/install-local-plugin.sh` | Builds and copies dist to ~/.codex-hud/ for stable use |
| `scripts/install-vscode-extension.sh` | Builds and installs the VS Code extension |

## Shell Integration

Users add a `codex()` shell function to `~/.zshrc` that wraps `codex` through the HUD CLI:

```bash
node ~/.codex-hud/packages/terminal/dist/cli.js -- [codex args]
```

Toggle: `codex-hud on/off/status` (sets `CODEX_HUD_ENABLED` env var).

## Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `CODEX_HUD_ENABLED` | `1` | Shell integration toggle |
| `CODEX_HUD_STATE_FILE` | `/tmp/codex-hud/session-<pid>.json` | Snapshot file path |
| `CODEX_HUD_COMMAND` | `codex` | Override Codex binary |
| `CODEX_HUD_NO_PTY` | unset | Force shared-stdio fallback |
| `CODEX_HUD_DEBUG` | unset | Debug logging to stderr |
| `CODEX_HUD_SESSION_ID` | `local-session` | Session identifier |

## Installed Locations

- **Project source**: `~/projects/codex-hud/`
- **Stable install**: `~/.codex-hud/` (built dist files, copied by `scripts/install-local-plugin.sh`)
- **CLI entry**: `~/.codex-hud/packages/terminal/dist/cli.js`
- **Shell functions**: `~/.zshrc` (`codex()` and `codex-hud()`)

## Conventions

- TypeScript strict mode, ESM (`"type": "module"`)
- Tests use vitest; co-located as `*.test.ts` next to source
- No runtime dependencies in core (pure logic)
- terminal depends on core + node-pty
- vscode depends on core + @types/vscode (devDependency only)

## Codex Cloud Environment

A GitHub-linked Codex Cloud Environment has been configured for this repo. Cloud Codex can be given tasks via chatgpt.com/codex and will auto-create PRs against this repo.

## Known Limitations

- PTY output parsing is heuristic (regex on ANSI-stripped text); edge cases with unusual Codex output formats
- Rate-limit poller requires `codex` binary with `app-server` support (VS Code extension bundled binary or PATH)
- Footer occupies 2 rows; terminals with fewer than 4 rows won't show the HUD
- node-pty requires native compilation; may fail on restricted environments (falls back to shared-stdio)
