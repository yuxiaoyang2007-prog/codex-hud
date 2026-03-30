import type { HudEvent, HudSnapshot } from './schema.js';

export function applyHudEvent(snapshot: HudSnapshot, event: HudEvent): HudSnapshot {
  const next: HudSnapshot = {
    ...snapshot,
    session: {
      ...snapshot.session,
      lastUpdatedAt: event.at
    },
    status: {
      ...snapshot.status
    },
    tool: {
      ...snapshot.tool
    },
    plan: {
      ...snapshot.plan
    },
    subagents: {
      ...snapshot.subagents
    },
    warnings: [...snapshot.warnings]
  };

  switch (event.type) {
    case 'session.start':
      next.session.startedAt = event.at;
      next.session.model = event.model ?? null;
      next.session.reasoningEffort = event.reasoningEffort ?? null;
      return next;
    case 'phase.update':
      next.status.phase = event.phase;
      return next;
    case 'tool.start':
      next.status.phase = 'tool-running';
      next.tool.activeName = event.toolName;
      next.tool.startedAt = event.at;
      next.tool.elapsedMs = 0;
      return next;
    case 'tool.finish':
      next.status.phase = event.success ? 'idle' : 'error';
      next.tool.elapsedMs = snapshot.tool.startedAt
        ? Date.parse(event.at) - Date.parse(snapshot.tool.startedAt)
        : 0;
      next.tool.activeName = null;
      next.tool.startedAt = null;
      return next;
    case 'plan.update':
      next.plan = {
        currentStep: event.currentStep,
        completedSteps: event.completedSteps,
        totalSteps: event.totalSteps
      };
      return next;
    case 'subagent.update':
      next.subagents = {
        active: event.active,
        lastEvent: event.lastEvent
      };
      return next;
    case 'warning':
      next.warnings = [...snapshot.warnings, event.message].slice(-5);
      return next;
  }
}
