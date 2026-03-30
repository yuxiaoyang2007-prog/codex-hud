import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import pty from 'node-pty';

export interface HudChildProcess {
  onData(listener: (chunk: string) => void): void;
  onExit(listener: (status: HudExitStatus) => void): void;
}

export interface HudExitStatus {
  exitCode: number;
  signal: number | NodeJS.Signals | null;
  error?: Error;
}

function resolveOverrideCommand(command: string, env: NodeJS.ProcessEnv): string {
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

function launchWithoutPty(command: string, args: string[], env: NodeJS.ProcessEnv): HudChildProcess {
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env,
    stdio: ['inherit', 'pipe', 'pipe']
  });

  return {
    onData(listener) {
      child.stdout?.on('data', (chunk) => {
        listener(chunk.toString('utf8'));
      });
      child.stderr?.on('data', (chunk) => {
        listener(chunk.toString('utf8'));
      });
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
    }
  };
}

export function launchCodexWithHud(args: string[], env: NodeJS.ProcessEnv): HudChildProcess {
  const command = env.CODEX_HUD_COMMAND
    ? resolveOverrideCommand(env.CODEX_HUD_COMMAND, env)
    : 'codex';

  try {
    const child = pty.spawn(command, args, {
      name: 'xterm-color',
      cols: process.stdout.columns || 120,
      rows: process.stdout.rows || 40,
      cwd: process.cwd(),
      env
    });

    return {
      onData(listener) {
        child.onData(listener);
      },
      onExit(listener) {
        child.onExit(({ exitCode, signal }) => {
          listener({
            exitCode,
            signal: signal ?? null
          });
        });
      }
    };
  } catch {
    return launchWithoutPty(command, args, env);
  }
}
