import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildHookEvent,
  emitHookEvent
} from '../../../plugins/codex-hud/scripts/emit-hook-event.mjs';

const EXPLICIT_AT = '2026-03-30T10:00:00.000Z';
const FALLBACK_AT = '2026-03-30T10:00:01.000Z';

function createWritableCapture() {
  let output = '';

  return {
    stream: {
      write(chunk: string | Uint8Array) {
        output += chunk.toString();
        return true;
      }
    },
    read() {
      return output;
    }
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('buildHookEvent', () => {
  it('translates a session-start hook payload into a normalized event', () => {
    expect(
      buildHookEvent('session-start', {
        CODEX_HUD_SESSION_ID: 'session-123',
        CODEX_EVENT_AT: EXPLICIT_AT
      })
    ).toEqual({
      sessionId: 'session-123',
      type: 'session.start',
      at: EXPLICIT_AT
    });
  });

  it('translates a session-stop hook payload into an idle phase update', () => {
    expect(
      buildHookEvent('session-stop', {
        CODEX_HUD_SESSION_ID: 'session-123',
        CODEX_EVENT_AT: EXPLICIT_AT
      })
    ).toEqual({
      sessionId: 'session-123',
      type: 'phase.update',
      phase: 'idle',
      at: EXPLICIT_AT
    });
  });

  it('translates a user prompt submit hook payload into a thinking phase update', () => {
    expect(
      buildHookEvent('user-prompt-submit', {
        CODEX_HUD_SESSION_ID: 'session-123',
        CODEX_EVENT_AT: EXPLICIT_AT
      })
    ).toEqual({
      sessionId: 'session-123',
      type: 'phase.update',
      phase: 'thinking',
      at: EXPLICIT_AT
    });
  });

  it('translates a pre-tool hook payload into a normalized event', () => {
    expect(
      buildHookEvent('pre-tool-use', {
        CODEX_HUD_SESSION_ID: 'session-123',
        CODEX_TOOL_NAME: 'functions.exec_command',
        CODEX_EVENT_AT: EXPLICIT_AT
      })
    ).toEqual({
      sessionId: 'session-123',
      type: 'tool.start',
      toolName: 'functions.exec_command',
      at: EXPLICIT_AT
    });
  });

  it('translates a successful post-tool hook payload into a normalized event', () => {
    expect(
      buildHookEvent('post-tool-use', {
        CODEX_HUD_SESSION_ID: 'session-123',
        CODEX_TOOL_NAME: 'functions.exec_command',
        CODEX_TOOL_EXIT_CODE: '0',
        CODEX_EVENT_AT: EXPLICIT_AT
      })
    ).toEqual({
      sessionId: 'session-123',
      type: 'tool.finish',
      toolName: 'functions.exec_command',
      success: true,
      at: EXPLICIT_AT
    });
  });

  it('translates a failing post-tool hook payload into a normalized event', () => {
    expect(
      buildHookEvent('post-tool-use', {
        CODEX_HUD_SESSION_ID: 'session-123',
        CODEX_TOOL_NAME: 'functions.exec_command',
        CODEX_TOOL_EXIT_CODE: '1',
        CODEX_EVENT_AT: EXPLICIT_AT
      })
    ).toEqual({
      sessionId: 'session-123',
      type: 'tool.finish',
      toolName: 'functions.exec_command',
      success: false,
      at: EXPLICIT_AT
    });
  });

  it('uses the provided fallback timestamp when the hook environment omits one', () => {
    expect(
      buildHookEvent(
        'session-start',
        {
          CODEX_HUD_SESSION_ID: 'session-123'
        },
        FALLBACK_AT
      )
    ).toEqual({
      sessionId: 'session-123',
      type: 'session.start',
      at: FALLBACK_AT
    });
  });
});

describe('emitHookEvent', () => {
  it('writes the normalized line to stdout and forwards the same line to the hud socket', async () => {
    const stdout = createWritableCapture();
    const sendLineToSocket = vi.fn(async () => undefined);

    const line = await emitHookEvent(
      'pre-tool-use',
      {
        CODEX_HUD_SESSION_ID: 'session-123',
        CODEX_HUD_SOCKET_PATH: '/tmp/codex-hud.sock',
        CODEX_TOOL_NAME: 'functions.exec_command',
        CODEX_EVENT_AT: EXPLICIT_AT
      },
      {
        stdout: stdout.stream,
        sendLineToSocket
      }
    );

    expect(line).toBe(
      `${JSON.stringify({
        sessionId: 'session-123',
        type: 'tool.start',
        toolName: 'functions.exec_command',
        at: EXPLICIT_AT
      })}\n`
    );
    expect(stdout.read()).toBe(line);
    expect(sendLineToSocket).toHaveBeenCalledWith('/tmp/codex-hud.sock', line);
  });

  it('treats socket delivery as best-effort when no hud server is listening', async () => {
    const stdout = createWritableCapture();
    const sendLineToSocket = vi.fn(async () => {
      throw new Error('connect ENOENT');
    });

    await expect(
      emitHookEvent(
        'session-stop',
        {
          CODEX_HUD_SESSION_ID: 'session-123',
          CODEX_HUD_SOCKET_PATH: '/tmp/codex-hud-missing.sock',
          CODEX_EVENT_AT: EXPLICIT_AT
        },
        {
          stdout: stdout.stream,
          sendLineToSocket
        }
      )
    ).resolves.toBe(
      `${JSON.stringify({
        sessionId: 'session-123',
        type: 'phase.update',
        phase: 'idle',
        at: EXPLICIT_AT
      })}\n`
    );

    expect(sendLineToSocket).toHaveBeenCalledWith(
      '/tmp/codex-hud-missing.sock',
      `${JSON.stringify({
        sessionId: 'session-123',
        type: 'phase.update',
        phase: 'idle',
        at: EXPLICIT_AT
      })}\n`
    );
    expect(stdout.read()).toBe(
      `${JSON.stringify({
        sessionId: 'session-123',
        type: 'phase.update',
        phase: 'idle',
        at: EXPLICIT_AT
      })}\n`
    );
  });
});
