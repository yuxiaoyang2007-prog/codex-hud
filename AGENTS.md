# AGENTS.md — Codex HUD

Instructions for AI coding agents (Codex, Claude Code, etc.) working on this repo.

## Build & Verify

Always run after making changes:

```bash
npm run build && npm test
```

All 50 tests must pass before committing. Build order: core → terminal → vscode.

## Code Style

- TypeScript strict mode, ESM modules
- Tests co-located as `*.test.ts` next to source files
- Use vitest for testing (`describe`, `it`, `expect`, `vi`)
- No default exports; use named exports
- Imports use `.js` extension for ESM compatibility (e.g., `import { Screen } from './screen.js'`)

## Package Boundaries

- `@codex-hud/core` — pure logic, no Node.js-specific APIs beyond fs/net, no runtime dependencies
- `@codex-hud/terminal` — Node.js specific, depends on core + node-pty
- `codex-hud-vscode` — VS Code extension API only, depends on core

Do not introduce cross-dependencies between terminal and vscode.

## Key Patterns

### HudSnapshot State Machine
All state changes go through `applyHudEvent(snapshot, event)` in `core/reducer.ts`. Never mutate snapshots directly.

### ANSI Footer Rendering
The footer is built as a plain string in `footer-renderer.ts` and written to the terminal by `screen.ts`. Keep rendering logic separate from terminal I/O.

### PTY Output Parsing
Tool and phase detection in `cli.ts` (`observePtyChunk`) uses regex on ANSI-stripped text. When adding new patterns, add corresponding test cases.

## Commit Messages

Use conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `chore:`.
