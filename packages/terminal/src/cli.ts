import { launchCodexWithHud } from './pty-launcher.js';

export function main(argv: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): void {
  launchCodexWithHud(argv, env);
}

if (process.argv[1] && process.argv[1].endsWith('cli.js')) {
  main();
}
