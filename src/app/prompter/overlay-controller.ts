import {
  computed,
  DestroyRef,
  effect,
  inject,
  Injectable,
  untracked,
  type WritableSignal,
} from '@angular/core';
import type { HotkeyAction } from '../core/contracts';
import { invoke, listen } from '../core/ipc';
import { SettingsClient } from '../core/settings-client';
import { SpeechFollower } from '../speech/speech-follower';
import { PrompterStore } from './prompter.store';

/**
 * Glue for the overlay window (Tauri only): settings → store, script loading + hot reload,
 * global hotkeys → store transitions, and the auto-scroll clock.
 */
@Injectable({ providedIn: 'root' })
export class OverlayController {
  private readonly store = inject(PrompterStore);
  private readonly client = inject(SettingsClient);
  private readonly destroyRef = inject(DestroyRef);
  readonly follower = inject(SpeechFollower);

  // Per-field computeds so an effect only re-applies the setting that actually changed
  // (a script's own `speed` frontmatter survives unrelated settings updates).
  private readonly speedWpm = computed(() => this.client.settings().speedWpm);
  private readonly fontSizePx = computed(() => this.client.settings().fontSizePx);
  private readonly opacity = computed(() => this.client.settings().opacity);
  private readonly mode = computed(() => this.client.settings().mode);
  private readonly scriptPath = computed(() => this.client.settings().lastScriptPath);

  private frame = 0;
  private lastTick = 0;

  constructor() {
    effect(() => this.store.setSpeed(this.speedWpm()));
    effect(() => this.store.fontSizePx.set(this.fontSizePx()));
    effect(() => this.store.opacity.set(this.opacity()));
    effect(() => this.store.mode.set(this.mode()));
    effect(() => {
      const path = this.scriptPath();
      if (path) untracked(() => void this.load(path, false));
    });
    effect(() => (this.store.playing() ? this.startClock() : this.stopClock()));
    // advanceBy stops at the end in auto mode; voice needs the same.
    effect(() => {
      if (this.store.finished()) untracked(() => this.store.playing.set(false));
    });
    this.destroyRef.onDestroy(() => this.stopClock());
  }

  async start(): Promise<void> {
    await listen('hotkey', ({ action }) => this.dispatch(action));
    await listen('script-changed', ({ path }) => void this.load(path, true));
  }

  private async load(path: string, keepPosition: boolean): Promise<void> {
    try {
      const file = await invoke('read_script', { path });
      this.store.loadScript(file, keepPosition, {
        speedWpm: this.speedWpm(),
        fontSizePx: this.fontSizePx(),
      });
      if (!keepPosition) await invoke('watch_script', { path });
    } catch (e) {
      this.client.lastError.set(String(e));
    }
  }

  private dispatch(action: HotkeyAction): void {
    const s = this.store;
    switch (action) {
      case 'toggle-play':
        return s.togglePlay();
      case 'prev-block':
        return s.prevBlock();
      case 'next-block':
        return s.nextBlock();
      case 'speed-down':
        return s.speedDown();
      case 'speed-up':
        return s.speedUp();
      case 'prev-section':
        return s.prevSection();
      case 'next-section':
        return s.nextSection();
      case 'toggle-visible':
        return void this.toggleWindowFlag(s.visible, (visible) =>
          invoke('set_visible', { visible }),
        );
      case 'toggle-edit':
        return void this.toggleWindowFlag(s.editMode, (enabled) =>
          invoke('set_edit_mode', { enabled }),
        );
      case 'toggle-voice':
        return void this.toggleVoice();
      case 'cycle-mode':
        return void this.client.update({ mode: s.cycleMode() });
      case 'toggle-capture':
        return void this.client.update({ captureHidden: !this.client.settings().captureHidden });
    }
  }

  /** Flip the signal first so the UI reacts at once; undo it if the window refused. */
  private async toggleWindowFlag(
    flag: WritableSignal<boolean>,
    apply: (value: boolean) => Promise<unknown>,
  ): Promise<void> {
    const value = !flag();
    flag.set(value);
    try {
      await apply(value);
    } catch (e) {
      flag.set(!value);
      this.client.lastError.set(String(e));
    }
  }

  private async toggleVoice(): Promise<void> {
    const voice = this.store.follow() !== 'voice';
    this.store.setFollow(voice ? 'voice' : 'auto');
    try {
      await (voice ? this.follower.start() : this.follower.stop());
    } catch (e) {
      // e.g. model not installed or mic blocked: fall back to auto-scroll and tell the user.
      this.store.setFollow('auto');
      this.client.lastError.set(String(e));
      // The fix (install the model, pick a mic) lives in Settings.
      if (voice) void invoke('show_settings_window').catch(() => undefined);
    }
  }

  private startClock(): void {
    if (this.frame) return;
    this.lastTick = performance.now();
    const tick = (now: number) => {
      // rAF pauses while the window is hidden; cap the gap so showing it again doesn't jump ahead.
      this.store.advanceBy(Math.min(now - this.lastTick, 250));
      this.lastTick = now;
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private stopClock(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }
}
