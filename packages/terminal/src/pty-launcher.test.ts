import { describe, expect, it, vi } from 'vitest';
import { launchCodexWithHud } from './pty-launcher';

const mockedSpawn = vi.hoisted(() => vi.fn());
const mockedAccessSync = vi.hoisted(() => vi.fn());
const mockedChildSpawn = vi.hoisted(() => vi.fn());

vi.mock('node-pty', () => ({
  default: {
    spawn: mockedSpawn
  }
}));

vi.mock('node:child_process', () => ({
  spawn: mockedChildSpawn
}));

vi.mock('node:fs', () => ({
  accessSync: mockedAccessSync,
  constants: {
    X_OK: 1
  }
}));

describe('launchCodexWithHud', () => {
  it('spawns codex in a PTY with terminal defaults', () => {
    mockedSpawn.mockReset();
    mockedAccessSync.mockReset();
    mockedChildSpawn.mockReset();

    const env = {
      ...process.env,
      CODEX_HUD_SOCKET_PATH: '/tmp/codex-hud.sock'
    };

    launchCodexWithHud(['--help'], env);

    expect(mockedSpawn).toHaveBeenCalledWith('codex', ['--help'], {
      name: 'xterm-color',
      cols: process.stdout.columns || 120,
      rows: process.stdout.rows || 40,
      cwd: process.cwd(),
      env
    });
  });

  it('resolves override commands from PATH before spawning', () => {
    mockedSpawn.mockReset();
    mockedAccessSync.mockReset();
    mockedChildSpawn.mockReset();
    mockedAccessSync.mockImplementation((candidate: string) => {
      if (candidate !== '/custom/bin/node') {
        throw new Error('not executable');
      }
    });

    const env = {
      ...process.env,
      PATH: '/custom/bin:/fallback/bin',
      CODEX_HUD_COMMAND: 'node'
    };

    launchCodexWithHud(['tests/e2e/fake-codex.mjs'], env);

    expect(mockedSpawn).toHaveBeenCalledWith('/custom/bin/node', ['tests/e2e/fake-codex.mjs'], {
      name: 'xterm-color',
      cols: process.stdout.columns || 120,
      rows: process.stdout.rows || 40,
      cwd: process.cwd(),
      env
    });
  });

  it('falls back to child_process when PTY spawn is unavailable', () => {
    mockedSpawn.mockReset();
    mockedAccessSync.mockReset();
    mockedChildSpawn.mockReset();
    mockedSpawn.mockImplementation(() => {
      throw new Error('posix_spawnp failed.');
    });

    const stdoutOn = vi.fn();
    const stderrOn = vi.fn();
    const once = vi.fn();
    mockedChildSpawn.mockReturnValue({
      stdout: { on: stdoutOn },
      stderr: { on: stderrOn },
      once
    });

    const env = {
      ...process.env,
      CODEX_HUD_COMMAND: '/custom/bin/node'
    };

    const child = launchCodexWithHud(['tests/e2e/fake-codex.mjs'], env);
    child.onData(() => undefined);
    child.onExit(() => undefined);

    expect(mockedChildSpawn).toHaveBeenCalledWith('/custom/bin/node', ['tests/e2e/fake-codex.mjs'], {
      cwd: process.cwd(),
      env,
      stdio: ['inherit', 'pipe', 'pipe']
    });
    expect(stdoutOn).toHaveBeenCalledWith('data', expect.any(Function));
    expect(stderrOn).toHaveBeenCalledWith('data', expect.any(Function));
    expect(once).toHaveBeenCalledWith('exit', expect.any(Function));
    expect(once).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
