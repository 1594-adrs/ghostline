import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../i18n/i18n';
import { PrompterStore } from '../prompter/prompter.store';

const METER_BARS = [0.25, 0.5, 0.75, 1] as const;

/** Status line under the text: play state, follow source (+ mic and confidence), speed, section, progress. */
@Component({
  selector: 'app-overlay-hud',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="item state" [class.is-on]="store.playing()">
      @if (store.playing()) {
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.8v8.4L10 6z" /></svg>
      } @else {
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 2h2v8H3zM7 2h2v8H7z" />
        </svg>
      }
      {{ stateLabel() }}
    </span>

    @if (store.follow() === 'voice') {
      <span class="item follow" [class.is-live]="listening()">
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <rect x="4" y="1" width="4" height="6.5" rx="2" />
          <path d="M2.5 6a3.5 3.5 0 0 0 7 0M6 9.5V11" fill="none" stroke="currentColor" />
        </svg>
        {{ listening() ? i18n.t('hud.voice') : i18n.t('hud.micOff') }}
        @if (confidence() !== null && listening()) {
          <span class="meter" role="img" [attr.aria-label]="confidenceLabel()">
            @for (bar of bars; track bar) {
              <i [class.is-lit]="(confidence() ?? 0) >= bar"></i>
            }
          </span>
        }
      </span>
    } @else {
      <span class="item">{{ i18n.t('hud.auto') }}</span>
      <span class="item num">
        {{ store.speedWpm() }}<span class="unit">{{ i18n.t('hud.wpmUnit') }}</span>
      </span>
    }

    <span class="item section">{{ sectionTitle() }}</span>
    <span class="item num">{{ i18n.t('unit.pct', { n: percent() }) }}</span>

    <span class="progress" aria-hidden="true"
      ><i [style.transform]="'scaleX(' + store.progress() + ')'"></i
    ></span>
  `,
  styles: `
    /* Not positioned: the progress line anchors to the panel and spans its full width. */
    :host {
      display: flex;
      align-items: center;
      gap: var(--gl-4);
      flex: none;
      height: 30px;
      padding: 0 var(--sv-gutter, 24px) 2px;
      font-family: var(--gl-font-small);
      font-size: var(--gl-size-xs);
      line-height: 1;
      color: var(--gl-paper-muted);
      white-space: nowrap;
    }
    .item {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }
    svg {
      width: 11px;
      height: 11px;
      fill: currentColor;
      stroke-width: 1.2;
    }
    .state.is-on {
      color: var(--gl-paper);
    }
    .state.is-on svg {
      color: var(--gl-cue);
    }
    .follow.is-live svg {
      color: var(--gl-live);
    }
    .num {
      font-variant-numeric: tabular-nums;
    }
    .unit {
      margin-left: 3px;
      opacity: 0.75;
    }
    .section {
      flex: 1;
      min-width: 0;
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .meter {
      display: inline-flex;
      align-items: flex-end;
      gap: 2px;
      height: 10px;
      margin-left: 2px;
    }
    .meter i {
      width: 3px;
      border-radius: 1px;
      background: rgb(244 246 248 / 0.25);
    }
    .meter i:nth-child(1) {
      height: 4px;
    }
    .meter i:nth-child(2) {
      height: 6px;
    }
    .meter i:nth-child(3) {
      height: 8px;
    }
    .meter i:nth-child(4) {
      height: 10px;
    }
    .meter i.is-lit {
      background: var(--gl-paper);
    }
    .progress {
      position: absolute;
      inset: auto 0 0;
      height: 2px;
      background: rgb(244 246 248 / 0.1);
    }
    .progress i {
      display: block;
      height: 100%;
      background: var(--gl-cue);
      transform-origin: left;
      transition: transform var(--gl-scroll-ms) var(--gl-ease);
    }
  `,
})
export class OverlayHud {
  /** Speech recognition is capturing audio (controller-provided). */
  readonly listening = input(false);
  /** Latest `SpeechFollower` confidence 0..1; null hides the meter. */
  readonly confidence = input<number | null>(null);

  protected readonly store = inject(PrompterStore);
  protected readonly i18n = inject(I18n);
  protected readonly bars = METER_BARS;

  protected readonly percent = computed(() => Math.round(this.store.progress() * 100));

  protected readonly stateLabel = computed(() =>
    this.i18n.t(
      this.store.playing() ? 'hud.playing' : this.store.finished() ? 'hud.finished' : 'hud.paused',
    ),
  );

  protected readonly sectionTitle = computed(() => {
    const { sections, meta } = this.store.script();
    return (
      sections[this.store.currentSection()]?.title ?? meta.title ?? this.store.fileName() ?? ''
    );
  });

  protected readonly confidenceLabel = computed(() =>
    this.i18n.t('hud.confidence', { pct: Math.round((this.confidence() ?? 0) * 100) }),
  );
}
