import { describe, expect, it } from 'vitest';
import { formatStatusBarText } from './status-bar';

describe('formatStatusBarText', () => {
  it('shows the most important HUD fields in one line', () => {
    const text = formatStatusBarText({
      session: { id: 'session-123', model: 'gpt-5.4' },
      status: { phase: 'tool-running' },
      tool: { activeName: 'functions.exec_command' },
      plan: { completedSteps: 2, totalSteps: 5 },
      subagents: { active: 1 },
      warnings: []
    } as never);

    expect(text).toContain('gpt-5.4');
    expect(text).toContain('tool-running');
    expect(text).toContain('2/5');
  });
});
