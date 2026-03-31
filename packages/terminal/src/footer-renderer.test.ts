import { describe, expect, it } from 'vitest';
import { createEmptySnapshot } from '@codex-hud/core';
import { renderFooter } from './footer-renderer';

function stripAnsi(str: string): string {
  return str.replace(/\u001b\[[0-9;]*m/g, '');
}

describe('renderFooter', () => {
  it('renders model badge and product name', () => {
    const snapshot = createEmptySnapshot('session-123');
    snapshot.session.model = 'gpt-5.4';
    snapshot.session.reasoningEffort = 'xhigh';
    snapshot.session.startedAt = new Date().toISOString();

    const footer = stripAnsi(renderFooter(snapshot, { columns: 120 }));

    expect(footer).toContain('[gpt-5.4 xhigh]');
    expect(footer).toContain('Codex');
  });

  it('shows active tool with spinner and completed tool counts', () => {
    const snapshot = createEmptySnapshot('s1');
    snapshot.session.model = 'gpt-5.4';
    snapshot.session.startedAt = new Date().toISOString();
    snapshot.status.phase = 'tool-running';
    snapshot.tool.activeName = 'functions.exec_command';
    snapshot.tool.counts = {
      'functions.file_search': 3,
      'functions.read_file': 2
    };

    const footer = stripAnsi(renderFooter(snapshot, { columns: 120 }));

    expect(footer).toContain('exec_command');
    expect(footer).toContain('file_search');
    expect(footer).toContain('×3');
    expect(footer).toContain('read_file');
    expect(footer).toContain('×2');
  });

  it('shows plan progress when available', () => {
    const snapshot = createEmptySnapshot('s1');
    snapshot.session.model = 'gpt-5.4';
    snapshot.session.startedAt = new Date().toISOString();
    snapshot.plan.completedSteps = 2;
    snapshot.plan.totalSteps = 5;

    const footer = stripAnsi(renderFooter(snapshot, { columns: 120 }));

    expect(footer).toContain('plan:2/5');
  });

  it('shows usage bars when rate limit data is available', () => {
    const snapshot = createEmptySnapshot('s1');
    snapshot.session.model = 'gpt-5.4';
    snapshot.session.startedAt = new Date().toISOString();
    snapshot.usage.fiveHour = { usedPercent: 1, resetsAt: null };
    snapshot.usage.weekly = { usedPercent: 25, resetsAt: null };

    const footer = stripAnsi(renderFooter(snapshot, { columns: 120 }));

    expect(footer).toContain('5h');
    expect(footer).toContain('99%');
    expect(footer).toContain('1w');
    expect(footer).toContain('75%');
  });

  it('shows context bar when percentLeft is set', () => {
    const snapshot = createEmptySnapshot('s1');
    snapshot.session.model = 'gpt-5.4';
    snapshot.session.startedAt = new Date().toISOString();
    snapshot.context.percentLeft = 89;

    const footer = stripAnsi(renderFooter(snapshot, { columns: 120 }));

    expect(footer).toContain('Context');
    expect(footer).toContain('89%');
  });

  it('shows phase indicator', () => {
    const snapshot = createEmptySnapshot('s1');
    snapshot.session.model = 'gpt-5.4';
    snapshot.status.phase = 'thinking';

    const footer = stripAnsi(renderFooter(snapshot, { columns: 120 }));

    expect(footer).toContain('thinking');
  });
});
