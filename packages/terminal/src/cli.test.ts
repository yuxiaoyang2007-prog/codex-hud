import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createDefaultSnapshotPath,
  isCliEntrypoint,
  normalizeCodexArgs,
  shouldUseStickyFooter
} from './cli';

const temporaryDirectories: string[] = [];

afterEach(() => {
  temporaryDirectories.splice(0).forEach((directory) => {
    rmSync(directory, { recursive: true, force: true });
  });
});

describe('normalizeCodexArgs', () => {
  it('drops a leading wrapper separator before forwarding help flags', () => {
    expect(normalizeCodexArgs(['--', '--help'])).toEqual(['--help']);
  });

  it('drops a lone wrapper separator for interactive launches', () => {
    expect(normalizeCodexArgs(['--'])).toEqual([]);
  });

  it('preserves separators that belong to the forwarded Codex command', () => {
    expect(normalizeCodexArgs(['exec', '--', 'echo', 'hi'])).toEqual([
      'exec',
      '--',
      'echo',
      'hi'
    ]);
  });
});

describe('shouldUseStickyFooter', () => {
  it('disables the sticky footer for help output', () => {
    expect(shouldUseStickyFooter(['--help'])).toBe(false);
    expect(shouldUseStickyFooter(['help'])).toBe(false);
  });

  it('disables the sticky footer for version output', () => {
    expect(shouldUseStickyFooter(['--version'])).toBe(false);
    expect(shouldUseStickyFooter(['-V'])).toBe(false);
  });

  it('keeps the sticky footer for interactive sessions', () => {
    expect(shouldUseStickyFooter([])).toBe(true);
    expect(shouldUseStickyFooter(['Write a changelog'])).toBe(true);
  });
});

describe('createDefaultSnapshotPath', () => {
  it('uses a stable path that the VS Code companion can follow', () => {
    expect(createDefaultSnapshotPath()).toBe('/tmp/codex-hud/current.json');
  });
});

describe('cli entrypoint', () => {
  it('declares a node shebang for the package bin entry', () => {
    const sourcePath = fileURLToPath(new URL('./cli.ts', import.meta.url));
    const source = readFileSync(sourcePath, 'utf8');

    expect(source.startsWith('#!/usr/bin/env node\n')).toBe(true);
  });

  it('treats a symlinked npm bin path as the current entrypoint', () => {
    const sourcePath = fileURLToPath(new URL('./cli.ts', import.meta.url));
    const directory = mkdtempSync(join(tmpdir(), 'codex-hud-cli-'));
    const symlinkPath = join(directory, 'codex-hud');
    temporaryDirectories.push(directory);
    symlinkSync(sourcePath, symlinkPath);

    expect(isCliEntrypoint(symlinkPath, new URL('./cli.ts', import.meta.url).href)).toBe(true);
  });
});
