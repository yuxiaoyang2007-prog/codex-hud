import { describe, expect, it } from 'vitest';
import { formatStatusBarText } from './status-bar';

describe('formatStatusBarText', () => {
  it('shows the most important HUD fields in one line', () => {
    const text = formatStatusBarText({
      session: { id: 'session-123', model: 'gpt-5.4' },
      context: { percentLeft: 56 },
      status: { phase: 'tool-running' },
      tool: { activeName: 'functions.exec_command' },
      plan: { completedSteps: 2, totalSteps: 5 },
      subagents: { active: 1 },
      warnings: []
    } as never);

    expect(text).toContain('gpt-5.4');
    expect(text).toContain('ctx:56%');
    expect(text).toContain('tool-running');
    expect(text).toContain('2/5');
  });

  it('marks unknown context explicitly', () => {
    const text = formatStatusBarText({
      session: { model: 'gpt-5.4' },
      context: { percentLeft: null },
      status: { phase: 'idle' },
      tool: { activeName: null },
      plan: { completedSteps: 0, totalSteps: 0 }
    });

    expect(text).toContain('ctx:n/a');
  });
});
