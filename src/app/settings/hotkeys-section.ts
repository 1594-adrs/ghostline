import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DEFAULT_HOTKEYS, HOTKEY_ACTIONS, type HotkeyAction } from '../core/contracts';
import { SettingsClient } from '../core/settings-client';
import { I18n } from '../i18n/i18n';
import { isAltGrRisk } from './accelerator';
import { HotkeyRecorder } from './hotkey-recorder';

interface RowMessage {
  readonly tone: 'danger' | 'warn';
  readonly text: string;
}

/** One row per action: name, recorder, and why it may not work (backend conflict, AltGr, duplicate). */
@Component({
  selector: 'app-hotkeys-section',
  imports: [HotkeyRecorder],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="list">
      @for (row of rows(); track row.action) {
        <li class="row">
          <span class="name">{{ row.label }}</span>
          <app-hotkey-recorder
            [accelerator]="row.accelerator"
            [actionLabel]="row.label"
            (recorded)="assign(row.action, $event)"
          />
          @for (m of row.messages; track $index) {
            <p class="msg" [class]="m.tone">
              <svg viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8 1.8 15 14H1z" />
                <path d="M8 6v4M8 11.6v.4" class="mark" />
              </svg>
              {{ m.text }}
            </p>
          }
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    .list {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: center;
      column-gap: var(--gl-4);
      padding: var(--gl-1) 0;
      border-top: 1px solid var(--s-line);
    }
    .row:first-child {
      border-top: 0;
    }
    .name {
      font-size: var(--gl-size-sm);
    }
    .msg {
      grid-column: 1 / -1;
      display: flex;
      gap: var(--gl-2);
      margin: 0 0 var(--gl-2);
      padding: var(--gl-2) var(--gl-3);
      border-radius: var(--gl-r-control);
      font-size: var(--gl-size-xs);
      line-height: 1.45;
    }
    .msg svg {
      flex: none;
      width: 14px;
      height: 14px;
      margin-top: 1px;
      fill: currentColor;
    }
    .msg .mark {
      fill: none;
      stroke: var(--s-bg);
      stroke-width: 1.6;
      stroke-linecap: round;
    }
    .warn {
      background: var(--s-warn-wash);
      color: var(--s-warn);
    }
    .danger {
      background: var(--s-danger-wash);
      color: var(--s-danger);
    }
  `,
})
export class HotkeysSection {
  private readonly client = inject(SettingsClient);
  private readonly i18n = inject(I18n);

  protected readonly rows = computed(() => {
    const hotkeys = this.client.settings().hotkeys;
    const conflicts = this.client.conflicts();
    return HOTKEY_ACTIONS.map((action) => {
      const accelerator = hotkeys[action] ?? DEFAULT_HOTKEYS[action];
      const messages: RowMessage[] = conflicts
        .filter((c) => c.action === action)
        .map((c) => ({ tone: 'danger', text: c.reason }));
      if (isAltGrRisk(accelerator))
        messages.push({ tone: 'warn', text: this.i18n.t('hotkeys.altgr') });
      const twin = HOTKEY_ACTIONS.find(
        (other) => other !== action && hotkeys[other]?.toLowerCase() === accelerator.toLowerCase(),
      );
      if (twin) {
        messages.push({
          tone: 'warn',
          text: this.i18n.t('hotkeys.duplicate', { action: this.i18n.t(`hotkey.${twin}`) }),
        });
      }
      return { action, label: this.i18n.t(`hotkey.${action}`), accelerator, messages };
    });
  });

  protected assign(action: HotkeyAction, accelerator: string): void {
    void this.client.update({
      hotkeys: { ...this.client.settings().hotkeys, [action]: accelerator },
    });
  }
}
