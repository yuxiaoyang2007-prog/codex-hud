import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCodexSessionLines } from './codex-session-parser';

describe('parseCodexSessionLines', () => {
  it('derives plan progress and subagent activity from session JSONL', async () => {
    const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
    const fixtureText = await readFile(
      join(fixtureDirectory, '../../../tests/fixtures/session-with-plan-and-agents.jsonl'),
      'utf8'
    );
    const events = parseCodexSessionLines(fixtureText.trim().split('\n'));

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

  it('ignores malformed lines and does not let close_agent drive the count below zero', () => {
    const events = parseCodexSessionLines([
      'not-json',
      '{"payload":{"type":"function_call","name":"close_agent","arguments":{}}}',
      '{"payload":{"type":"function_call","name":"spawn_agent","arguments":{"agent_type":"worker"}}}',
      '{"payload":{"type":"function_call","name":"close_agent","arguments":{}}}'
    ]);

    expect(events).toEqual([
      {
        type: 'subagent.update',
        at: expect.any(String),
        active: 1,
        lastEvent: 'spawn_agent'
      },
      {
        type: 'subagent.update',
        at: expect.any(String),
        active: 0,
        lastEvent: 'close_agent'
      }
    ]);
  });
});
