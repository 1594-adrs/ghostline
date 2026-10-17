import {
  afterNextRender,
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { Block, BlockKind, Run } from '../core/contracts';
import { I18n } from '../i18n/i18n';
import { PrompterStore } from '../prompter/prompter.store';

interface RunView {
  readonly text: string;
  /** Word index, -1 for whitespace/punctuation. */
  readonly w: number;
  /** Word whose read state this run follows (punctuation dims with its word); -1 if unspoken. */
  readonly s: number;
  readonly cls: string;
}

interface BlockView {
  readonly id: number;
  readonly kind: BlockKind;
  readonly level: number | null;
  readonly cls: string;
  readonly runs: readonly RunView[];
}

interface Layout {
  /** Reading line, px from the column top. */
  readonly line: number;
  /** Track translation that puts the target on the reading line. */
  readonly shift: number;
  /** Current-word box in track coordinates; null when finished. */
  readonly cue: { x: number; y: number; w: number; h: number } | null;
  /** True when the track must jump instead of glide (first layout, new script). */
  readonly snap: boolean;
}

/** Fraction of the text area above the reading line. */
const READING_LINE = 1 / 3;

function runViews(runs: readonly Run[]): RunView[] {
  const views: RunView[] = [];
  let previous = -1;
  for (let i = 0; i < runs.length; i++) {
    const run = runs[i];
    const cls = run.emphasis.map((e) => `e-${e}`).join(' ');
    if (run.wordIndex !== null) {
      previous = run.wordIndex;
      views.push({ text: run.text, w: run.wordIndex, s: run.wordIndex, cls: `w ${cls}`.trim() });
      continue;
    }
    // Leading punctuation (¿ « …) follows the next word, everything else the previous one.
    const next =
      previous === -1 ? (runs.slice(i).find((r) => r.wordIndex !== null)?.wordIndex ?? -1) : -1;
    const s = previous === -1 ? next : previous;
    views.push({ text: run.text, w: -1, s, cls: s >= 0 ? `w ${cls}`.trim() : cls });
  }
  return views;
}

function blockView(block: Block): BlockView {
  const code = block.kind === 'note' && block.runs.some((r) => r.emphasis.includes('code'));
  return {
    id: block.id,
    kind: block.kind,
    level: block.level ?? null,
    cls: `blk k-${block.kind}${block.level === 1 ? ' lvl-1' : ''}${code ? ' is-code' : ''}`,
    runs: block.spoken
      ? runViews(block.runs)
      : block.runs.map((r) => ({
          text: r.text,
          w: -1,
          s: -1,
          cls: r.emphasis.map((e) => `e-${e}`).join(' '),
        })),
  };
}

/**
 * Renders the script from runs (no innerHTML) and keeps the next word on a fixed reading line.
 * Scrolling snaps per line and glides with a CSS transition, so one-word auto steps never move the
 * text and multi-word voice jumps animate instead of teleporting.
 */
@Component({
  selector: 'app-script-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './script-view.html',
  styleUrl: './script-view.scss',
  host: { '[style.font-size.px]': 'store.fontSizePx()' },
})
export class ScriptView {
  protected readonly store = inject(PrompterStore);
  protected readonly i18n = inject(I18n);
  protected readonly blocks = computed(() => this.store.script().blocks.map(blockView));

  private readonly column = viewChild.required<ElementRef<HTMLElement>>('column');
  private readonly track = viewChild.required<ElementRef<HTMLElement>>('track');
  private readonly cue = viewChild.required<ElementRef<HTMLElement>>('cue');
  private readonly mark = viewChild.required<ElementRef<HTMLElement>>('mark');
  private readonly end = viewChild.required<ElementRef<HTMLElement>>('end');

  /** Bumped by ResizeObserver so layout is re-measured on window resize, reflow and font load. */
  private readonly resized = signal(0);
  private lastBlocks: readonly BlockView[] | null = null;
  private lastCueY = Number.NaN;

  constructor() {
    const observer = new ResizeObserver(() => this.resized.update((n) => n + 1));
    afterNextRender(() => {
      observer.observe(this.column().nativeElement);
      observer.observe(this.track().nativeElement);
    });
    inject(DestroyRef).onDestroy(() => observer.disconnect());

    afterRenderEffect({
      earlyRead: (): Layout => {
        this.resized();
        this.store.fontSizePx();
        this.store.mode();
        const blocks = this.blocks();
        const cursor = this.store.cursor();
        const snap = blocks !== this.lastBlocks;
        this.lastBlocks = blocks;

        const line = Math.round(this.column().nativeElement.clientHeight * READING_LINE);
        const track = this.track().nativeElement;
        const word = track.querySelector<HTMLElement>(`[data-w="${cursor}"]`);
        // Rect deltas against the track: independent of nested positioning and of an in-flight transform.
        const origin = track.getBoundingClientRect();
        const box = (word ?? this.end().nativeElement).getBoundingClientRect();
        const y = box.top - origin.top;
        const shift = Math.round(line - (y + box.height / 2));
        const cue = word
          ? { x: box.left - origin.left, y: Math.round(y), w: box.width, h: box.height }
          : null;
        return { line, shift, cue, snap };
      },
      write: (layout) => {
        const { line, shift, cue, snap } = layout();
        const track = this.track().nativeElement;
        track.classList.toggle('is-snap', snap);
        track.style.transform = `translate3d(0, ${shift}px, 0)`;
        this.mark().nativeElement.style.transform = `translate3d(0, ${line}px, 0)`;

        const el = this.cue().nativeElement;
        el.classList.toggle('is-off', !cue);
        if (!cue) return;
        // Glide along a line; jump when the word wraps to another line (the track glide carries the eye).
        el.classList.toggle('is-snap', snap || cue.y !== this.lastCueY);
        this.lastCueY = cue.y;
        el.style.transform = `translate3d(${cue.x}px, ${cue.y}px, 0)`;
        el.style.width = `${cue.w}px`;
        el.style.height = `${cue.h}px`;
      },
    });
  }
}
