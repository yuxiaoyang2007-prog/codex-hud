import type { HudSnapshot } from '@codex-hud/core';
import { renderFooter } from './footer-renderer.js';

const DEFAULT_COLUMNS = 120;
const DEFAULT_ROWS = 40;

export interface TerminalOutput {
  columns?: number;
  rows?: number;
  isTTY?: boolean;
  write(chunk: string): boolean;
}

export interface TerminalViewport {
  columns: number;
  rows: number;
}

export class Screen {
  constructor(
    private readonly output: TerminalOutput = process.stdout,
    private readonly footerRows = 2
  ) {}

  getViewport(): TerminalViewport {
    return {
      columns: this.output.columns || DEFAULT_COLUMNS,
      rows: this.output.rows || DEFAULT_ROWS
    };
  }

  getContentViewport(): TerminalViewport {
    const viewport = this.getViewport();

    if (!this.isActive()) {
      return viewport;
    }

    return {
      columns: viewport.columns,
      rows: Math.max(viewport.rows - this.footerRows, 2)
    };
  }

  attach(): void {
    if (!this.isActive()) {
      return;
    }

    const contentRows = this.getContentViewport().rows;
    this.output.write(`\u001b[1;${contentRows}r\u001b[${contentRows};1H`);
  }

  render(snapshot: HudSnapshot): void {
    if (!this.isActive()) {
      return;
    }

    const viewport = this.getViewport();
    const contentRows = this.getContentViewport().rows;
    const footerLines = renderFooter(snapshot, { columns: viewport.columns }).split('\n');
    const firstFooterRow = viewport.rows - this.footerRows + 1;

    // Re-assert the scroll region on every render — the child process (Codex TUI)
    // may reset it with \e[r, which would let subsequent output scroll into our
    // reserved footer area.
    let sequence = '\u001b7';
    sequence += `\u001b[1;${contentRows}r`;
    for (let index = 0; index < this.footerRows; index += 1) {
      const line = footerLines[index] ?? '';
      sequence += `\u001b[${firstFooterRow + index};1H\u001b[2K${line}`;
    }
    sequence += '\u001b8';

    this.output.write(sequence);
  }

  /**
   * Returns an escape sequence that blanks the footer rows without
   * changing the scroll region.  Call this *before* forwarding any PTY
   * chunk that contains a scroll-region reset (`\e[r`) so the old
   * footer text doesn't get absorbed into the scrollback buffer.
   */
  getFooterClearSequence(): string {
    if (!this.isActive()) {
      return '';
    }

    const viewport = this.getViewport();
    const firstFooterRow = viewport.rows - this.footerRows + 1;

    let sequence = '\u001b7';
    for (let index = 0; index < this.footerRows; index += 1) {
      sequence += `\u001b[${firstFooterRow + index};1H\u001b[2K`;
    }
    sequence += '\u001b8';

    return sequence;
  }

  dispose(): void {
    if (!this.isActive()) {
      return;
    }

    const viewport = this.getViewport();
    const firstFooterRow = viewport.rows - this.footerRows + 1;

    let sequence = '\u001b7\u001b[r';
    for (let index = 0; index < this.footerRows; index += 1) {
      sequence += `\u001b[${firstFooterRow + index};1H\u001b[2K`;
    }
    sequence += '\u001b8';

    this.output.write(sequence);
  }

  private isActive(): boolean {
    return Boolean(this.output.isTTY) && this.getViewport().rows > this.footerRows;
  }
}
