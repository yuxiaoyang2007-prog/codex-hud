import { readFile } from 'node:fs/promises';

export async function readSnapshot(snapshotPath: string) {
  return JSON.parse(await readFile(snapshotPath, 'utf8'));
}
