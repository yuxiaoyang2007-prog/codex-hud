#!/usr/bin/env node

import {
  applyHudEvent,
  createEmptySnapshot,
  createHudSocketServer,
  writeSnapshot,
  type HudEvent,
  type HudPhase,
  type HudSnapshot
} from '@codex-hud/core';
import type { AddressInfo, Server } from 'node:net';
import { readFileSync, realpathSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { launchCodexWithHud, type HudChildProcess, type HudExitStatus } from './pty-launcher.js';
import { startRateLimitPoller } from './rate-limit-poller.js';
import { Screen } from './screen.js';
import { startSessionWatcher } from './session-watcher.js';

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function waitForExit(ptyProcess: HudChildProcess): Promise<HudExitStatus> {
  return new Promise((resolve) => {
    ptyProcess.onExit((status: HudExitStatus) => {
      resolve(status);
    });
  });
}

function createSocketPath(snapshotPath: string): string {
  const snapshotDirectory = dirname(snapshotPath);
  const snapshotName = basename(snapshotPath, '.json');
  return join(snapshotDirectory, `${snapshotName}.${process.pid}.sock`);
}

export function createDefaultSnapshotPath(): string {
  return join('/tmp', 'codex-hud', 'current.json');
}

function readCodexConfig(): { model?: string; reasoningEffort?: string } {
  try {
    const configPath = join(homedir(), '.codex', 'config.toml');
    const content = readFileSync(configPath, 'utf8');
    const result: { model?: string; reasoningEffort?: string } = {};

    const modelMatch = content.match(/^model\s*=\s*"([^"]+)"/m);
    if (modelMatch) {
      result.model = modelMatch[1];
    }

    const effortMatch = content.match(/^model_reasoning_effort\s*=\s*"([^"]+)"/m);
    if (effortMatch) {
      result.reasoningEffort = effortMatch[1];
    }

    return result;
  } catch {
    return {};
  }
}

async function initializeSnapshot(snapshotPath: string, env: NodeJS.ProcessEnv): Promise<HudSnapshot> {
  const sessionId = env.CODEX_HUD_SESSION_ID ?? 'local-session';
  const codexConfig = readCodexConfig();
  const snapshot = applyHudEvent(createEmptySnapshot(sessionId), {
    type: 'session.start',
    at: new Date().toISOString(),
    model: env.CODEX_MODEL_NAME ?? codexConfig.model,
    reasoningEffort: codexConfig.reasoningEffort
  });

  await writeSnapshot(snapshotPath, snapshot);
  return snapshot;
}

async function startHudServer(
  snapshotPath: string,
  initialSnapshot: HudSnapshot,
  onSnapshot: (snapshot: HudSnapshot) => void
): Promise<{
  childEnvPatch: NodeJS.ProcessEnv;
  server: Server;
  socketPath: string | null;
}> {
  const socketPath = createSocketPath(snapshotPath);
  await mkdir(dirname(snapshotPath), { recursive: true });
  await rm(socketPath, { force: true });

  try {
    const server = createHudSocketServer(snapshotPath, {
      initialSnapshot,
      onSnapshot
    });
    await listen(server, socketPath);

    return {
      childEnvPatch: {
        CODEX_HUD_SOCKET_PATH: socketPath
      },
      server,
      socketPath
    };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('EPERM')) {
      throw error;
    }

    const server = createHudSocketServer(snapshotPath, {
      initialSnapshot,
      onSnapshot
    });
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('Expected TCP address info from HUD server fallback');
    }

    return {
      childEnvPatch: {
        CODEX_HUD_SOCKET_HOST: address.address,
        CODEX_HUD_SOCKET_PORT: String(address.port)
      },
      server,
      socketPath: null
    };
  }
}

interface DirectSnapshotState {
  buffer: string;
}

// ---------------------------------------------------------------------------
// PTY output observer — always active, extracts state from Codex's TUI output
// ---------------------------------------------------------------------------

