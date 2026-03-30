import { renderFooter } from './footer-renderer.js';
import type { HudSnapshot } from '@codex-hud/core';

export class Screen {
  render(snapshot: HudSnapshot): string {
    const columns = process.stdout.columns || 120;
    return renderFooter(snapshot, { columns });
  }
}
