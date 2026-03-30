export type HudPhase = 'idle' | 'thinking' | 'tool-running' | 'waiting' | 'error';

export interface HudSnapshot {
  session: {
    id: string;
    model: string | null;
    reasoningEffort: string | null;
    startedAt: string | null;
    lastUpdatedAt: string | null;
  };
  status: {
    phase: HudPhase;
    stale: boolean;
  };
  tool: {
    activeName: string | null;
    startedAt: string | null;
    elapsedMs: number;
  };
  plan: {
    currentStep: string | null;
    completedSteps: number;
    totalSteps: number;
  };
  subagents: {
    active: number;
    lastEvent: string | null;
  };
  warnings: string[];
}

export function createEmptySnapshot(sessionId: string): HudSnapshot {
  return {
    session: {
      id: sessionId,
      model: null,
      reasoningEffort: null,
      startedAt: null,
      lastUpdatedAt: null
    },
    status: {
      phase: 'idle',
      stale: false
    },
    tool: {
      activeName: null,
      startedAt: null,
      elapsedMs: 0
    },
    plan: {
      currentStep: null,
      completedSteps: 0,
      totalSteps: 0
    },
    subagents: {
      active: 0,
      lastEvent: null
    },
    warnings: []
  };
}
