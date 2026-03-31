import net, { type Server, type Socket } from 'node:net';
import { applyHudEvent } from './reducer.js';
import { createEmptySnapshot, isHudEvent, type HudEvent, type HudSnapshot } from './schema.js';
import { writeSnapshot as writeSnapshotToDisk } from './state-store.js';

type HookEvent = HudEvent & {
  sessionId?: string;
};

interface CreateHudSocketServerOptions {
  initialSnapshot?: HudSnapshot;
  onSnapshot?: (snapshot: HudSnapshot) => void;
  writeSnapshot?: (snapshotPath: string, snapshot: HudSnapshot) => Promise<void>;
}

function isHookEvent(value: unknown): value is HookEvent {
  return (
    isHudEvent(value) &&
    (!('sessionId' in value) || value.sessionId === undefined || typeof value.sessionId === 'string')
  );
}

function parseHookEventLine(line: string): HookEvent | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    return isHookEvent(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function createHudSocketServer(
  snapshotPath: string,
  options: CreateHudSocketServerOptions = {}
): Server {
  let snapshot = options.initialSnapshot ?? createEmptySnapshot('pending-session');
  let pendingWrite = Promise.resolve();
  const notifySnapshot = options.onSnapshot;
  const persistSnapshot = options.writeSnapshot ?? writeSnapshotToDisk;

  return net.createServer((connection: Socket) => {
    let buffer = '';

    connection.setEncoding('utf8');
    connection.on('data', async (chunk: string) => {
      buffer += chunk;

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }

        const event = parseHookEventLine(line);
        if (event == null) {
          continue;
        }

        pendingWrite = pendingWrite
          .catch(() => undefined)
          .then(async () => {
            if (snapshot.session.id === 'pending-session' && event.sessionId) {
              snapshot = {
                ...snapshot,
                session: {
                  ...snapshot.session,
                  id: event.sessionId
                }
              };
            }

            snapshot = applyHudEvent(snapshot, event);
            try {
              notifySnapshot?.(snapshot);
            } catch {
              // Keep socket processing resilient even if a UI subscriber fails.
            }
            await persistSnapshot(snapshotPath, snapshot);
          });
      }

      await pendingWrite.catch(() => undefined);
    });
  });
}
