import {
  applyHudEvent,
  createEmptySnapshot,
  createHudSocketServer,
  writeSnapshot,
  type HudSnapshot
} from '@codex-hud/core';
import type { AddressInfo, Server } from 'node:net';
import { mkdir, rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { launchCodexWithHud, type HudExitStatus } from './pty-launcher.js';

function listen(server: Server, socketPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, () => {
      server.off('error', reject);
      resolve();
    });
  });
}

function waitForExit(ptyProcess: ReturnType<typeof launchCodexWithHud>): Promise<HudExitStatus> {
  return new Promise((resolve) => {
    ptyProcess.onExit((status) => {
      resolve(status);
    });
  });
}

function createSocketPath(snapshotPath: string): string {
  const snapshotDirectory = dirname(snapshotPath);
  const snapshotName = basename(snapshotPath, '.json');
  return join(snapshotDirectory, `${snapshotName}.${process.pid}.sock`);
}

async function startHudServer(snapshotPath: string): Promise<{
  childEnvPatch: NodeJS.ProcessEnv;
  server: Server;
  socketPath: string | null;
}> {
  const socketPath = createSocketPath(snapshotPath);
  await mkdir(dirname(snapshotPath), { recursive: true });
  await rm(socketPath, { force: true });

  try {
    const server = createHudSocketServer(snapshotPath);
    await listen(server, socketPath);

    return {
      childEnvPatch: {
        CODEX_HUD_SOCKET_PATH: socketPath
      },
      server,
      socketPath
    };
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('EPERM')) {
      throw error;
    }

    const server = createHudSocketServer(snapshotPath);
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        server.off('error', reject);
        resolve();
      });
    });

    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('Expected TCP address info from HUD server fallback');
    }

    return {
      childEnvPatch: {
        CODEX_HUD_SOCKET_HOST: address.address,
        CODEX_HUD_SOCKET_PORT: String(address.port)
      },
      server,
      socketPath: null
    };
  }
}

interface DirectSnapshotState {
  buffer: string;
  snapshot: HudSnapshot;
  snapshotPath: string;
}

async function createDirectSnapshotState(
  snapshotPath: string,
  env: NodeJS.ProcessEnv
): Promise<DirectSnapshotState> {
  const sessionId = env.CODEX_HUD_SESSION_ID ?? 'local-session';
  const snapshot = applyHudEvent(createEmptySnapshot(sessionId), {
    type: 'session.start',
    at: new Date().toISOString()
  });

  await writeSnapshot(snapshotPath, snapshot);

  return {
    buffer: '',
    snapshot,
    snapshotPath
  };
}

async function applyDirectEvent(
  state: DirectSnapshotState,
  event: Parameters<typeof applyHudEvent>[1]
): Promise<void> {
  state.snapshot = applyHudEvent(state.snapshot, event);
  await writeSnapshot(state.snapshotPath, state.snapshot);
}

async function handleDirectChunk(state: DirectSnapshotState, chunk: string): Promise<void> {
  state.buffer += chunk;

  const lines = state.buffer.split(/\r?\n/);
  state.buffer = lines.pop() ?? '';

  for (const line of lines) {
    const toolPrefix = 'Running tool: ';
    if (line.startsWith(toolPrefix)) {
      await applyDirectEvent(state, {
        type: 'tool.start',
        toolName: line.slice(toolPrefix.length),
        at: new Date().toISOString()
      });
    }
  }
}

async function finishDirectSnapshot(state: DirectSnapshotState, success: boolean): Promise<void> {
  const at = new Date().toISOString();
  const toolName = state.snapshot.tool.activeName;
  if (!toolName) {
    if (!success) {
      await applyDirectEvent(state, {
        type: 'phase.update',
        phase: 'error',
        at
      });
    }

    return;
  }

  await applyDirectEvent(state, {
    type: 'tool.finish',
    toolName,
    success,
    at
  });
}

export async function main(
  argv: string[] = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const snapshotPath = env.CODEX_HUD_STATE_FILE;
  let server: Server | null = null;
  let socketPath: string | null = null;
  let childEnv = env;
  let directSnapshotState: DirectSnapshotState | null = null;

  if (snapshotPath) {
    try {
      const hudServer = await startHudServer(snapshotPath);
      server = hudServer.server;
      socketPath = hudServer.socketPath;

      childEnv = {
        ...env,
        ...hudServer.childEnvPatch
      };
    } catch {
      directSnapshotState = await createDirectSnapshotState(snapshotPath, env);
    }
  }

  const child = launchCodexWithHud(argv, childEnv);
  let pendingChunkProcessing = Promise.resolve();

  child.onData((chunk) => {
    process.stdout.write(chunk);
    if (directSnapshotState) {
      pendingChunkProcessing = pendingChunkProcessing.then(() =>
        handleDirectChunk(directSnapshotState, chunk)
      );
    }
  });

  const exitStatus = await waitForExit(child);
  await pendingChunkProcessing;

  if (directSnapshotState) {
    await finishDirectSnapshot(directSnapshotState, exitStatus.exitCode === 0);
  }

  if (server) {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  }

  if (socketPath) {
    await rm(socketPath, { force: true });
  }
}

if (process.argv[1] && process.argv[1].endsWith('cli.js')) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${String(error)}\n`);
    process.exitCode = 1;
  });
}
