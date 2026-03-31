import net from 'node:net';

const SESSION_START_KIND = 'session-start';
const SESSION_STOP_KIND = 'session-stop';
const USER_PROMPT_SUBMIT_KIND = 'user-prompt-submit';
const PRE_TOOL_USE_KIND = 'pre-tool-use';
const POST_TOOL_USE_KIND = 'post-tool-use';

const KNOWN_HOOK_KINDS = new Set([
  SESSION_START_KIND,
  SESSION_STOP_KIND,
  USER_PROMPT_SUBMIT_KIND,
  PRE_TOOL_USE_KIND,
  POST_TOOL_USE_KIND
]);

/**
 * @param {string} kind
 * @param {NodeJS.ProcessEnv} env
 * @param {string} [fallbackAt]
 */
export function buildHookEvent(kind, env, fallbackAt = new Date().toISOString()) {
  const at = env.CODEX_EVENT_AT ?? fallbackAt;
  const sessionId = env.CODEX_HUD_SESSION_ID;

  if (kind === SESSION_START_KIND) {
    return {
      sessionId,
      type: 'session.start',
      at
    };
  }

  if (kind === PRE_TOOL_USE_KIND) {
    return {
      sessionId,
      type: 'tool.start',
      toolName: env.CODEX_TOOL_NAME,
      at
    };
  }

  if (kind === POST_TOOL_USE_KIND) {
    return {
      sessionId,
      type: 'tool.finish',
      toolName: env.CODEX_TOOL_NAME,
      success: env.CODEX_TOOL_EXIT_CODE === '0',
      at
    };
  }

  if (kind === SESSION_STOP_KIND || kind === USER_PROMPT_SUBMIT_KIND) {
    return {
      sessionId,
      type: 'phase.update',
      phase: kind === USER_PROMPT_SUBMIT_KIND ? 'thinking' : 'idle',
      at
    };
  }

  return null;
}

/**
 * @param {string} socketPath
 * @param {string} line
 */
export function sendLineToSocket(socketPath, line) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ path: socketPath });
    let settled = false;

    const settle = (callback, value) => {
      if (settled) {
        return;
      }

      settled = true;
      callback(value);
    };

    socket.once('error', (error) => {
      settle(reject, error);
    });

    socket.setTimeout(250, () => {
      socket.destroy();
      settle(resolve);
    });

    socket.once('connect', () => {
      socket.end(line, 'utf8', () => {
        settle(resolve);
      });
    });
  });
}

/**
 * @param {string} kind
 * @param {NodeJS.ProcessEnv} env
 * @param {{
 *   now?: () => string;
 *   stdout?: { write: (chunk: string) => unknown };
 *   stderr?: { write: (chunk: string) => unknown };
 *   sendLineToSocket?: (socketPath: string, line: string) => Promise<unknown>;
 * }} [options]
 */
export async function emitHookEvent(kind, env, options = {}) {
  const event = buildHookEvent(kind, env, options.now?.());

  if (event == null) {
    options.stderr?.write?.(`[codex-hud] Unknown hook kind: ${kind}\n`);
    return null;
  }

  const line = `${JSON.stringify(event)}\n`;
  (options.stdout ?? process.stdout).write(line);

  const socketPath = env.CODEX_HUD_SOCKET_PATH;
  if (socketPath) {
    try {
      await (options.sendLineToSocket ?? sendLineToSocket)(socketPath, line);
    } catch {
      // Hooks should remain non-blocking when the local HUD is unavailable.
    }
  }

  return line;
}

const kind = process.argv[2];

if (typeof kind === 'string') {
  if (!KNOWN_HOOK_KINDS.has(kind)) {
    process.stderr.write(`[codex-hud] Unknown hook kind: ${kind}\n`);
    process.exitCode = 0;
  } else {
    await emitHookEvent(kind, process.env);
  }
}
