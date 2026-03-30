import type { HudEvent } from './schema.js';

interface CodexPlanItem {
  step?: unknown;
  status?: unknown;
}

function isPlanItem(value: unknown): value is CodexPlanItem {
  return typeof value === 'object' && value !== null;
}

function parseSessionLine(line: string):
  | {
      timestamp?: unknown;
      payload?: {
        name?: unknown;
        arguments?: {
          plan?: unknown;
        };
      };
    }
  | null {
  try {
    return JSON.parse(line) as {
      timestamp?: unknown;
      payload?: {
        name?: unknown;
        arguments?: {
          plan?: unknown;
        };
      };
    };
  } catch {
    return null;
  }
}

export function parseCodexSessionLines(lines: string[]): HudEvent[] {
  const events: HudEvent[] = [];
  let activeAgents = 0;

  for (const line of lines) {
    const record = parseSessionLine(line);
    if (record == null) {
      continue;
    }

    const name = record?.payload?.name;
    const args = record?.payload?.arguments;
    const at = typeof record?.timestamp === 'string' ? record.timestamp : new Date().toISOString();

    if (name === 'update_plan' && Array.isArray(args?.plan)) {
      const plan = args.plan.filter(isPlanItem);
      const current = plan.find((item) => item.status === 'in_progress') ?? null;
      const completed = plan.filter((item) => item.status === 'completed').length;

      events.push({
        type: 'plan.update',
        at,
        currentStep: typeof current?.step === 'string' ? current.step : null,
        completedSteps: completed,
        totalSteps: plan.length
      });
    }

    if (name === 'spawn_agent') {
      activeAgents += 1;
      events.push({
        type: 'subagent.update',
        at,
        active: activeAgents,
        lastEvent: 'spawn_agent'
      });
    }

    if (name === 'close_agent' && activeAgents > 0) {
      activeAgents -= 1;
      events.push({
        type: 'subagent.update',
        at,
        active: activeAgents,
        lastEvent: 'close_agent'
      });
    }
  }

  return events;
}
