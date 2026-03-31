import type { HudSnapshot } from '@codex-hud/core';

// ANSI color helpers
const c = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  red: '\u001b[31m',
  magenta: '\u001b[35m',
  brightCyan: '\u001b[96m',
  brightGreen: '\u001b[92m',
  brightYellow: '\u001b[93m',
  brightMagenta: '\u001b[95m',
  bgDim: '\u001b[48;5;236m',
  white: '\u001b[37m'
};

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatPhase(phase: string): string {
  switch (phase) {
    case 'idle':
      return `${c.brightGreen}idle${c.reset}`;
    case 'thinking':
      return `${c.brightYellow}● thinking${c.reset}`;
    case 'tool-running':
      return `${c.brightCyan}◐ tool${c.reset}`;
    case 'waiting':
      return `${c.yellow}waiting${c.reset}`;
    case 'error':
      return `${c.red}✗ error${c.reset}`;
    default:
      return phase;
  }
}

function shortToolName(name: string): string {
  // "functions.exec_command" → "exec_command"
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.slice(dotIndex + 1) : name;
}

function formatToolCounts(counts: Record<string, number>, maxWidth: number): string {
  const entries = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);

  if (entries.length === 0) {
    return '';
  }

  const parts: string[] = [];
  let width = 0;

  for (const [name, count] of entries) {
    const short = shortToolName(name);
    const part = `${c.green}✓${c.reset} ${short} ${c.dim}×${count}${c.reset}`;
    const plainWidth = 2 + short.length + 2 + String(count).length;
    if (width + plainWidth + 3 > maxWidth && parts.length > 0) {
      break;
    }
    parts.push(part);
    width += plainWidth + 3;
  }

  return parts.join(` ${c.dim}│${c.reset} `);
}

function renderContextBar(percentLeft: number | null): string {
  if (percentLeft === null) {
    return '';
  }

  const barWidth = 10;
  const filled = Math.round((percentLeft / 100) * barWidth);
  const empty = barWidth - filled;

  let barColor: string;
  let pctColor: string;
  if (percentLeft > 50) {
    barColor = c.brightGreen;
    pctColor = c.green;
  } else if (percentLeft > 25) {
    barColor = c.brightYellow;
    pctColor = c.yellow;
  } else {
    barColor = c.red;
    pctColor = c.red;
  }

  return `${c.dim}Context${c.reset} ${barColor}${'█'.repeat(filled)}${c.dim}${'░'.repeat(empty)}${c.reset} ${pctColor}${percentLeft}%${c.reset}`;
}

function formatResetTime(resetAtEpoch: number | null): string {
  if (resetAtEpoch === null) return '';
  const resetDate = new Date(resetAtEpoch * 1000);
  const now = new Date();
  if (
    resetDate.getFullYear() === now.getFullYear() &&
    resetDate.getMonth() === now.getMonth() &&
    resetDate.getDate() === now.getDate()
  ) {
    // Same day: show time only
    return resetDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  // Different day: show date
  return resetDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function renderUsageBucket(
  label: string,
  bucket: { usedPercent: number; resetsAt: number | null } | null
): string {
  if (!bucket) return '';
  const remaining = Math.max(0, Math.min(100, 100 - bucket.usedPercent));
  let pctColor: string;
  if (remaining > 50) pctColor = c.green;
  else if (remaining > 10) pctColor = c.yellow;
  else pctColor = c.red;
  const reset = formatResetTime(bucket.resetsAt);
  return `${c.dim}${label}${c.reset} ${pctColor}${remaining}%${c.reset}${reset ? ` ${c.dim}${reset}${c.reset}` : ''}`;
}

export function renderFooter(snapshot: HudSnapshot, { columns }: { columns: number }): string {
  const now = Date.now();

  // Line 1: [Model] | Codex | Context bar | ⚙ duration | phase
  const model = snapshot.session.model ?? 'n/a';
  const effort = snapshot.session.reasoningEffort;
  const modelBadge = effort
    ? `${c.bold}${c.cyan}[${model} ${effort}]${c.reset}`
    : `${c.bold}${c.cyan}[${model}]${c.reset}`;

  const product = `${c.brightMagenta}Codex${c.reset}`;

  const contextBar = renderContextBar(snapshot.context.percentLeft);

  const durationMs = snapshot.session.startedAt
    ? now - Date.parse(snapshot.session.startedAt)
    : 0;
  const duration = durationMs > 0
    ? `${c.dim}⚙${c.reset}  ${formatDuration(durationMs)}`
    : '';

  const phase = formatPhase(snapshot.status.phase);

  const line1Parts = [modelBadge, product];
  if (contextBar) {
    line1Parts.push(contextBar);
  }
  if (duration) {
    line1Parts.push(duration);
  }
  line1Parts.push(phase);
  const line1 = line1Parts.join(` ${c.dim}│${c.reset} `);

  // Line 2: usage | tool counts | active tool | plan | agents | warning
  const line2Parts: string[] = [];

  const fiveHourStr = renderUsageBucket('5h', snapshot.usage.fiveHour);
  if (fiveHourStr) line2Parts.push(fiveHourStr);
  const weeklyStr = renderUsageBucket('1w', snapshot.usage.weekly);
  if (weeklyStr) line2Parts.push(weeklyStr);

  const toolCountStr = formatToolCounts(snapshot.tool.counts, Math.floor(columns * 0.5));
  if (toolCountStr) {
    line2Parts.push(toolCountStr);
  }

  if (snapshot.tool.activeName) {
    const active = shortToolName(snapshot.tool.activeName);
    line2Parts.push(`${c.yellow}◐${c.reset} ${active}`);
  }

  if (snapshot.plan.totalSteps > 0) {
    line2Parts.push(
      `${c.dim}plan:${c.reset}${snapshot.plan.completedSteps}/${snapshot.plan.totalSteps}`
    );
  }

  if (snapshot.subagents.active > 0) {
    line2Parts.push(
      `${c.magenta}agents:${snapshot.subagents.active}${c.reset}`
    );
  }

  const lastWarning = snapshot.warnings.at(-1);
  if (lastWarning) {
    const short = lastWarning.length > 30 ? lastWarning.slice(0, 27) + '...' : lastWarning;
    line2Parts.push(`${c.yellow}⚠ ${short}${c.reset}`);
  }

  const line2 = line2Parts.length > 0
    ? line2Parts.join(` ${c.dim}│${c.reset} `)
    : `${c.dim}waiting for activity…${c.reset}`;

  return [line1, line2].join('\n');
}
