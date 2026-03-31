export type HudPhase = 'idle' | 'thinking' | 'tool-running' | 'waiting' | 'error';

export type HudEvent =
  | { type: 'session.start'; at: string; model?: string; reasoningEffort?: string }
  | { type: 'phase.update'; at: string; phase: HudPhase }
  | { type: 'tool.start'; at: string; toolName: string }
  | { type: 'tool.finish'; at: string; toolName: string; success: boolean }
  | { type: 'context.update'; at: string; percentLeft: number }
  | {
      type: 'plan.update';
      at: string;
      currentStep: string | null;
      completedSteps: number;
      totalSteps: number;
    }
  | { type: 'subagent.update'; at: string; active: number; lastEvent: string }
  | { type: 'warning'; at: string; message: string };

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
    counts: Record<string, number>;
  };
  plan: {
    currentStep: string | null;
    completedSteps: number;
    totalSteps: number;
  };
  context: {
    percentLeft: number | null;
  };
  usage: {
    fiveHour: { usedPercent: number; resetsAt: number | null } | null;
    weekly: { usedPercent: number; resetsAt: number | null } | null;
    planType: string | null;
  };
  subagents: {
    active: number;
    lastEvent: string | null;
  };
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isHudPhase(value: unknown): value is HudPhase {
  return (
    value === 'idle' ||
    value === 'thinking' ||
    value === 'tool-running' ||
    value === 'waiting' ||
    value === 'error'
  );
}

const ISO_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !ISO_UTC_TIMESTAMP_PATTERN.test(value)) {
    return false;
  }

  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function isHudEvent(value: unknown): value is HudEvent {
  if (!isRecord(value) || typeof value.type !== 'string' || !isIsoTimestamp(value.at)) {
    return false;
  }

  switch (value.type) {
    case 'session.start':
      return (
        (value.model === undefined || typeof value.model === 'string') &&
        (value.reasoningEffort === undefined || typeof value.reasoningEffort === 'string')
      );
    case 'phase.update':
      return isHudPhase(value.phase);
    case 'tool.start':
      return typeof value.toolName === 'string';
    case 'tool.finish':
      return typeof value.toolName === 'string' && typeof value.success === 'boolean';
    case 'context.update':
      return (
        typeof value.percentLeft === 'number' &&
        Number.isInteger(value.percentLeft) &&
        value.percentLeft >= 0 &&
        value.percentLeft <= 100
      );
    case 'plan.update':
      return (
        (value.currentStep === null || typeof value.currentStep === 'string') &&
        isNonNegativeInteger(value.completedSteps) &&
        isNonNegativeInteger(value.totalSteps) &&
        value.completedSteps <= value.totalSteps
      );
    case 'subagent.update':
      return isNonNegativeInteger(value.active) && typeof value.lastEvent === 'string';
    case 'warning':
      return typeof value.message === 'string';
    default:
      return false;
  }
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
      elapsedMs: 0,
      counts: {}
    },
    plan: {
      currentStep: null,
      completedSteps: 0,
      totalSteps: 0
    },
    context: {
      percentLeft: null
    },
    usage: {
      fiveHour: null,
      weekly: null,
      planType: null
    },
    subagents: {
      active: 0,
      lastEvent: null
    },
    warnings: []
  };
}
