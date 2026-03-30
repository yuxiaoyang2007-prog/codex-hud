import { mkdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { HudSnapshot } from './schema.js';

export async function writeSnapshot(snapshotPath: string, snapshot: HudSnapshot): Promise<void> {
  const snapshotDirectory = dirname(snapshotPath);
  const tempPath = join(
    snapshotDirectory,
    `${basename(snapshotPath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );

  await mkdir(snapshotDirectory, { recursive: true });
  await writeFile(tempPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  await rename(tempPath, snapshotPath);
}
