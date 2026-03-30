import { describe, expect, it } from 'vitest';
import { buildHookEvent } from '../../../plugins/codex-hud/scripts/emit-hook-event.mjs';

describe('buildHookEvent', () => {
  it('translates a pre-tool hook payload into a normalized event', () => {
    const event = buildHookEvent('pre-tool-use', {
      CODEX_HUD_SESSION_ID: 'session-123',
      CODEX_TOOL_NAME: 'functions.exec_command',
      CODEX_EVENT_AT: '2026-03-30T10:00:00.000Z'
    });

    expect(event).toEqual({
      sessionId: 'session-123',
      type: 'tool.start',
      toolName: 'functions.exec_command',
      at: '2026-03-30T10:00:00.000Z'
    });
  });
});
