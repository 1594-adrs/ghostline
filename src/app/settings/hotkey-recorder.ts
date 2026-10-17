import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { I18n } from '../i18n/i18n';
import { recordKey } from './accelerator';
import { acceleratorLabel, Keycaps } from './keycaps';

/**
 * Button that shows an accelerator as key caps; Enter/Space/click starts recording, the next combo
 * with a modifier is emitted as a Tauri accelerator. Esc cancels, Tab leaves.
 */
@Component({
  selector: 'app-hotkey-recorder',
  imports: [Keycaps],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="rec"
      [class.is-recording]="recording()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-pressed]="recording()"
      (click)="start()"
      (keydown)="onKey($event)"
      (blur)="stop()"
    >
      @if (recording()) {
        <span class="live">{{ partial() || i18n.t('hotkeys.recording') }}</span>
        <span class="esc">{{ i18n.t('hotkeys.recording.hint') }}</span>
      } @else {
        <app-keycaps [accelerator]="accelerator()" />
      }
    </button>
    <span class="status" role="status">{{ error() }}</span>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: var(--gl-1);
    }
    .rec {
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      gap: var(--gl-2);
      min-width: 168px;
      min-height: 36px;
      margin-right: calc(-1 * var(--gl-2));
      padding: 0 var(--gl-2);
      border: 1px dashed transparent;
      border-radius: var(--gl-r-control);
      background: transparent;
      cursor: pointer;
      transition:
        background-color 120ms,
        border-color 120ms;
    }
    .rec:hover {
      border-color: var(--s-line-strong);
      background: var(--s-raised);
    }
    .rec.is-recording {
      border-style: solid;
      border-color: var(--s-accent);
      background: var(--s-accent-wash);
    }
    .live {
      font-size: var(--gl-size-sm);
      font-weight: 600;
      color: var(--s-text);
    }
    .esc {
      font-size: var(--gl-size-xs);
      color: var(--s-muted);
    }
    .status:empty {
      display: none;
    }
    .status {
      max-width: 240px;
      font-size: var(--gl-size-xs);
      text-align: right;
      color: var(--s-danger);
    }
  `,
})
export class HotkeyRecorder {
  readonly accelerator = input.required<string>();
  /** Human name of the action, for the accessible label. */
  readonly actionLabel = input.required<string>();
  readonly recorded = output<string>();

  protected readonly i18n = inject(I18n);
  protected readonly recording = signal(false);
  protected readonly partial = signal('');
  protected readonly error = signal('');

  protected readonly ariaLabel = computed(() =>
    this.recording()
      ? `${this.i18n.t('hotkeys.recording')} ${this.i18n.t('hotkeys.recording.hint')}`
      : this.i18n.t('hotkeys.record', {
          action: this.actionLabel(),
          combo: acceleratorLabel(this.accelerator(), this.i18n),
        }),
  );

  protected start(): void {
    if (this.recording()) return;
    this.recording.set(true);
    this.partial.set('');
    this.error.set('');
  }

  protected stop(): void {
    this.recording.set(false);
    this.partial.set('');
  }

  protected onKey(event: KeyboardEvent): void {
    if (!this.recording()) return;
    const bare = !event.ctrlKey && !event.altKey && !event.shiftKey && !event.metaKey;
    if (bare && event.key === 'Tab') return this.stop();
    event.preventDefault();
    event.stopPropagation();
    if (bare && event.key === 'Escape') return this.stop();

    const result = recordKey(event);
    switch (result.kind) {
      case 'pending':
        this.partial.set(result.partial ? `${result.partial}+…` : '');
        return;
      case 'needs-modifier':
        this.error.set(this.i18n.t('hotkeys.needsModifier'));
        return;
      case 'unsupported':
        this.error.set(this.i18n.t('hotkeys.unsupported'));
        return;
      case 'ok':
        this.error.set('');
        this.stop();
        this.recorded.emit(result.accelerator);
    }
  }
}
