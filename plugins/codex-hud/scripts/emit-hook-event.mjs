const SESSION_START_KIND = 'session-start';
const SESSION_STOP_KIND = 'session-stop';
const USER_PROMPT_SUBMIT_KIND = 'user-prompt-submit';
const PRE_TOOL_USE_KIND = 'pre-tool-use';
const POST_TOOL_USE_KIND = 'post-tool-use';

/**
 * @param {string} kind
 * @param {NodeJS.ProcessEnv} env
 */
export function buildHookEvent(kind, env) {
  const at = env.CODEX_EVENT_AT ?? new Date().toISOString();
  const sessionId = env.CODEX_HUD_SESSION_ID;

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

  return {
    sessionId,
    type: kind === SESSION_START_KIND ? 'session.start' : 'phase.update',
    phase: kind === USER_PROMPT_SUBMIT_KIND ? 'thinking' : 'idle',
    at
  };
}

const kind = process.argv[2];

if (
  kind === SESSION_START_KIND ||
  kind === SESSION_STOP_KIND ||
  kind === USER_PROMPT_SUBMIT_KIND ||
  kind === PRE_TOOL_USE_KIND ||
  kind === POST_TOOL_USE_KIND
) {
  process.stdout.write(`${JSON.stringify(buildHookEvent(kind, process.env))}\n`);
}
