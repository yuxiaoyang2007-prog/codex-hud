import { describe, expect, it, vi } from 'vitest';
import { launchCodexWithHud } from './pty-launcher';

const mockedSpawn = vi.hoisted(() => vi.fn());

vi.mock('node-pty', () => ({
  default: {
    spawn: mockedSpawn
  }
}));

describe('launchCodexWithHud', () => {
  it('spawns codex in a PTY with terminal defaults', () => {
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
});
