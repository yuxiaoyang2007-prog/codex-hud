import { describe, expect, it } from 'vitest';
import { createEmptySnapshot } from './schema';

describe('createEmptySnapshot', () => {
  it('creates a stable empty HUD snapshot', () => {
    const snapshot = createEmptySnapshot('session-123');

    expect(snapshot.session.id).toBe('session-123');
    expect(snapshot.status.phase).toBe('idle');
    expect(snapshot.plan.completedSteps).toBe(0);
    expect(snapshot.plan.totalSteps).toBe(0);
    expect(snapshot.subagents.active).toBe(0);
    expect(snapshot.warnings).toEqual([]);
  });
});
