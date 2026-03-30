import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createEmptySnapshot, isHudEvent } from './index';

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

  it('uses the dist-only package manifest for builds and packing', async () => {
    const packageJson = JSON.parse(
      await readFile(new URL('../package.json', import.meta.url), 'utf8')
    ) as {
      exports?: { '.': { import?: string; types?: string } };
      files?: string[];
      scripts?: Record<string, string>;
    };

    expect(packageJson.exports).toEqual({
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js'
      }
    });
    expect(packageJson.files).toEqual(['dist']);
    expect(packageJson.scripts?.build).toBe('rm -rf dist && tsc -p tsconfig.json');
    expect(packageJson.scripts?.prepack).toBe('npm run build');
    expect(packageJson.scripts?.test).toBe('vitest run');
  });

  it('rejects normalized-but-invalid iso timestamps in events', () => {
    expect(
      isHudEvent({
        type: 'tool.start',
        toolName: 'functions.exec_command',
        at: '2026-02-30T00:00:00.000Z'
      })
    ).toBe(false);
  });
});
