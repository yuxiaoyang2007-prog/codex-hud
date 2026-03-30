import type { HudSnapshot } from '@codex-hud/core';

export function renderFooter(snapshot: HudSnapshot, { columns }: { columns: number }): string {
  const line1 = [
    `session:${snapshot.session.id}`,
    `model:${snapshot.session.model ?? 'n/a'}`,
    `phase:${snapshot.status.phase}`,
    `tool:${snapshot.tool.activeName ?? 'none'}`
  ].join(' | ');

  const line2 = [
    `plan:${snapshot.plan.completedSteps}/${snapshot.plan.totalSteps}`,
    `step:${snapshot.plan.currentStep ?? 'n/a'}`,
    `agents:${snapshot.subagents.active}`,
    `warn:${snapshot.warnings.at(-1) ?? 'none'}`
  ].join(' | ');

  return [line1.slice(0, columns), line2.slice(0, columns)].join('\n');
}
