import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { main } from '../../packages/terminal/src/cli';

const temporaryPaths: string[] = [];

function createTemporaryPath(name: string): string {
  const root = join(
    '/tmp',
    `codex-hud-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
  temporaryPaths.push(root);
  return join(root, name, 'snapshot.json');
}

afterEach(async () => {
  await Promise.all(
    temporaryPaths.map(async (path) => {
      await rm(path, { recursive: true, force: true });
    })
  );
});

describe('codex-hud e2e', () => {
  it('writes a snapshot while the wrapped codex process runs', async () => {
    const snapshotPath = createTemporaryPath('running');
    const run = main(['tests/e2e/fake-codex.mjs'], {
      ...process.env,
      CODEX_HUD_COMMAND: process.execPath,
      CODEX_HUD_SESSION_ID: 'session-123',
      CODEX_HUD_STATE_FILE: snapshotPath
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    const snapshotWhileRunning = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
      session: { id: string };
      status: { phase: string };
      tool: { activeName: string | null };
    };

    expect(snapshotWhileRunning.session.id).toBe('session-123');
    expect(snapshotWhileRunning.status.phase).toBe('tool-running');
    expect(snapshotWhileRunning.tool.activeName).toBe('functions.exec_command');

    await run;
  });

  it('records an error snapshot when the wrapped process exits non-zero', async () => {
    const snapshotPath = createTemporaryPath('failing');
    await main(['tests/e2e/fake-codex.mjs'], {
      ...process.env,
      CODEX_HUD_COMMAND: process.execPath,
      CODEX_HUD_SESSION_ID: 'session-456',
      CODEX_HUD_STATE_FILE: snapshotPath,
      FAKE_CODEX_EXIT_CODE: '2'
    });

    const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
      session: { id: string };
      status: { phase: string };
      tool: { activeName: string | null };
    };

    expect(snapshot.session.id).toBe('session-456');
    expect(snapshot.status.phase).toBe('error');
    expect(snapshot.tool.activeName).toBeNull();
  });
});
