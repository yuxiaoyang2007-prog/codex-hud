import { spawn } from 'node:child_process';
import { accessSync, chmodSync, constants } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';
import type { TerminalViewport } from './screen.js';

export interface HudChildProcess {
  readonly usesSharedStdio: boolean;
  onData(listener: (chunk: string) => void): void;
  onExit(listener: (status: HudExitStatus) => void): void;
  write(chunk: string): void;
  resize(viewport: TerminalViewport): void;
}

export interface HudExitStatus {
  exitCode: number;
  signal: number | NodeJS.Signals | null;
  error?: Error;
}

const debug = Boolean(process.env.CODEX_HUD_DEBUG);

function log(message: string): void {
  if (debug) {
    process.stderr.write(`[codex-hud] ${message}\n`);
  }
}

function resolveCommand(command: string, env: NodeJS.ProcessEnv): string {
  if (command.includes('/')) {
    return command;
  }

  const pathValue = env.PATH ?? process.env.PATH ?? '';
  for (const directory of pathValue.split(delimiter)) {
    if (!directory) {
      continue;
    }

    const candidate = join(directory, command);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return command;
}

function createDefaultViewport(): TerminalViewport {
  return {
    columns: process.stdout.columns || 120,
    rows: process.stdout.rows || 40
  };
}

function ensureSpawnHelperExecutable(ptyModulePath: string): void {
  try {
    const ptyDir = dirname(ptyModulePath);
    const candidates = [
      join(ptyDir, '..', 'prebuilds', `${process.platform}-${process.arch}`, 'spawn-helper'),
      join(ptyDir, '..', 'build', 'Release', 'spawn-helper')
    ];

    for (const helper of candidates) {
      try {
        accessSync(helper, constants.R_OK);
        try {
          accessSync(helper, constants.X_OK);
        } catch {
          log(`fixing execute permission on ${helper}`);
          chmodSync(helper, 0o755);
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Best-effort; if we can't fix it, the PTY spawn will fail and we fall back
  }
}

interface PtySpawnFunction {
  (command: string, args: string[], options: {
    name: string;
    cols: number;
    rows: number;
    cwd: string;
    env: NodeJS.ProcessEnv;
  }): {
    pid: number;
    onData(listener: (data: string) => void): void;
    onExit(listener: (e: { exitCode: number; signal?: number | null }) => void): void;
    write(data: string): void;
    resize(cols: number, rows: number): void;
  };
}

async function loadNodePty(): Promise<PtySpawnFunction | null> {
  try {
    const mod = await import('node-pty');
    const pty = mod.default ?? mod;
    // Ensure spawn-helper has execute permission (common macOS npm issue)
    try {
      const resolved = import.meta.resolve('node-pty');
      const modulePath = resolved.startsWith('file://') ? resolved.slice(7) : resolved;
      ensureSpawnHelperExecutable(modulePath);
    } catch {
      // import.meta.resolve may not be available in all runtimes
    }
    return pty.spawn.bind(pty) as PtySpawnFunction;
  } catch (error) {
    log(`node-pty unavailable: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

// Pre-load node-pty at module init time (async, but cached for later use)
let ptySpawn: PtySpawnFunction | null | undefined;
const ptyReady = loadNodePty().then((fn) => {
  ptySpawn = fn;
});

function launchWithoutPty(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  _viewport: TerminalViewport
): HudChildProcess {
  log(`shared-stdio fallback: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: 'inherit'
  });

  return {
    usesSharedStdio: true,
    onData(_listener) {
      return;
    },
    onExit(listener) {
      let finished = false;
      const finish = (status: HudExitStatus) => {
        if (finished) {
          return;
        }

        finished = true;
        listener(status);
      };

      child.once('exit', (exitCode, signal) => {
        finish({
          exitCode: exitCode ?? 1,
          signal: signal ?? null
        });
      });
      child.once('error', (error) => {
        finish({
          exitCode: 1,
          signal: null,
          error
        });
      });
    },
    write(_chunk) {
      return;
    },
    resize() {
      return;
    }
  };
}

export async function launchCodexWithHud(
  args: string[],
  env: NodeJS.ProcessEnv,
  viewport: TerminalViewport = createDefaultViewport()
): Promise<HudChildProcess> {
  const command = resolveCommand(env.CODEX_HUD_COMMAND ?? 'codex', env);
  log(`resolved command: ${command}`);
  log(`stdin.isTTY=${process.stdin.isTTY}, stdout.isTTY=${process.stdout.isTTY}`);

  const forceFallback = Boolean(env.CODEX_HUD_NO_PTY);
  if (forceFallback) {
    log('CODEX_HUD_NO_PTY is set, skipping PTY');
    return launchWithoutPty(command, args, env, viewport);
  }

  await ptyReady;

  if (!ptySpawn) {
    log('node-pty failed to load, using shared-stdio');
    return launchWithoutPty(command, args, env, viewport);
  }

  try {
    const child = ptySpawn(command, args, {
      name: 'xterm-color',
      cols: viewport.columns,
      rows: viewport.rows,
      cwd: process.cwd(),
      env
    });

    log(`PTY spawn OK, pid=${child.pid}`);

    return {
      usesSharedStdio: false,
      onData(listener) {
        child.onData(listener);
      },
      onExit(listener) {
        child.onExit((e) => {
          listener({
            exitCode: e.exitCode,
            signal: e.signal ?? null
          });
        });
      },
      write(chunk) {
        child.write(chunk);
      },
      resize(nextViewport) {
        child.resize(nextViewport.columns, nextViewport.rows);
      }
    };
  } catch (error) {
    log(`PTY spawn failed: ${error instanceof Error ? error.message : String(error)}`);
    return launchWithoutPty(command, args, env, viewport);
  }
}
