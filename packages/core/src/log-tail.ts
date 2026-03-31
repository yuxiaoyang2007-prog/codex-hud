import { watch } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { parseCodexSessionLines } from './codex-session-parser.js';

export function watchSessionFile(
  sessionPath: string,
  onEvents: (events: ReturnType<typeof parseCodexSessionLines>) => void
) {
  return watch(sessionPath, async () => {
    const text = await readFile(sessionPath, 'utf8');
    onEvents(parseCodexSessionLines(text.trim().split('\n').filter(Boolean)));
  });
}
