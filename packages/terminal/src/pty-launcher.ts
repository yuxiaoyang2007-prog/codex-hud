import pty from 'node-pty';

export function launchCodexWithHud(args: string[], env: NodeJS.ProcessEnv) {
  return pty.spawn('codex', args, {
    name: 'xterm-color',
    cols: process.stdout.columns || 120,
    rows: process.stdout.rows || 40,
    cwd: process.cwd(),
    env
  });
}
