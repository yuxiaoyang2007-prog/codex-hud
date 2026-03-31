import { execFile } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { main } from '../../packages/terminal/src/cli';

const temporaryPaths: string[] = [];
const execFileAsync = promisify(execFile);

function createTemporaryRoot(name: string): string {
  const root = join(
    '/tmp',
    `codex-hud-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name
  );
  temporaryPaths.push(root);
  return root;
}

function createTemporaryPath(name: string): string {
  const root = createTemporaryRoot(name);
  return join(root, name, 'snapshot.json');
}

afterEach(async () => {
  await Promise.all(
    temporaryPaths.map(async (path) => {
      await rm(path, { recursive: true, force: true });
    })
  );
});

async function waitForSnapshot(
  snapshotPath: string,
  timeoutMs = 1500
): Promise<{
  session: { id: string };
  status: { phase: string };
  tool: { activeName: string | null };
}> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
        session: { id: string };
        status: { phase: string };
        tool: { activeName: string | null };
      };

      if (snapshot.session.id) {
        return snapshot;
      }
    } catch {
      // Keep polling until the snapshot file is ready.
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Timed out waiting for snapshot ${snapshotPath}`);
}

describe('codex-hud e2e', () => {
  it('writes a snapshot while the wrapped codex process runs', async () => {
    const snapshotPath = createTemporaryPath('running');
    const run = main(['tests/e2e/fake-codex.mjs'], {
      ...process.env,
      CODEX_HUD_COMMAND: process.execPath,
      CODEX_HUD_SESSION_ID: 'session-123',
      CODEX_HUD_STATE_FILE: snapshotPath
    });

    const snapshotWhileRunning = await waitForSnapshot(snapshotPath);

    expect(snapshotWhileRunning.session.id).toBe('session-123');
    expect(['idle', 'tool-running']).toContain(snapshotWhileRunning.status.phase);
    expect([null, 'functions.exec_command']).toContain(snapshotWhileRunning.tool.activeName);

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

  it('exposes a stable repo launcher that shows help usage', async () => {
    const root = createTemporaryRoot('help');
    const logPath = join(root, 'help.log');
    await mkdir(dirname(logPath), { recursive: true });

    await execFileAsync(
      'bash',
      ['-lc', './scripts/codex-hud.sh --help >"$CODEX_HUD_HELP_LOG" 2>&1'],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          CODEX_HUD_HELP_LOG: logPath
        }
      }
    );

    const raw = await readFile(logPath, 'utf8');
    // Strip ANSI escape sequences — PTY output includes formatting codes
    const output = raw.replace(/\u001b\[[0-9;]*m/g, '');
    expect(output).toContain('Usage: codex');
  });
});
