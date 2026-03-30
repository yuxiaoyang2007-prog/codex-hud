import { describe, expect, it } from 'vitest';
import { applyHudEvent } from './reducer';
import { createEmptySnapshot } from './schema';

describe('applyHudEvent', () => {
  it('tracks tool lifecycle events', () => {
    const initial = createEmptySnapshot('session-123');
    const running = applyHudEvent(initial, {
      type: 'tool.start',
      toolName: 'functions.exec_command',
      at: '2026-03-30T10:00:00.000Z'
    });

    expect(running.status.phase).toBe('tool-running');
    expect(running.tool.activeName).toBe('functions.exec_command');

    const finished = applyHudEvent(running, {
      type: 'tool.finish',
      toolName: 'functions.exec_command',
      success: true,
      at: '2026-03-30T10:00:02.000Z'
    });

    expect(finished.status.phase).toBe('idle');
    expect(finished.tool.activeName).toBeNull();
    expect(finished.tool.elapsedMs).toBe(2000);
  });

  it('ignores unknown runtime events safely', () => {
    const initial = createEmptySnapshot('session-123');

    expect(
      applyHudEvent(initial, {
        type: 'tool.explode',
        at: '2026-03-30T10:00:00.000Z'
      })
    ).toEqual(initial);
  });
});
