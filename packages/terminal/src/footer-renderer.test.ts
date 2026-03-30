import { describe, expect, it } from 'vitest';
import { createEmptySnapshot } from '@codex-hud/core';
import { renderFooter } from './footer-renderer';

describe('renderFooter', () => {
  it('renders the compact two-line HUD', () => {
    const snapshot = createEmptySnapshot('session-123');
    snapshot.session.model = 'gpt-5.4';
    snapshot.status.phase = 'tool-running';
    snapshot.tool.activeName = 'functions.exec_command';
    snapshot.plan.currentStep = 'Explore project context';
    snapshot.plan.completedSteps = 2;
    snapshot.plan.totalSteps = 5;

    const footer = renderFooter(snapshot, { columns: 120 });

    expect(footer).toContain('gpt-5.4');
    expect(footer).toContain('functions.exec_command');
    expect(footer).toContain('2/5');
  });
});
