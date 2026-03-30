import { EventEmitter } from 'node:events';
import { mkdtemp, readFile } from 'node:fs/promises';
import net from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHudSocketServer } from './socket-server';

class FakeConnection extends EventEmitter {
  setEncoding(_encoding: BufferEncoding): this {
    return this;
  }
}

function attachConnection(server: net.Server): FakeConnection {
  const listener = server.listeners('connection')[0];
  if (typeof listener !== 'function') {
    throw new Error('Expected a connection listener');
  }

  const connection = new FakeConnection();
  listener(connection as unknown as net.Socket);
  return connection;
}

async function waitForSnapshot(snapshotPath: string): Promise<string> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      return await readFile(snapshotPath, 'utf8');
    } catch {
      await delay(10);
    }
  }

  throw new Error(`Snapshot was not written: ${snapshotPath}`);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createHudSocketServer', () => {
  it('ignores malformed json and unknown event shapes while preserving valid updates', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codex-hud-socket-'));
    const snapshotPath = join(directory, 'snapshot.json');
    const server = createHudSocketServer(snapshotPath);
    const connection = attachConnection(server);

    connection.emit('data', 'not json\n');
    connection.emit(
      'data',
      `${JSON.stringify({
        type: 'tool.explode',
        at: '2026-03-30T10:00:00.000Z'
      })}\n`
    );
    connection.emit(
      'data',
      `${JSON.stringify({
        type: 'tool.start',
        toolName: 'functions.exec_command',
        at: '2026-03-30T10:00:01.000Z',
        sessionId: 'session-123'
      })}\n`
    );

    const snapshot = JSON.parse(await waitForSnapshot(snapshotPath)) as {
      session: { id: string; lastUpdatedAt: string | null };
      status: { phase: string };
      tool: { activeName: string | null };
    };

    expect(snapshot.session.id).toBe('session-123');
    expect(snapshot.session.lastUpdatedAt).toBe('2026-03-30T10:00:01.000Z');
    expect(snapshot.status.phase).toBe('tool-running');
    expect(snapshot.tool.activeName).toBe('functions.exec_command');
  });

  it('serializes event persistence so older writes cannot overtake newer state', async () => {
    const firstWrite = Promise.withResolvers<void>();
    const startedWrites: string[] = [];
    const persistedWrites: string[] = [];
    const writeSnapshot = vi.fn(
      async (
        _snapshotPath: string,
        snapshot: { session: { lastUpdatedAt: string | null } }
      ) => {
        startedWrites.push(snapshot.session.lastUpdatedAt ?? 'missing');

        if (startedWrites.length === 1) {
          await firstWrite.promise;
        }

        persistedWrites.push(snapshot.session.lastUpdatedAt ?? 'missing');
      }
    );

    const directory = await mkdtemp(join(tmpdir(), 'codex-hud-socket-'));
    const server = createHudSocketServer(join(directory, 'snapshot.json'), {
      writeSnapshot
    });
    const connection = attachConnection(server);

    connection.emit(
      'data',
      `${JSON.stringify({
        type: 'tool.start',
        toolName: 'functions.exec_command',
        at: '2026-03-30T10:00:00.000Z',
        sessionId: 'session-123'
      })}\n`
    );
    connection.emit(
      'data',
      `${JSON.stringify({
        type: 'warning',
        message: 'Heads up',
        at: '2026-03-30T10:00:01.000Z',
        sessionId: 'session-123'
      })}\n`
    );

    await delay(25);
    expect(startedWrites).toEqual(['2026-03-30T10:00:00.000Z']);

    firstWrite.resolve();

    await vi.waitFor(() => {
      expect(persistedWrites).toEqual(['2026-03-30T10:00:00.000Z', '2026-03-30T10:00:01.000Z']);
    });
  });

  it('keeps the write queue alive after a failed persistence attempt', async () => {
    const failedWrite = Promise.withResolvers<void>();
    const persistedWrites: string[] = [];
    const writeSnapshot = vi
      .fn<
        (snapshotPath: string, snapshot: { session: { lastUpdatedAt: string | null } }) => Promise<void>
      >()
      .mockImplementationOnce(async () => {
        await failedWrite.promise;
        throw new Error('disk full');
      })
      .mockImplementationOnce(async (_snapshotPath, snapshot) => {
        persistedWrites.push(snapshot.session.lastUpdatedAt ?? 'missing');
      });

    const directory = await mkdtemp(join(tmpdir(), 'codex-hud-socket-'));
    const server = createHudSocketServer(join(directory, 'snapshot.json'), {
      writeSnapshot
    });
    const connection = attachConnection(server);

    connection.emit(
      'data',
      `${JSON.stringify({
        type: 'tool.start',
        toolName: 'functions.exec_command',
        at: '2026-03-30T10:00:00.000Z',
        sessionId: 'session-123'
      })}\n`
    );
    connection.emit(
      'data',
      `${JSON.stringify({
        type: 'warning',
        message: 'Still going',
        at: '2026-03-30T10:00:01.000Z',
        sessionId: 'session-123'
      })}\n`
    );

    failedWrite.resolve();

    await vi.waitFor(() => {
      expect(persistedWrites).toEqual(['2026-03-30T10:00:01.000Z']);
    });
  });
});
