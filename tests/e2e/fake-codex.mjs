const exitCode = process.env.FAKE_CODEX_EXIT_CODE
  ? Number.parseInt(process.env.FAKE_CODEX_EXIT_CODE, 10)
  : 0;

process.stdout.write('Codex fake session starting\n');
setTimeout(() => {
  process.stdout.write('Running tool: functions.exec_command\n');
}, 100);
setTimeout(() => {
  process.stdout.write('Done\n');
  process.exit(exitCode);
}, 300);
