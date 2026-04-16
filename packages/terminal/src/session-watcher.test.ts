import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { appendFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { HudEvent } from '@codex-hud/core';
import { startSessionWatcher } from './session-watcher';

const temporaryDirectories: string[] = [];

function trackTempDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'codex-hud-session-watcher-'));
  temporaryDirectories.push(directory);
  return directory;
}

function waitFor(check: () => boolean, timeoutMs = 3000): Promise<void> {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      if (check()) {
        resolve();
        return;
      }

      if (Date.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out after ${timeoutMs}ms`));
        return;
      }

      setTimeout(tick, 25);
    };

    tick();
  });
}

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

describe('startSessionWatcher', () => {
  it('attaches to a newly created rollout file under codexHome and emits initial events', async () => {
    const codexHome = trackTempDirectory();
    const now = new Date();
    const utcYear = String(now.getUTCFullYear());
    const utcMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
    const utcDay = String(now.getUTCDate()).padStart(2, '0');
    const sessionDirectory = join(codexHome, 'sessions', utcYear, utcMonth, utcDay);
    mkdirSync(sessionDirectory, { recursive: true });

    const receivedEvents: HudEvent[] = [];
    const stop = startSessionWatcher({
      codexHome,
      onEvents: (events) => {
        receivedEvents.push(...events);
      }
    });

    try {
      const sessionPath = join(
        sessionDirectory,
        `rollout-${utcYear}-${utcMonth}-${utcDay}T10-59-04-019d90cb-567b-7632-a5e6-7689ddcaf872.jsonl`
      );

      writeFileSync(
        sessionPath,
        '{"timestamp":"2026-04-15T10:59:04.755Z","type":"event_msg","payload":{"type":"task_started","model_context_window":258400}}\n'
      );
      const createdAfterWatcherStart = new Date(Date.now() + 1_000);
      await utimes(sessionPath, createdAfterWatcherStart, createdAfterWatcherStart);

      await waitFor(() =>
        receivedEvents.some(
          (event) =>
            event.type === 'phase.update' &&
            event.phase === 'thinking' &&
            event.at === '2026-04-15T10:59:04.755Z'
        )
      , 5_000);
    } finally {
      stop();
    }
  });

  it('reads appended lines incrementally from an explicit session path', async () => {
    const codexHome = trackTempDirectory();
    const sessionPath = join(codexHome, 'explicit-session.jsonl');
    writeFileSync(
      sessionPath,
      '{"timestamp":"2026-04-15T10:59:04.755Z","type":"event_msg","payload":{"type":"task_started","model_context_window":258400}}\n'
    );

    const receivedEvents: HudEvent[] = [];
    const stop = startSessionWatcher({
      explicitPath: sessionPath,
      onEvents: (events) => {
        receivedEvents.push(...events);
      }
    });

    try {
      await waitFor(() =>
        receivedEvents.some(
          (event) => event.type === 'phase.update' && event.phase === 'thinking'
        )
      );

      await appendFile(
        sessionPath,
        '{"timestamp":"2026-04-15T10:59:10.290Z","type":"response_item","payload":{"type":"function_call","name":"exec_command","call_id":"call-1"}}\n'
      );
      await appendFile(
        sessionPath,
        '{"timestamp":"2026-04-15T10:59:10.401Z","type":"response_item","payload":{"type":"function_call_output","call_id":"call-1","output":"done"}}\n'
      );

      await waitFor(() =>
        receivedEvents.some(
          (event) =>
            event.type === 'tool.finish' &&
            event.toolName === 'Ran' &&
            event.success === true
        )
      );
    } finally {
      stop();
    }
  });
});
