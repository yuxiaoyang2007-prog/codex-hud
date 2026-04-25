import type { FSWatcher } from 'node:fs';
import { existsSync, watch } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { parseCodexSessionLines, type HudEvent } from '@codex-hud/core';

const DEFAULT_POLL_INTERVAL_MS = 200;

interface SessionWatcherOptions {
  codexHome?: string;
  explicitPath?: string;
  onEvents: (events: HudEvent[]) => void;
  debug?: boolean;
}

function debugLog(enabled: boolean | undefined, message: string): void {
  if (!enabled) {
    return;
  }

  process.stderr.write(`[codex-hud] session-watcher: ${message}\n`);
}

function utcDirectoryParts(date: Date): [string, string, string] {
  return [
    String(date.getUTCFullYear()),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ];
}

async function findLatestSessionFile(
  codexHome: string,
  startedAtMs: number
): Promise<string | null> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const candidateDirectories = [utcDirectoryParts(now), utcDirectoryParts(yesterday)].map(
    ([year, month, day]) => join(codexHome, 'sessions', year, month, day)
  );

  let latestPath: string | null = null;
  let latestMtimeMs = -1;

  for (const directory of candidateDirectories) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !entry.name.startsWith('rollout-') ||
        !entry.name.endsWith('.jsonl')
      ) {
        continue;
      }

      const fullPath = join(directory, entry.name);
      let stats;
      try {
        stats = await stat(fullPath);
      } catch {
        continue;
      }

      if (stats.mtimeMs < startedAtMs || stats.mtimeMs < latestMtimeMs) {
        continue;
      }

      latestMtimeMs = stats.mtimeMs;
      latestPath = fullPath;
    }
  }

  return latestPath;
}

export function startSessionWatcher(opts: SessionWatcherOptions): () => void {
  const codexHome = opts.codexHome ?? join(homedir(), '.codex');
  const startedAtMs = Date.now();
  let watcher: FSWatcher | null = null;
  let pollTimer: NodeJS.Timeout | null = null;
  let attachedPath: string | null = null;
  let closed = false;
  let readOffset = 0;
  let bufferedPartialLine = '';
  let lineHistory: string[] = [];
  let emittedEventCount = 0;
  let pendingRead = Promise.resolve();
  let pollingInFlight = false;

  const emitEvents = (events: HudEvent[]): void => {
    if (events.length > 0) {
      opts.onEvents(events);
    }
  };

  const readAvailableBytes = async (): Promise<void> => {
    if (closed || attachedPath == null) {
      return;
    }

    const fileHandle = await open(attachedPath, 'r');
    try {
      const stats = await fileHandle.stat();
      if (stats.size < readOffset) {
        readOffset = 0;
        bufferedPartialLine = '';
        lineHistory = [];
        emittedEventCount = 0;
      }

      const unreadByteCount = stats.size - readOffset;
      if (unreadByteCount <= 0) {
        return;
      }

      const buffer = Buffer.alloc(unreadByteCount);
      const { bytesRead } = await fileHandle.read(buffer, 0, unreadByteCount, readOffset);
      readOffset += bytesRead;

      const text = bufferedPartialLine + buffer.toString('utf8', 0, bytesRead);
      const endsWithNewline = /\r?\n$/.test(text);
      const segments = text.split(/\r?\n/);
      bufferedPartialLine = endsWithNewline ? '' : (segments.pop() ?? '');
      const completeLines = segments.filter((segment) => segment.length > 0);
      if (completeLines.length === 0) {
        return;
      }

      lineHistory = [...lineHistory, ...completeLines];
      const events = parseCodexSessionLines(lineHistory);
      emitEvents(events.slice(emittedEventCount));
      emittedEventCount = events.length;
    } finally {
      await fileHandle.close();
    }
  };

  const scheduleRead = (): void => {
    pendingRead = pendingRead
      .then(() => readAvailableBytes())
      .catch((error: unknown) => {
        debugLog(opts.debug, `read failed: ${String(error)}`);
      });
  };

  const attachToPath = (sessionPath: string): void => {
    if (closed || attachedPath === sessionPath) {
      return;
    }

    attachedPath = sessionPath;
    watcher?.close();
    watcher = watch(sessionPath, () => {
      scheduleRead();
    });
    debugLog(opts.debug, `attached to ${sessionPath}`);
    scheduleRead();
  };

  const pollForSessionFile = async (): Promise<void> => {
    if (closed || attachedPath != null || pollingInFlight) {
      return;
    }

    pollingInFlight = true;
    try {
      const candidatePath = opts.explicitPath
        ? existsSync(opts.explicitPath)
          ? opts.explicitPath
          : null
        : await findLatestSessionFile(codexHome, startedAtMs);

      if (candidatePath) {
        attachToPath(candidatePath);
        if (pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
        return;
      }
    } finally {
      pollingInFlight = false;
    }
  };

  if (opts.explicitPath && existsSync(opts.explicitPath)) {
    attachToPath(opts.explicitPath);
  } else {
    void pollForSessionFile();
    pollTimer = setInterval(() => {
      void pollForSessionFile();
    }, DEFAULT_POLL_INTERVAL_MS);
  }

  return () => {
    closed = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    watcher?.close();
  };
}
