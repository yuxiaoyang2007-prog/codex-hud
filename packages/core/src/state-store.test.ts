import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptySnapshot } from './schema';

afterEach(() => {
  vi.doUnmock('node:fs/promises');
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('writeSnapshot', () => {
  it('creates parent directories and writes formatted json', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-hud-core-'));
    const snapshotPath = join(directory, 'state', 'snapshot.json');
    const snapshot = createEmptySnapshot('session-123');
    const { writeSnapshot } = await import('./state-store');

    await writeSnapshot(snapshotPath, snapshot);

    expect(await readFile(snapshotPath, 'utf8')).toBe(`${JSON.stringify(snapshot, null, 2)}\n`);
  });

  it('writes snapshots via a temp file before renaming into place', async () => {
    const mkdir = vi.fn(async () => undefined);
    const rename = vi.fn(async () => undefined);
    const writeFile = vi.fn(async () => undefined);

    vi.doMock('node:fs/promises', () => ({
      mkdir,
      rename,
      writeFile
    }));

    const { writeSnapshot } = await import('./state-store');
    const snapshotPath = '/tmp/codex-hud/snapshot.json';
    const snapshot = createEmptySnapshot('session-123');

    await writeSnapshot(snapshotPath, snapshot);

    const [tempPath, contents, encoding] = writeFile.mock.calls[0] ?? [];
    expect(tempPath).toMatch(/snapshot\.json\..+\.tmp$/);
    expect(tempPath).not.toBe(snapshotPath);
    expect(contents).toBe(`${JSON.stringify(snapshot, null, 2)}\n`);
    expect(encoding).toBe('utf8');
    expect(rename).toHaveBeenCalledWith(tempPath, snapshotPath);
  });
});