function stripAnsiCodes(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b(?:\[[0-9;?]*[A-Za-z]|\][^\x07]*\x07|[()][012AB]|[78=>#])/g, '');
}

interface PtyObserver {
  lastContextPercent: number | null;
  lastPhase: HudPhase | null;
}

function createPtyObserver(): PtyObserver {
  return { lastContextPercent: null, lastPhase: null };
}

function observePtyChunk(observer: PtyObserver, runtime: MainRuntime, chunk: string): void {
  const clean = stripAnsiCodes(chunk);
  const at = new Date().toISOString();

  // Context percentage: Codex renders "89% left" in its status bar
  const contextMatch = clean.match(/(\d+)%\s*left/);
  if (contextMatch) {
    const percent = parseInt(contextMatch[1], 10);
    if (percent !== observer.lastContextPercent && percent >= 0 && percent <= 100) {
      observer.lastContextPercent = percent;
      runtime.snapshot = applyHudEvent(runtime.snapshot, {
        type: 'context.update',
        percentLeft: percent,
        at
      });
    }
  }

  // Phase: "Working (Ns" → thinking
  if (/Working\s*\(/.test(clean)) {
    if (observer.lastPhase !== 'thinking') {
      observer.lastPhase = 'thinking';
      runtime.snapshot = applyHudEvent(runtime.snapshot, {
        type: 'phase.update',
        phase: 'thinking',
        at
      });
    }
  }

  // Completed tools — match broadly since ANSI stripping may eat tree-drawing chars.
  // Patterns: "└ Read SKILL.md", "Read SKILL.md", "Wrote file.ts", "Ran command"
  const toolPattern =
    /(?:^|[└├─\s])\s*(Read|Wrote|Ran|Searched|Listed|Patched|Created|Deleted|Edited)\s+(\S+)/gm;
  for (const m of clean.matchAll(toolPattern)) {
    const action = m[1] as string;
    runtime.snapshot = applyHudEvent(runtime.snapshot, {
      type: 'tool.start',
      toolName: action,
      at
    });
    runtime.snapshot = applyHudEvent(runtime.snapshot, {
      type: 'tool.finish',
      toolName: action,
      success: true,
      at
    });
  }

  // "Explored" means tools ran (even if individual tool lines were missed)
  if (/Explored/.test(clean) && observer.lastPhase === 'thinking') {
    observer.lastPhase = 'idle';
    runtime.snapshot = applyHudEvent(runtime.snapshot, {
      type: 'phase.update',
      phase: 'idle',
      at
    });
  }

  // Idle: Codex prompt "›" (thin angle bracket) — only when it's a short prompt-like chunk
  if (/[›❯>]\s*$/.test(clean.trim()) && clean.trim().length < 10) {
    if (observer.lastPhase !== 'idle') {
      observer.lastPhase = 'idle';
      runtime.snapshot = applyHudEvent(runtime.snapshot, {
        type: 'phase.update',
        phase: 'idle',
        at
      });
    }
  }
}

interface MainRuntime {
  snapshotPath: string;
  screen: Screen;
  snapshot: HudSnapshot;
}

async function applySnapshotEvent(runtime: MainRuntime, event: HudEvent): Promise<void> {
  runtime.snapshot = applyHudEvent(runtime.snapshot, event);
  runtime.screen.render(runtime.snapshot);
  await writeSnapshot(runtime.snapshotPath, runtime.snapshot);
}

function attachInput(child: HudChildProcess): () => void {
  const stdin = process.stdin as NodeJS.ReadStream & {
    isRaw?: boolean;
    setRawMode?: (mode: boolean) => void;
  };
  const wasRaw = Boolean(stdin.isRaw);
  const onData = (chunk: Buffer | string) => {
    child.write(typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
  };

  if (stdin.isTTY) {
    stdin.setRawMode?.(true);
  }
  stdin.resume();
  stdin.on('data', onData);

  return () => {
    stdin.off('data', onData);
    stdin.pause();
    if (stdin.isTTY) {
      stdin.setRawMode?.(wasRaw);
    }
  };
}

function attachResize(
  child: HudChildProcess,
  screen: Screen,
  getSnapshot: () => HudSnapshot
): () => void {
  if (!process.stdout.isTTY) {
    return () => undefined;
  }

  const onResize = () => {
    child.resize(screen.getContentViewport());
    screen.attach();
    screen.render(getSnapshot());
  };

  process.stdout.on('resize', onResize);
  return () => {
    process.stdout.off('resize', onResize);
  };
}

async function handleDirectChunk(
  state: DirectSnapshotState,
  runtime: MainRuntime,
  chunk: string
): Promise<void> {
  state.buffer += chunk;

  const lines = state.buffer.split(/\r?\n/);
  state.buffer = lines.pop() ?? '';

  for (const line of lines) {
    const toolPrefix = 'Running tool: ';
    if (line.startsWith(toolPrefix)) {
      await applySnapshotEvent(runtime, {
        type: 'tool.start',
        toolName: line.slice(toolPrefix.length),
        at: new Date().toISOString()
      });
    }
  }
}

async function finishDirectSnapshot(
  state: DirectSnapshotState,
  runtime: MainRuntime,
  success: boolean
): Promise<void> {
  const at = new Date().toISOString();
  const toolName = runtime.snapshot.tool.activeName;
  if (!toolName) {
    if (!success) {
      await applySnapshotEvent(runtime, {
        type: 'phase.update',
        phase: 'error',
        at
      });
    }

    return;
  }

  await applySnapshotEvent(runtime, {
    type: 'tool.finish',
    toolName,
    success,
    at
  });
}

export function normalizeCodexArgs(argv: string[]): string[] {
  if (argv[0] !== '--') {
    return argv;
  }

  return argv.slice(1);
}

export function shouldUseStickyFooter(argv: string[]): boolean {
  if (argv[0] === 'help') {
    return false;
  }

  return !argv.some(
    (arg) => arg === '--help' || arg === '-h' || arg === '--version' || arg === '-V'
  );
}

export function isCliEntrypoint(argv1: string | undefined, moduleUrl: string): boolean {
  if (!argv1) {
    return false;
  }

  try {
    return realpathSync(argv1) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return false;
  }
}

export async function main(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const codexArgs = normalizeCodexArgs(argv);
  const stickyFooter = shouldUseStickyFooter(codexArgs);
  const screen = new Screen();
  const snapshotPath = env.CODEX_HUD_STATE_FILE ?? createDefaultSnapshotPath();
  let server: Server | null = null;
  let socketPath: string | null = null;
  let childEnv = env;
  let directSnapshotState: DirectSnapshotState | null = null;
  const runtime: MainRuntime = {
    snapshotPath,
    screen,
    snapshot: await initializeSnapshot(snapshotPath, env)
  };

  if (stickyFooter) {
    screen.attach();
    screen.render(runtime.snapshot);
  }

  try {
    const hudServer = await startHudServer(snapshotPath, runtime.snapshot, (snapshot) => {
      runtime.snapshot = snapshot;
      runtime.screen.render(snapshot);
    });
    server = hudServer.server;
    socketPath = hudServer.socketPath;

    childEnv = {
      ...env,
      ...hudServer.childEnvPatch
    };
  } catch {
    directSnapshotState = {
      buffer: ''
    };
  }

  const child = await launchCodexWithHud(
    codexArgs,
    childEnv,
    stickyFooter ? screen.getContentViewport() : screen.getViewport()
  );

  // In shared-stdio mode, the child owns stdout directly — we must not write
  // ANSI footer sequences to the same stream or we'll corrupt Codex's TUI.
  const footerActive = stickyFooter && !child.usesSharedStdio;
  if (stickyFooter && child.usesSharedStdio) {
    screen.dispose();
  }

  const releaseInput = child.usesSharedStdio ? () => undefined : attachInput(child);
  const releaseResize = footerActive
    ? attachResize(child, screen, () => runtime.snapshot)
    : () => undefined;
  const renderTimer = footerActive && process.stdout.isTTY
    ? setInterval(() => {
        screen.render(runtime.snapshot);
      }, 250)
    : null;

  // Poll rate limits from Codex app-server (every 60s)
  const releaseRateLimitPoller = footerActive
    ? startRateLimitPoller(60_000, (usage) => {
        runtime.snapshot = { ...runtime.snapshot, usage };
        screen.render(runtime.snapshot);
      })
    : () => undefined;
  let pendingSnapshotProcessing = Promise.resolve();
  const ptyObserver = createPtyObserver();
  const stopSessionWatcher = startSessionWatcher({
    explicitPath: env.CODEX_HUD_SESSION_FILE,
    debug: Boolean(env.CODEX_HUD_DEBUG),
    onEvents: (events) => {
      pendingSnapshotProcessing = pendingSnapshotProcessing.then(async () => {
        for (const event of events) {
          await applySnapshotEvent(runtime, event);
        }
      });
    }
  });

  // Regex that detects a CSI scroll-region reset such as \e[r or \e[1;24r.
  // When the child sends one of these, the reserved footer rows become part
  // of the scrollable area and their content turns into a ghost.  We clear
  // them *before* forwarding the chunk so there's nothing to ghost.
  // eslint-disable-next-line no-control-regex
  const scrollRegionResetRe = /\x1b\[\d*;?\d*r/;

  child.onData((chunk) => {
    if (footerActive && scrollRegionResetRe.test(chunk)) {
      process.stdout.write(screen.getFooterClearSequence());
    }
    process.stdout.write(chunk);

    // Always observe PTY output for phase, context, and tool changes
    if (!child.usesSharedStdio) {
      observePtyChunk(ptyObserver, runtime, chunk);
    }

    if (directSnapshotState) {
      pendingSnapshotProcessing = pendingSnapshotProcessing.then(() =>
        handleDirectChunk(directSnapshotState, runtime, chunk)
      );
    }
    if (footerActive) {
      screen.render(runtime.snapshot);
    }
  });

  let exitStatus: HudExitStatus | null = null;

  try {
    exitStatus = await waitForExit(child);
    await pendingSnapshotProcessing;

    if (directSnapshotState) {
      await finishDirectSnapshot(directSnapshotState, runtime, exitStatus.exitCode === 0);
    } else if (exitStatus.exitCode !== 0) {
      await applySnapshotEvent(runtime, {
        type: 'phase.update',
        phase: 'error',
        at: new Date().toISOString()
      });
    }
  } finally {
    stopSessionWatcher();
    releaseInput();
    releaseResize();
    releaseRateLimitPoller();
    if (renderTimer) {
      clearInterval(renderTimer);
    }

    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    }

    if (socketPath) {
      await rm(socketPath, { force: true });
    }

    if (footerActive) {
      screen.dispose();
    }
  }

  if (exitStatus && exitStatus.exitCode !== 0) {
    process.exitCode = exitStatus.exitCode;
  }
}

if (isCliEntrypoint(process.argv[1], import.meta.url)) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
