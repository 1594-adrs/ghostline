import { isTauri } from '@tauri-apps/api/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  inject,
  input,
} from '@angular/core';
import { SettingsClient } from '../core/settings-client';
import { DemoBackdrop } from '../dev/demo-backdrop';
import { demoParams, type DemoOptions, startDemo } from '../dev/demo';
import { I18n } from '../i18n/i18n';
import { OverlayController } from '../prompter/overlay-controller';
import { PrompterStore } from '../prompter/prompter.store';
import { EditChrome } from './edit-chrome';
import { LogoMark } from './logo-mark';
import { OverlayHud } from './overlay-hud';
import { ScriptView } from './script-view';

/**
 * The prompter window: transparent, always on top, click-through outside edit mode.
 * One component, three layouts keyed by `data-mode` (corner / strip / full).
 */
@Component({
  selector: 'app-overlay',
  imports: [ScriptView, OverlayHud, EditChrome, DemoBackdrop, LogoMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-mode]': 'store.mode()',
    '[class.is-edit]': 'store.editMode()',
    '[style.--sv-font]': 'store.fontSizePx() + "px"',
  },
  template: `
    @if (demo; as d) {
      <app-demo-backdrop [tone]="d.backdrop" />
    }
    @if (store.visible()) {
      <main class="panel" [style.--panel-alpha]="store.opacity()">
        @if (hasScript()) {
          <app-script-view />
          <app-overlay-hud [listening]="micLive()" [confidence]="micConfidence()" />
        } @else {
          <div class="empty">
            <app-logo-mark />
            <div>
              <p class="empty-title">{{ i18n.t('overlay.empty.title') }}</p>
              <p class="empty-body">{{ i18n.t('overlay.empty.body') }}</p>
            </div>
          </div>
        }
        @if (store.editMode()) {
          <app-edit-chrome />
        }
      </main>
    }
  `,
  styleUrl: './overlay.scss',
})
export class Overlay {
  /** Speech recognition is capturing audio. Controller-provided. */
  readonly listening = input(false);
  /** Latest `SpeechFollower` confidence 0..1, null when unknown. Controller-provided. */
  readonly confidence = input<number | null>(null);

  protected readonly store = inject(PrompterStore);
  protected readonly i18n = inject(I18n);
  protected readonly hasScript = computed(() => this.store.script().blocks.length > 0);
  protected readonly demo: DemoOptions | null;

  private readonly follower = isTauri() ? inject(OverlayController).follower : null;
  protected readonly micLive = computed(
    () => this.listening() || (this.follower?.listening() ?? false),
  );
  protected readonly micConfidence = computed(
    () => this.confidence() ?? this.follower?.confidence() ?? null,
  );

  constructor() {
    const settings = inject(SettingsClient);
    const doc = inject(DOCUMENT);
    // App syncs I18n.language; the document language is this window's job.
    effect(() => (doc.documentElement.lang = settings.settings().language));
    const params = demoParams();
    this.demo = params ? startDemo(params) : null;
  }
}
