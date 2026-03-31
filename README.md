# Codex HUD

A persistent HUD overlay for [OpenAI Codex CLI](https://github.com/openai/codex) that runs inside any terminal — including VS Code's integrated terminal. It renders a live two-line footer at the bottom of your terminal showing model info, context remaining, rate-limit usage, active tools, and plan progress while Codex is running.

> **What this is:** A terminal plugin, not a standalone app. It wraps the `codex` command and injects a real-time status footer. Works in Terminal.app, iTerm2, VS Code terminal, and any PTY-capable terminal emulator.

```
[gpt-5.4 xhigh]  Codex  Context ████████░░ 89%  ⏱ 7m  ● thinking
5h 99% 09:01 PM  1w 74% Apr 3  ✓ Read ×3  ✓ Wrote ×1
```

## Features

- **Context bar** — real-time percentage of context window remaining (color-coded green → yellow → red)
- **Rate-limit usage** — 5-hour and weekly usage with reset times, polled via `codex app-server` JSON-RPC
- **Tool tracking** — spinner for the active tool, completed tool counts by type (Read ×3, Wrote ×1, etc.)
- **Plan progress** — step completion indicator (plan: 2/5)
- **Model badge** — current model and reasoning effort level
- **Phase indicator** — thinking / tool-running / idle
- **Ghost-free rendering** — clears footer before scroll-region resets to prevent visual artifacts
- **Shell toggle** — `codex-hud on/off/status` to enable or disable

## Install

```bash
git clone https://github.com/yuxiaoyang2007-prog/codex-hud.git
cd codex-hud
npm install && npm run build

# Copy to ~/.codex-hud for stable PATH-independent use
bash scripts/install-local-plugin.sh
```

## Shell integration (recommended)

Add to `~/.zshrc` or `~/.bashrc` so every `codex` invocation automatically shows the HUD:

```bash
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

Toggle with `codex-hud off` / `codex-hud on`.

## VS Code extension (optional)

A companion status bar extension is included. Download the `.vsix` from [Releases](https://github.com/yuxiaoyang2007-prog/codex-hud/releases) or build it:

```bash
bash scripts/install-vscode-extension.sh
# or
cd packages/vscode && npx @vscode/vsce package --no-dependencies
code --install-extension codex-hud-vscode-0.1.0.vsix
```

## Architecture

```
packages/
  core/       — shared snapshot schema, reducer, persistence
  terminal/   — CLI wrapper with node-pty, footer renderer, rate-limit poller
  vscode/     — VS Code status bar extension
```

The terminal wrapper launches Codex inside a PTY, reserves the bottom two rows via ANSI scroll regions, and continuously renders session state parsed from PTY output and JSON-RPC queries.

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
npm test   # 50 tests across all packages
```

## License

[MIT](LICENSE)

---

# Codex HUD（中文说明）

这是一个给 [OpenAI Codex CLI](https://github.com/openai/codex) 用的终端 HUD 插件，可以在任何终端中运行——包括 VS Code 的集成终端。它会在终端底部渲染两行实时状态栏，显示模型信息、上下文剩余、速率限制用量、当前工具、计划进度等。

> **这是什么：** 一个终端插件（不是独立应用）。它包装了 `codex` 命令，在终端底部注入实时状态栏。支持 Terminal.app、iTerm2、VS Code 终端等所有支持 PTY 的终端。

```
[gpt-5.4 xhigh]  Codex  Context ████████░░ 89%  ⏱ 7m  ● thinking
5h 99% 09:01 PM  1w 74% Apr 3  ✓ Read ×3  ✓ Wrote ×1
```

## 功能

- **上下文进度条** — 实时显示上下文窗口剩余百分比（绿→黄→红渐变）
- **速率限制用量** — 5小时和每周用量 + 重置时间，通过 `codex app-server` JSON-RPC 轮询获取
- **工具追踪** — 正在执行的工具转圈动画 + 已完成工具计数（Read ×3, Wrote ×1 等）
- **计划进度** — 步骤完成指示器（plan: 2/5）
- **模型标签** — 当前模型和推理强度
- **阶段指示** — thinking / tool-running / idle
- **无残影渲染** — 滚动区域重置前清空 footer，防止视觉残留
- **Shell 开关** — `codex-hud on/off/status` 随时启用或禁用

## 安装

```bash
git clone https://github.com/yuxiaoyang2007-prog/codex-hud.git
cd codex-hud
npm install && npm run build

# 复制到 ~/.codex-hud，不依赖 git 仓库路径
bash scripts/install-local-plugin.sh
```

## Shell 集成（推荐）

在 `~/.zshrc` 或 `~/.bashrc` 中添加以下内容，让每次运行 `codex` 都自动带上 HUD：

```bash
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
    on)  export CODEX_HUD_ENABLED=1; echo "[Codex HUD] 已开启" ;;
    off) export CODEX_HUD_ENABLED=0; echo "[Codex HUD] 已关闭" ;;
    *)   echo "[Codex HUD] 状态: $([ "$CODEX_HUD_ENABLED" = 1 ] && echo 开启 || echo 关闭)" ;;
  esac
}
```

用 `codex-hud off` / `codex-hud on` 切换。

## VS Code 扩展（可选）

附带了一个 VS Code 状态栏伴侣扩展。从 [Releases](https://github.com/yuxiaoyang2007-prog/codex-hud/releases) 下载 `.vsix` 或自行构建：

```bash
bash scripts/install-vscode-extension.sh
# 或
cd packages/vscode && npx @vscode/vsce package --no-dependencies
code --install-extension codex-hud-vscode-0.1.0.vsix
```
