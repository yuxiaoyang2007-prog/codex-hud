import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { HudSnapshot } from './schema.js';

export async function writeSnapshot(snapshotPath: string, snapshot: HudSnapshot): Promise<void> {
  await mkdir(dirname(snapshotPath), { recursive: true });
  await writeFile(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
}
