# Codex HUD Design

**Date:** 2026-03-30

**Goal:** Build a local Codex HUD that adds a compact real-time status layer to terminal Codex sessions, works inside VS Code's integrated terminal, and shares one telemetry core across both surfaces.

## Scope

- Include:
  - terminal-first HUD for Codex CLI sessions
  - VS Code companion surface that reads the same session state
  - local Codex plugin hooks for precise lifecycle events when available
  - fallback parsing of Codex session artifacts when hooks do not provide enough data
- Exclude:
  - Codex desktop client integration
  - editing prompts, tasks, or plans from the HUD
  - cloud sync, team dashboards, or remote telemetry

## Product Shape

The product has three parts that share one event model:

1. `codex-hud-core`
   - Owns the canonical event schema and session snapshot model.
   - Merges events from hooks, local process state, and fallback log parsing.
   - Publishes one normalized snapshot per session.

2. `codex-hud-terminal`
   - A wrapper command that launches `codex` inside a PTY.
   - Renders a compact one-line or two-line HUD in the terminal.
   - Works in standard terminals and VS Code integrated terminal because it is still a normal terminal process.

3. `codex-hud-vscode`
   - A VS Code extension that watches the same session snapshot.
   - Shows condensed state in the status bar and a lightweight details view.
   - Does not replace the terminal renderer; it complements it.

## User Experience

The user starts Codex through a wrapper command such as `codex-hud`. The wrapper allocates a session channel, starts the shared state service, then launches the normal Codex CLI in a PTY. While Codex runs, the HUD shows:

- session id, model, and reasoning effort
- current phase: `idle`, `thinking`, `tool-running`, `waiting`, or `error`
- active tool name and elapsed time
- current plan step and completed-to-total step count when derivable
- subagent count and recent subagent transitions
- warnings such as stale activity, tool failure, or degraded telemetry

The VS Code extension reads the same state and surfaces a compact summary in the status bar so the user can glance away from the terminal output and still understand progress.

## Architecture

### Event Sources

The system should combine three signal sources in priority order:

1. Codex hook events
   - Use local plugin hooks for `SessionStart`, `SessionStop`, `UserPromptSubmit`, `PreToolUse`, and `PostToolUse` when the installed Codex version supports them.
   - Hook scripts emit newline-delimited JSON events to a local socket or state service.

2. Wrapper process telemetry
   - The PTY wrapper tracks process lifecycle, screen redraw cadence, and idle duration.
   - This provides stable session liveness even if hooks fail.

3. Fallback Codex artifact parsing
   - Tail `~/.codex/sessions/.../*.jsonl` and, only if needed, `~/.codex/log/codex-tui.log`.
   - Derive plan progress from `update_plan` tool calls and subagent state from `spawn_agent`, `wait_agent`, `send_input`, and `close_agent`.

### Snapshot Model

Each session has one in-memory and on-disk snapshot with fields for:

- session metadata
- current status
- current and recent tool activity
- plan progress
- subagent progress
- warnings and degraded-state flags
- timestamps for last activity and last successful update

The snapshot is written to a local JSON file so the terminal renderer and the VS Code extension can read the same state without duplicating parser logic.

### Terminal Rendering

The terminal renderer should default to a compact footer-style presentation:

- Line 1: session, model, phase, active tool, elapsed time
- Line 2: plan progress, subagent count, warnings

If the terminal cannot safely support sticky footer behavior, the renderer should degrade to a periodic summary line rather than corrupting the Codex TUI.

### VS Code Rendering

The VS Code extension should:

- watch the current snapshot file
- expose one status bar item with the most important signal
- provide one command to open a small read-only details panel
- avoid taking over Codex terminal management in v1

## Reliability and Fallbacks

- Hooks are preferred but cannot be the only telemetry source.
- If hooks are missing or unsupported, the wrapper and log parser still provide a usable HUD.
- If log parsing falls behind, the HUD should show a degraded warning instead of stale confidence.
- If token or context usage cannot be measured accurately, show `n/a` rather than a guessed number.

## Testing Strategy

- Unit-test snapshot reduction from individual events.
- Unit-test fallback parsing from captured Codex session fixtures.
- Unit-test terminal line formatting for narrow and wide terminals.
- Unit-test VS Code status summarization from sample snapshots.
- Run one end-to-end test with a fake Codex child process plus synthetic hook events.

## Success Criteria

- Running `codex-hud` gives a stable terminal HUD during normal Codex CLI usage.
- The same session state appears in VS Code without extra manual syncing.
- Tool activity, phase changes, plan progress, and subagent count are all visible when the data exists.
- Missing telemetry is clearly labeled and does not break the session.

## Assumptions

- The initial implementation targets local terminal usage only.
- The project starts from an empty directory, so repository scaffolding is part of implementation.
- Local plugin installation can be handled through a home-local or repo-local marketplace entry during development.
