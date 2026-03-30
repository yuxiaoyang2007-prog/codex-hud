import net, { type Server, type Socket } from 'node:net';
import { applyHudEvent } from './reducer.js';
import { createEmptySnapshot, type HudEvent } from './schema.js';
import { writeSnapshot } from './state-store.js';

type HookEvent = HudEvent & {
  sessionId?: string;
};

export function createHudSocketServer(socketPath: string, snapshotPath: string): Server {
  let snapshot = createEmptySnapshot('pending-session');

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

        const event = JSON.parse(line) as HookEvent;
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
        await writeSnapshot(snapshotPath, snapshot);
      }
    });
  });
}
