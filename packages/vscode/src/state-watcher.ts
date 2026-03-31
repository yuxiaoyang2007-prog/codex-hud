import { watchFile, unwatchFile } from 'node:fs';
import { readFile } from 'node:fs/promises';

export async function readSnapshot(snapshotPath: string) {
  return JSON.parse(await readFile(snapshotPath, 'utf8'));
}

export function watchSnapshot(
  snapshotPath: string,
  onSnapshot: (snapshot: unknown) => void
): { dispose(): void } {
  const listener = async () => {
    try {
      onSnapshot(await readSnapshot(snapshotPath));
    } catch {
      // Ignore transient read failures while the snapshot file is being replaced.
    }
  };

  watchFile(snapshotPath, { interval: 200 }, listener);

  return {
    dispose() {
      unwatchFile(snapshotPath, listener);
    }
  };
}
