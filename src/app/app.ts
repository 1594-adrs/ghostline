import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { SettingsClient } from './core/settings-client';
import { I18n } from './i18n/i18n';
import { Overlay } from './overlay/overlay';
import { OverlayController } from './prompter/overlay-controller';
import { SettingsPage } from './settings/settings-page';

/** One bundle, two Tauri windows: the window label decides which view boots (`?view=` in a plain browser preview). */
@Component({
  selector: 'app-root',
  imports: [Overlay, SettingsPage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (view === 'settings') {
      <app-settings-page />
    } @else {
      <app-overlay />
    }
  `,
})
export class App {
  protected readonly view = isTauri()
    ? getCurrentWindow().label
    : new URLSearchParams(location.search).get('view');

  constructor() {
    const client = inject(SettingsClient);
    const i18n = inject(I18n);
    effect(() => i18n.language.set(client.settings().language));
    if (!isTauri()) return;
    const controller = this.view === 'settings' ? null : inject(OverlayController);
    void client
      .init()
      .then(() => controller?.start())
      .catch((e: unknown) => client.lastError.set(String(e)));
  }
}
