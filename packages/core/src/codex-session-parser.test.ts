import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CodexSessionParser, parseCodexSessionLines } from './codex-session-parser';

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

  it('parses codex 0.120 task, token, and tool events from session JSONL', async () => {
    const fixtureDirectory = dirname(fileURLToPath(import.meta.url));
    const fixtureText = await readFile(
      join(fixtureDirectory, '../../../tests/fixtures/session-codex-0120.jsonl'),
      'utf8'
    );
    const events = parseCodexSessionLines(fixtureText.trim().split('\n'));

    expect(events).toContainEqual({
      type: 'phase.update',
      at: '2026-04-15T10:59:04.755Z',
      phase: 'thinking'
    });
    expect(events).toContainEqual({
      type: 'context.update',
      at: '2026-04-15T10:59:10.401Z',
      percentLeft: 85
    });
    expect(events).toContainEqual({
      type: 'tool.start',
      at: '2026-04-15T10:59:10.290Z',
      toolName: 'Ran'
    });
    expect(events).toContainEqual({
      type: 'tool.finish',
      at: '2026-04-15T10:59:10.401Z',
      toolName: 'Ran',
      success: true
    });
    expect(events).toContainEqual({
      type: 'phase.update',
      at: '2026-04-15T10:59:11.994Z',
      phase: 'idle'
    });
  });

  it('uses the latest context-window usage instead of cumulative session tokens', () => {
    const events = parseCodexSessionLines([
      '{"timestamp":"2026-04-25T01:09:54.065Z","type":"event_msg","payload":{"type":"task_started","model_context_window":258400}}',
      '{"timestamp":"2026-04-25T01:10:52.736Z","type":"event_msg","payload":{"type":"token_count","info":{"total_token_usage":{"input_tokens":2196098,"cached_input_tokens":1938176,"output_tokens":8031,"reasoning_output_tokens":2193,"total_tokens":2204129},"last_token_usage":{"input_tokens":112185,"cached_input_tokens":112000,"output_tokens":37,"reasoning_output_tokens":0,"total_tokens":112222},"model_context_window":258400}}}'
    ]);

    expect(events).toContainEqual({
      type: 'context.update',
      at: '2026-04-25T01:10:52.736Z',
      percentLeft: 57
    });
  });

  it('drops unmatched function_call_output events without throwing', () => {
    const parser = new CodexSessionParser();

    expect(() =>
      parser.ingest(
        '{"timestamp":"2026-04-15T10:59:10.401Z","type":"response_item","payload":{"type":"function_call_output","call_id":"missing","output":"Command finished"}}'
      )
    ).not.toThrow();
    expect(
      parser.ingest(
        '{"timestamp":"2026-04-15T10:59:10.401Z","type":"response_item","payload":{"type":"function_call_output","call_id":"missing","output":"Command finished"}}'
      )
    ).toEqual([]);
  });
});
