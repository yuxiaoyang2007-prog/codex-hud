/**
 * Polls the Codex app-server for account rate limit data (5h / weekly usage).
 *
 * Spawns a short-lived `codex app-server --listen stdio://` process, sends a
 * JSON-RPC `initialize` + `account/rateLimits/read` request pair, and returns
 * the parsed rate-limit snapshot.
 */

import { spawn } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import type { HudSnapshot } from '@codex-hud/core';

// ---------------------------------------------------------------------------
// Types matching the Codex app-server protocol (v2)
// ---------------------------------------------------------------------------

interface RateLimitWindow {
  usedPercent: number;
  windowDurationMins?: number | null;
  resetsAt?: number | null;
}

interface RateLimitSnapshot {
  primary?: RateLimitWindow | null;
  secondary?: RateLimitWindow | null;
  planType?: string | null;
}

interface RateLimitsResponse {
  rateLimits?: RateLimitSnapshot;
}

// ---------------------------------------------------------------------------
// Resolve the codex binary (prefer the VS Code extension copy)
// ---------------------------------------------------------------------------

function findCodexBinary(): string | null {
  const home = process.env.HOME ?? '';

  // Prefer the VS Code extension binary (always up-to-date)
  const vscodeExtDir = join(home, '.vscode', 'extensions');
  try {
    const entries: string[] = [];
    // Dynamic import not needed - use readdirSync
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    for (const entry of readdirSync(vscodeExtDir)) {
      if (entry.startsWith('openai.chatgpt-') && entry.includes('darwin-arm64')) {
        entries.push(entry);
      }
    }
    // Sort descending to get latest version
    entries.sort().reverse();
    for (const entry of entries) {
      const candidate = join(vscodeExtDir, entry, 'bin', 'macos-aarch64', 'codex');
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        continue;
      }
    }
  } catch {
    // VS Code extensions dir not found
  }

  // Fall back to PATH
  const pathValue = process.env.PATH ?? '';
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, 'codex');
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// JSON-RPC stdio client (one-shot)
// ---------------------------------------------------------------------------

function queryAppServer(binary: string): Promise<RateLimitsResponse | null> {
  return new Promise((resolve) => {
    const child = spawn(binary, ['app-server', '--listen', 'stdio://'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: process.env
    });

    let buffer = '';
    let initialized = false;
    let resolved = false;

    const finish = (result: RateLimitsResponse | null) => {
      if (resolved) return;
      resolved = true;
      child.kill();
      resolve(result);
    };

    child.stdout.on('data', (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line) as {
            id?: number;
            result?: Record<string, unknown>;
            error?: unknown;
          };

          if (msg.id === 1 && !initialized) {
            initialized = true;
            child.stdin.write(
              JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'account/rateLimits/read',
                params: {}
              }) + '\n'
            );
          }

          if (msg.id === 2) {
            finish((msg.result as RateLimitsResponse) ?? null);
          }
        } catch {
          // Ignore malformed lines
        }
      }
    });

    child.on('error', () => finish(null));
    child.on('exit', () => finish(null));

    // Send initialize
    child.stdin.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          clientInfo: { name: 'codex-hud', version: '0.1.0' },
          protocolVersion: '2025-01-01',
          capabilities: {}
        }
      }) + '\n'
    );

    // Timeout
    setTimeout(() => finish(null), 10_000);
  });
}

// ---------------------------------------------------------------------------
// Parse response into HudSnapshot.usage shape
// ---------------------------------------------------------------------------

function parseUsage(
  response: RateLimitsResponse
): HudSnapshot['usage'] {
  const rl = response.rateLimits;
  if (!rl) {
    return { fiveHour: null, weekly: null, planType: null };
  }

  const fiveHour = rl.primary
    ? { usedPercent: rl.primary.usedPercent, resetsAt: rl.primary.resetsAt ?? null }
    : null;

  const weekly = rl.secondary
    ? { usedPercent: rl.secondary.usedPercent, resetsAt: rl.secondary.resetsAt ?? null }
    : null;

  return {
    fiveHour,
    weekly,
    planType: rl.planType ?? null
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchRateLimits(): Promise<HudSnapshot['usage'] | null> {
  const binary = findCodexBinary();
  if (!binary) return null;

  try {
    const response = await queryAppServer(binary);
    if (!response) return null;
    return parseUsage(response);
  } catch {
    return null;
  }
}

/**
 * Start a background poller that calls `onUpdate` with fresh rate-limit data
 * every `intervalMs` milliseconds.  Returns a dispose function.
 */
export function startRateLimitPoller(
  intervalMs: number,
  onUpdate: (usage: HudSnapshot['usage']) => void
): () => void {
  let stopped = false;

  const poll = async () => {
    if (stopped) return;
    const usage = await fetchRateLimits();
    if (usage && !stopped) {
      onUpdate(usage);
    }
  };

  // Initial fetch
  void poll();

  const timer = setInterval(() => void poll(), intervalMs);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
