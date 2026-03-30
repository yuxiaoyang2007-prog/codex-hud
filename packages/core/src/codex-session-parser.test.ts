import { describe, expect, it } from 'vitest';
import { parseCodexSessionLines } from './codex-session-parser';

describe('parseCodexSessionLines', () => {
  it('derives plan progress and subagent activity from session JSONL', () => {
    const events = parseCodexSessionLines([
      '{"payload":{"type":"function_call","name":"update_plan","arguments":{"plan":[{"step":"Explore project context","status":"completed"},{"step":"Present recommended design","status":"in_progress"}]}}}',
      '{"payload":{"type":"function_call","name":"spawn_agent","arguments":{"agent_type":"worker"}}}'
    ]);

    expect(events).toContainEqual({
      type: 'plan.update',
      at: expect.any(String),
      currentStep: 'Present recommended design',
      completedSteps: 1,
      totalSteps: 2
    });
    expect(events).toContainEqual({
      type: 'subagent.update',
      at: expect.any(String),
      active: 1,
      lastEvent: 'spawn_agent'
    });
  });
});
