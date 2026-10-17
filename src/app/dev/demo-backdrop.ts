import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { DemoBackdropTone } from './demo';

/**
 * Preview-only stand-in for the desktop behind the transparent overlay, to judge contrast:
 * `dark` = a busy video-call grid, `bright` = a white document with colour blocks.
 */
@Component({
  selector: 'app-demo-backdrop',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'tone()', 'aria-hidden': 'true' },
  template: `
    @for (tile of tiles; track $index) {
      <i [style.--h]="tile"></i>
    }
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: -1;
      display: grid;
      gap: 6px;
      padding: 6px;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      grid-auto-rows: 150px;
      overflow: hidden;
    }
    :host(.none) {
      display: none;
    }
    :host(.dark) {
      background: #202124;
    }
    :host(.dark) i {
      border-radius: 10px;
      background:
        radial-gradient(circle at 50% 42%, hsl(var(--h) 45% 72%) 0 22px, transparent 23px),
        radial-gradient(ellipse 60px 46px at 50% 100%, hsl(var(--h) 40% 60%) 0 98%, transparent),
        linear-gradient(160deg, hsl(var(--h) 30% 28%), hsl(calc(var(--h) + 60) 35% 14%));
    }
    :host(.bright) {
      background: #fff;
    }
    :host(.bright) i {
      border-radius: 4px;
      background:
        linear-gradient(#fff 0 0) 12px 14px / 60% 10px no-repeat,
        repeating-linear-gradient(#1f2937 0 3px, transparent 3px 14px) 12px 40px / 85% 70px
          no-repeat,
        linear-gradient(135deg, hsl(var(--h) 85% 62%), hsl(calc(var(--h) + 40) 90% 82%));
    }
  `,
})
export class DemoBackdrop {
  readonly tone = input.required<DemoBackdropTone>();
  protected readonly tiles = Array.from({ length: 96 }, (_, i) => (i * 47) % 360);
}
