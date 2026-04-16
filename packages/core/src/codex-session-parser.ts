import type { HudEvent } from './schema.js';

interface CodexPlanItem {
  step?: unknown;
  status?: unknown;
}

interface SessionRecord {
  timestamp?: unknown;
  type?: unknown;
  payload?: {
    type?: unknown;
    name?: unknown;
    call_id?: unknown;
    arguments?: {
      plan?: unknown;
    };
    info?: {
      total_token_usage?: {
        total_tokens?: unknown;
      };
      model_context_window?: unknown;
    } | null;
    model_context_window?: unknown;
  };
}

const TOOL_DISPLAY: Record<string, string> = {
  exec_command: 'Ran',
  shell: 'Ran',
  update_plan: 'Plan',
  apply_patch: 'Patched',
  read_file: 'Read',
  write_file: 'Wrote'
};

function isPlanItem(value: unknown): value is CodexPlanItem {
  return typeof value === 'object' && value !== null;
}

function parseSessionLine(line: string): SessionRecord | null {
  try {
    return JSON.parse(line) as SessionRecord;
  } catch {
    return null;
  }
}

function getTimestamp(record: SessionRecord): string {
  return typeof record.timestamp === 'string' ? record.timestamp : new Date().toISOString();
}

function toDisplayToolName(name: string): string {
  return TOOL_DISPLAY[name] ?? name;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export class CodexSessionParser {
  private activeAgents = 0;

  private contextWindow: number | null = null;

  private activeToolCalls = new Map<string, string>();

  private lastEmittedPercent: number | null = null;

  ingest(line: string): HudEvent[] {
    const record = parseSessionLine(line);
    if (record == null) {
      return [];
    }

    const events: HudEvent[] = [];
    const at = getTimestamp(record);

    this.ingestLegacyRecord(record, at, events);
    this.ingestCurrentRecord(record, at, events);

    return events;
  }

  ingestAll(lines: string[]): HudEvent[] {
    return lines.flatMap((line) => this.ingest(line));
  }

  private ingestLegacyRecord(record: SessionRecord, at: string, events: HudEvent[]): void {
    const name = record.payload?.name;
    const args = record.payload?.arguments;

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
      this.activeAgents += 1;
      events.push({
        type: 'subagent.update',
        at,
        active: this.activeAgents,
        lastEvent: 'spawn_agent'
      });
    }

    if (name === 'close_agent' && this.activeAgents > 0) {
      this.activeAgents -= 1;
      events.push({
        type: 'subagent.update',
        at,
        active: this.activeAgents,
        lastEvent: 'close_agent'
      });
    }
  }

  private ingestCurrentRecord(record: SessionRecord, at: string, events: HudEvent[]): void {
    if (record.type === 'event_msg') {
      this.ingestEventMessage(record, at, events);
      return;
    }

    if (record.type === 'response_item') {
      this.ingestResponseItem(record, at, events);
    }
  }

  private ingestEventMessage(record: SessionRecord, at: string, events: HudEvent[]): void {
    const payloadType = record.payload?.type;

    if (payloadType === 'task_started') {
      const contextWindow = record.payload?.model_context_window;
      if (typeof contextWindow === 'number' && Number.isFinite(contextWindow) && contextWindow > 0) {
        this.contextWindow = contextWindow;
      }

      events.push({
        type: 'phase.update',
        at,
        phase: 'thinking'
      });
      return;
    }

    if (payloadType === 'task_complete' || payloadType === 'agent_message') {
      events.push({
        type: 'phase.update',
        at,
        phase: 'idle'
      });
      return;
    }

    if (payloadType === 'token_count') {
      const info = record.payload?.info;
      const totalTokens = info?.total_token_usage?.total_tokens;
      const contextWindow = info?.model_context_window;

      if (typeof contextWindow === 'number' && Number.isFinite(contextWindow) && contextWindow > 0) {
        this.contextWindow = contextWindow;
      }

      if (
        this.contextWindow == null ||
        typeof totalTokens !== 'number' ||
        !Number.isFinite(totalTokens) ||
        totalTokens < 0
      ) {
        return;
      }

      const percentLeft = clampPercent(
        Math.round((1 - totalTokens / this.contextWindow) * 100)
      );
      if (percentLeft === this.lastEmittedPercent) {
        return;
      }

      this.lastEmittedPercent = percentLeft;
      events.push({
        type: 'context.update',
        at,
        percentLeft
      });
    }
  }

  private ingestResponseItem(record: SessionRecord, at: string, events: HudEvent[]): void {
    const payloadType = record.payload?.type;

    if (payloadType === 'function_call') {
      const name = record.payload?.name;
      const callId = record.payload?.call_id;
      if (typeof name !== 'string' || typeof callId !== 'string') {
        return;
      }

      const toolName = toDisplayToolName(name);
      this.activeToolCalls.set(callId, toolName);
      events.push({
        type: 'tool.start',
        at,
        toolName
      });
      return;
    }

    if (payloadType === 'function_call_output') {
      const callId = record.payload?.call_id;
      if (typeof callId !== 'string') {
        return;
      }

      const toolName = this.activeToolCalls.get(callId);
      if (!toolName) {
        return;
      }

      this.activeToolCalls.delete(callId);
      events.push({
        type: 'tool.finish',
        at,
        toolName,
        success: true
      });
    }
  }
}

export function parseCodexSessionLines(lines: string[]): HudEvent[] {
  return new CodexSessionParser().ingestAll(lines);
}
