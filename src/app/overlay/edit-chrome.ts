import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { HOTKEY_ACTIONS } from '../core/contracts';
import { SettingsClient } from '../core/settings-client';
import { I18n } from '../i18n/i18n';
import { Keycaps } from '../settings/keycaps';

type ResizeDirection = Parameters<ReturnType<typeof getCurrentWindow>['startResizeDragging']>[0];

const GRIPS: readonly { dir: ResizeDirection; cls: string }[] = [
  { dir: 'North', cls: 'n' },
  { dir: 'South', cls: 's' },
  { dir: 'East', cls: 'e' },
  { dir: 'West', cls: 'w' },
  { dir: 'NorthWest', cls: 'nw' },
  { dir: 'NorthEast', cls: 'ne' },
  { dir: 'SouthWest', cls: 'sw' },
  { dir: 'SouthEast', cls: 'se' },
];

/**
 * Edit mode only (the window accepts the pointer): amber frame, drag bar, resize grips and a
 * hotkey sheet over the dimmed text. The whole surface except the grips drags the window.
 */
@Component({
  selector: 'app-edit-chrome',
  imports: [Keycaps],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar" data-tauri-drag-region>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path
          d="M6 1v10M1 6h10M6 1 4.5 2.5M6 1l1.5 1.5M6 11l-1.5-1.5M6 11l1.5-1.5M1 6l1.5-1.5M1 6l1.5 1.5M11 6 9.5 4.5M11 6 9.5 7.5"
        />
      </svg>
      <span>{{ i18n.t('overlay.edit.drag') }}</span>
      <span class="done">{{ i18n.t('overlay.edit.done') }}</span>
      <app-keycaps [accelerator]="hotkeys()['toggle-edit']" />
    </div>

    <section
      class="sheet"
      data-tauri-drag-region
      [attr.aria-label]="i18n.t('overlay.edit.hotkeys')"
    >
      <dl>
        @for (row of rows(); track row.action) {
          <div class="row">
            <dt>{{ row.label }}</dt>
            <dd><app-keycaps [accelerator]="row.accelerator" /></dd>
          </div>
        }
      </dl>
    </section>

    @for (g of grips; track g.dir) {
      <span class="grip" [class]="g.cls" (pointerdown)="resize($event, g.dir)"></span>
    }
  `,
  styleUrl: './edit-chrome.scss',
})
export class EditChrome {
  protected readonly i18n = inject(I18n);
  private readonly settings = inject(SettingsClient);
  protected readonly grips = GRIPS;
  protected readonly hotkeys = computed(() => this.settings.settings().hotkeys);

  protected readonly rows = computed(() =>
    HOTKEY_ACTIONS.map((action) => ({
      action,
      label: this.i18n.t(`hotkey.${action}`),
      accelerator: this.hotkeys()[action],
    })),
  );

  protected resize(event: PointerEvent, dir: ResizeDirection): void {
    if (event.button !== 0 || !isTauri()) return;
    event.preventDefault();
    void getCurrentWindow().startResizeDragging(dir);
  }
}
