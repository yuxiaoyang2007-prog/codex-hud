import { describe, expect, it } from 'vitest';
import { createEmptySnapshot } from './index';

describe('createEmptySnapshot', () => {
  it('creates a stable empty HUD snapshot', () => {
    expect(createEmptySnapshot('session-123')).toEqual({
      session: {
        id: 'session-123',
        model: null,
        reasoningEffort: null,
        startedAt: null,
        lastUpdatedAt: null
      },
      status: {
        phase: 'idle',
        stale: false
      },
      tool: {
        activeName: null,
        startedAt: null,
        elapsedMs: 0
      },
      plan: {
        currentStep: null,
        completedSteps: 0,
        totalSteps: 0
      },
      subagents: {
        active: 0,
        lastEvent: null
      },
      warnings: []
    });
  });

  it('returns a fresh warnings array for each snapshot', () => {
    const first = createEmptySnapshot('session-123');
    const second = createEmptySnapshot('session-456');

    first.warnings.push('warning');

    expect(second.warnings).toEqual([]);
  });
});
