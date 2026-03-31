import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { watchSnapshot } from './state-watcher';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.map(async (directory) => {
      await rm(directory, { recursive: true, force: true });
    })
  );
  temporaryDirectories.length = 0;
});

describe('watchSnapshot', () => {
  it('notifies when the snapshot file changes', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-hud-vscode-'));
    temporaryDirectories.push(directory);
    const snapshotPath = join(directory, 'snapshot.json');
    await writeFile(
      snapshotPath,
      JSON.stringify({
        session: { model: 'gpt-5.4' },
        status: { phase: 'idle' },
        tool: { activeName: null },
        plan: { completedSteps: 0, totalSteps: 0 }
      }),
      'utf8'
    );

    const update = new Promise<{ status: { phase: string } }>((resolve) => {
      const watcher = watchSnapshot(snapshotPath, (snapshot) => {
        watcher.dispose();
        resolve(snapshot as { status: { phase: string } });
      });
    });

    await writeFile(
      snapshotPath,
      JSON.stringify({
        session: { model: 'gpt-5.4' },
        status: { phase: 'tool-running' },
        tool: { activeName: 'functions.exec_command' },
        plan: { completedSteps: 1, totalSteps: 2 }
      }),
      'utf8'
    );

    await expect(update).resolves.toMatchObject({
      status: { phase: 'tool-running' }
    });
  });
});
