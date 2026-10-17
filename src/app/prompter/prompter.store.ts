import { computed, Injectable, signal } from '@angular/core';
import type {
  FollowSource,
  OverlayMode,
  PrompterState,
  Script,
  ScriptFile,
} from '../core/contracts';
import { parseScript } from '../script/parse-script';

export const EMPTY_SCRIPT: Script = { meta: {}, blocks: [], words: [], sections: [] };
export const MIN_WPM = 60;
export const MAX_WPM = 300;
/** Same bounds as the Rust settings sanitizer. */
export const MIN_FONT_PX = 12;
export const MAX_FONT_PX = 160;
export const WPM_STEP = 10;
const MODES: readonly OverlayMode[] = ['corner', 'strip', 'full'];

/** Prompter state for the overlay window. Pure state + transitions; IPC and timers live in the controller. */
@Injectable({ providedIn: 'root' })
export class PrompterStore {
  readonly script = signal<Script>(EMPTY_SCRIPT);
  readonly fileName = signal<string | null>(null);
  readonly cursor = signal(0);
  readonly playing = signal(false);
  readonly follow = signal<FollowSource>('auto');
  readonly speedWpm = signal(140);
  readonly mode = signal<OverlayMode>('corner');
  readonly editMode = signal(false);
  readonly visible = signal(true);
  readonly fontSizePx = signal(32);
  readonly opacity = signal(0.75);

  /** Fractional words accumulated by auto-scroll between whole-word steps. */
  private carry = 0;

  /** Block holding the next word to read; the last block once the script is finished. */
  readonly currentBlockId = computed(() => {
    const { words, blocks } = this.script();
    return words[this.cursor()]?.blockId ?? blocks.at(-1)?.id ?? -1;
  });

  /** Section index holding the cursor, -1 before the first heading. */
  readonly currentSection = computed(() => {
    const cursor = this.cursor();
    let current = -1;
    for (const s of this.script().sections) if (s.firstWord <= cursor) current = s.index;
    return current;
  });

  /** 0..1 */
  readonly progress = computed(() => {
    const total = this.script().words.length;
    return total === 0 ? 0 : this.cursor() / total;
  });

  readonly finished = computed(() => this.cursor() >= this.script().words.length);

  readonly state = computed<PrompterState>(() => ({
    cursor: this.cursor(),
    playing: this.playing(),
    follow: this.follow(),
    speedWpm: this.speedWpm(),
    mode: this.mode(),
    editMode: this.editMode(),
    visible: this.visible(),
  }));

  /**
   * `keepPosition` is for hot reload of the same file: the cursor is clamped instead of reset.
   * `defaults` (the user's settings) apply when the script has no frontmatter value, so one script's
   * `speed` doesn't leak into the next.
   */
  loadScript(
    file: ScriptFile,
    keepPosition = false,
    defaults?: { speedWpm: number; fontSizePx: number },
  ): void {
    const script = parseScript(file.content, file.format);
    this.script.set(script);
    this.fileName.set(file.name);
    this.carry = 0;
    if (!keepPosition) {
      this.cursor.set(0);
      this.playing.set(false);
      const speed = script.meta.speed ?? defaults?.speedWpm;
      const fontSize = script.meta.fontSize ?? defaults?.fontSizePx;
      if (speed) this.setSpeed(speed);
      if (fontSize)
        this.fontSizePx.set(Math.max(MIN_FONT_PX, Math.min(MAX_FONT_PX, Math.round(fontSize))));
    } else {
      this.setCursor(this.cursor());
    }
  }

  setCursor(index: number): void {
    this.cursor.set(Math.max(0, Math.min(Math.round(index), this.script().words.length)));
    this.carry = 0;
  }

  togglePlay(): void {
    this.playing.update((p) => !p && !this.finished());
  }

  setFollow(follow: FollowSource): void {
    this.follow.set(follow);
    this.carry = 0;
  }

  setSpeed(wpm: number): void {
    this.speedWpm.set(Math.max(MIN_WPM, Math.min(MAX_WPM, Math.round(wpm))));
  }

  speedUp(): void {
    this.setSpeed(this.speedWpm() + WPM_STEP);
  }

  speedDown(): void {
    this.setSpeed(this.speedWpm() - WPM_STEP);
  }

  /** Auto-scroll tick: advances `speedWpm` words per minute of elapsed time. Stops at the end. */
  advanceBy(elapsedMs: number): void {
    if (!this.playing() || this.follow() !== 'auto' || elapsedMs <= 0) return;
    this.carry += (this.speedWpm() / 60_000) * elapsedMs;
    const whole = Math.floor(this.carry);
    if (whole > 0) {
      this.carry -= whole;
      this.cursor.update((c) => Math.min(c + whole, this.script().words.length));
    }
    if (this.finished()) this.playing.set(false);
  }

  nextBlock(): void {
    const { words } = this.script();
    const block = this.currentBlockId();
    const next = words.findIndex((w, i) => i >= this.cursor() && w.blockId !== block);
    this.setCursor(next === -1 ? words.length : next);
  }

  /** To the start of the current block, or of the previous one if already at its start. */
  prevBlock(): void {
    const { words } = this.script();
    const cursor = Math.min(this.cursor(), words.length - 1);
    if (cursor < 0) return;
    let start = cursor;
    while (start > 0 && words[start - 1].blockId === words[cursor].blockId) start--;
    if (start < this.cursor()) return this.setCursor(start);
    if (start === 0) return this.setCursor(0);
    let prev = start - 1;
    while (prev > 0 && words[prev - 1].blockId === words[start - 1].blockId) prev--;
    this.setCursor(prev);
  }

  nextSection(): void {
    const next = this.script().sections.find((s) => s.firstWord > this.cursor());
    if (next) this.setCursor(next.firstWord);
  }

  /** To the start of the current section, or of the previous one if already at its start. */
  prevSection(): void {
    const starts = this.script()
      .sections.map((s) => s.firstWord)
      .filter((w) => w < this.cursor());
    this.setCursor(starts.at(-1) ?? 0);
  }

  cycleMode(): OverlayMode {
    const next = MODES[(MODES.indexOf(this.mode()) + 1) % MODES.length];
    this.mode.set(next);
    return next;
  }
}
