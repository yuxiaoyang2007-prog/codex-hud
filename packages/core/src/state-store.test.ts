import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { createEmptySnapshot } from './schema';
import { writeSnapshot } from './state-store';

describe('writeSnapshot', () => {
  it('creates parent directories and writes formatted json', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-hud-core-'));
    const snapshotPath = join(directory, 'state', 'snapshot.json');
    const snapshot = createEmptySnapshot('session-123');

    await writeSnapshot(snapshotPath, snapshot);

    expect(await readFile(snapshotPath, 'utf8')).toBe(`${JSON.stringify(snapshot, null, 2)}\n`);
  });
});
