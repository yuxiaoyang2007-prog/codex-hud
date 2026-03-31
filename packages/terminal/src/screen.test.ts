import { describe, expect, it, vi } from 'vitest';
import { createEmptySnapshot } from '@codex-hud/core';
import { Screen } from './screen';

describe('Screen', () => {
  it('reserves two footer rows in TTY terminals', () => {
    const write = vi.fn();
    const screen = new Screen({
      columns: 120,
      rows: 24,
      isTTY: true,
      write
    });

    screen.attach();

    expect(write).toHaveBeenCalledWith('\u001b[1;22r\u001b[22;1H');
  });

  it('renders the footer into the reserved bottom rows and re-asserts scroll region', () => {
    const write = vi.fn();
    const screen = new Screen({
      columns: 120,
      rows: 24,
      isTTY: true,
      write
    });
    const snapshot = createEmptySnapshot('session-123');
    snapshot.session.model = 'gpt-5.4';
    snapshot.status.phase = 'tool-running';
    snapshot.tool.activeName = 'functions.exec_command';

    screen.render(snapshot);

    // Footer renders with save cursor, scroll region, position to footer rows, clear lines, restore cursor
    expect(write).toHaveBeenCalledWith(expect.stringContaining('\u001b7'));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('\u001b[1;22r'));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('\u001b[23;1H'));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('gpt-5.4'));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('Codex'));
    expect(write).toHaveBeenCalledWith(expect.stringContaining('\u001b8'));
  });

  it('restores the terminal scroll region and clears the footer on dispose', () => {
    const write = vi.fn();
    const screen = new Screen({
      columns: 120,
      rows: 24,
      isTTY: true,
      write
    });

    screen.dispose();

    expect(write).toHaveBeenCalledWith('\u001b7\u001b[r\u001b[23;1H\u001b[2K\u001b[24;1H\u001b[2K\u001b8');
  });
});
