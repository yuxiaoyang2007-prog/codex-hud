import { describe, expect, it, vi } from 'vitest';
import { launchCodexWithHud } from './pty-launcher';

const mockedSpawn = vi.hoisted(() => vi.fn());
const mockedAccessSync = vi.hoisted(() => vi.fn());
const mockedChmodSync = vi.hoisted(() => vi.fn());
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
  chmodSync: mockedChmodSync,
  constants: {
    X_OK: 1,
    R_OK: 4
  }
}));

describe('launchCodexWithHud', () => {
  it('spawns codex in a PTY with terminal defaults', async () => {
    mockedSpawn.mockReset();
    mockedAccessSync.mockReset();
    mockedChildSpawn.mockReset();

    const env = {
      ...process.env,
      PATH: '',
      CODEX_HUD_SOCKET_PATH: '/tmp/codex-hud.sock'
    };

    await launchCodexWithHud(['--help'], env);

    expect(mockedSpawn).toHaveBeenCalledWith('codex', ['--help'], {
      name: 'xterm-color',
      cols: process.stdout.columns || 120,
      rows: process.stdout.rows || 40,
      cwd: process.cwd(),
      env
    });
  });

  it('resolves the default codex command from PATH before spawning', async () => {
    mockedSpawn.mockReset();
    mockedAccessSync.mockReset();
    mockedChildSpawn.mockReset();
    mockedAccessSync.mockImplementation((candidate: string) => {
      if (candidate !== '/custom/bin/codex') {
        throw new Error('not executable');
      }
    });

    const env = {
      ...process.env,
      PATH: '/custom/bin:/fallback/bin'
    };

    await launchCodexWithHud(['--help'], env);

    expect(mockedSpawn).toHaveBeenCalledWith('/custom/bin/codex', ['--help'], {
      name: 'xterm-color',
      cols: process.stdout.columns || 120,
      rows: process.stdout.rows || 40,
      cwd: process.cwd(),
      env
    });
  });

  it('uses the provided viewport for PTY sessions and proxies input methods', async () => {
    mockedSpawn.mockReset();
    mockedAccessSync.mockReset();
    mockedChildSpawn.mockReset();
    const onData = vi.fn();
    const onExit = vi.fn();
    const write = vi.fn();
    const resize = vi.fn();
    mockedSpawn.mockReturnValue({
      pid: 12345,
      onData,
      onExit,
      write,
      resize
    });

    const env = {
      ...process.env,
      PATH: ''
    };

    const child = await launchCodexWithHud(['--help'], env, {
      columns: 90,
      rows: 30
    });
    expect(child.usesSharedStdio).toBe(false);
    child.write('hello');
    child.resize({ columns: 91, rows: 31 });

    expect(mockedSpawn).toHaveBeenCalledWith('codex', ['--help'], {
      name: 'xterm-color',
      cols: 90,
      rows: 30,
      cwd: process.cwd(),
      env
    });
    expect(write).toHaveBeenCalledWith('hello');
    expect(resize).toHaveBeenCalledWith(91, 31);
  });

  it('resolves override commands from PATH before spawning', async () => {
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

    await launchCodexWithHud(['tests/e2e/fake-codex.mjs'], env);

    expect(mockedSpawn).toHaveBeenCalledWith('/custom/bin/node', ['tests/e2e/fake-codex.mjs'], {
      name: 'xterm-color',
      cols: process.stdout.columns || 120,
      rows: process.stdout.rows || 40,
      cwd: process.cwd(),
      env
    });
  });

  it('falls back to child_process when PTY spawn is unavailable', async () => {
    mockedSpawn.mockReset();
    mockedAccessSync.mockReset();
    mockedChildSpawn.mockReset();
    mockedSpawn.mockImplementation(() => {
      throw new Error('posix_spawnp failed.');
    });

    const once = vi.fn();
    mockedChildSpawn.mockReturnValue({
      once
    });

    const env = {
      ...process.env,
      PATH: '',
      CODEX_HUD_COMMAND: '/custom/bin/node'
    };

    const child = await launchCodexWithHud(['tests/e2e/fake-codex.mjs'], env);
    expect(child.usesSharedStdio).toBe(true);
    child.onData(() => undefined);
    child.onExit(() => undefined);

    expect(mockedChildSpawn).toHaveBeenCalledWith('/custom/bin/node', ['tests/e2e/fake-codex.mjs'], {
      cwd: process.cwd(),
      env,
      stdio: 'inherit'
    });
    expect(once).toHaveBeenCalledWith('exit', expect.any(Function));
    expect(once).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('skips PTY when CODEX_HUD_NO_PTY is set', async () => {
    mockedSpawn.mockReset();
    mockedAccessSync.mockReset();
    mockedChildSpawn.mockReset();

    const once = vi.fn();
    mockedChildSpawn.mockReturnValue({
      once
    });

    const env = {
      ...process.env,
      PATH: '',
      CODEX_HUD_NO_PTY: '1',
      CODEX_HUD_COMMAND: '/usr/bin/echo'
    };

    const child = await launchCodexWithHud(['hello'], env);
    expect(child.usesSharedStdio).toBe(true);
    expect(mockedSpawn).not.toHaveBeenCalled();
    expect(mockedChildSpawn).toHaveBeenCalledWith('/usr/bin/echo', ['hello'], {
      cwd: process.cwd(),
      env,
      stdio: 'inherit'
    });
  });
});
