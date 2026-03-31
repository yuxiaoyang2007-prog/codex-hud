export interface StatusBarSnapshot {
  session: { model: string | null };
  status: { phase: string };
  tool: { activeName: string | null };
  plan: { completedSteps: number; totalSteps: number };
}

export function formatStatusBarText(snapshot: StatusBarSnapshot) {
  return [
    'Codex HUD',
    snapshot.session.model ?? 'n/a',
    snapshot.status.phase,
    snapshot.tool.activeName ?? 'no-tool',
    `${snapshot.plan.completedSteps}/${snapshot.plan.totalSteps}`
  ].join(' · ');
}
