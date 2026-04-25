export interface StatusBarSnapshot {
  session: { model: string | null };
  context: { percentLeft: number | null };
  status: { phase: string };
  tool: { activeName: string | null };
  plan: { completedSteps: number; totalSteps: number };
}

export function formatStatusBarText(snapshot: StatusBarSnapshot) {
  const contextText =
    snapshot.context.percentLeft === null ? 'ctx:n/a' : `ctx:${snapshot.context.percentLeft}%`;

  return [
    'Codex HUD',
    snapshot.session.model ?? 'n/a',
    contextText,
    snapshot.status.phase,
    snapshot.tool.activeName ?? 'no-tool',
    `${snapshot.plan.completedSteps}/${snapshot.plan.totalSteps}`
  ].join(' · ');
}
