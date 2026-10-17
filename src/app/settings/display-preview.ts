import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * A slice of the real overlay — same ink panel, type and cue — at the chosen size and opacity,
 * over a busy pattern so the transparency can be judged while dragging the sliders.
 */
@Component({
  selector: 'app-display-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <div class="panel" [style.--alpha]="opacity()" [style.font-size.px]="fontSize()">
      <span class="mark"></span>
      <p>
        @for (word of words(); track $index) {
          <span [class.read]="$index < 2" [class.now]="$index === 2">{{ word }}</span>
          {{ ' ' }}
        }
      </p>
    </div>
  `,
  styles: `
    :host {
      display: block;
      overflow: hidden;
      border-radius: var(--gl-r-control);
      background:
        linear-gradient(
          115deg,
          transparent 0 30%,
          rgb(255 255 255 / 0.85) 30% 46%,
          transparent 46%
        ),
        repeating-linear-gradient(
          90deg,
          #3b6fd8 0 64px,
          #e0a43a 64px 128px,
          #2e9b6b 128px 192px,
          #d2555a 192px 256px
        );
    }
    .panel {
      position: relative;
      display: flex;
      align-items: center;
      min-height: 96px;
      padding: 0.4em 24px;
      background: rgb(var(--gl-ink) / var(--alpha));
      font-family: var(--gl-font-display);
      font-weight: 500;
      line-height: 1.36;
      letter-spacing: -0.006em;
      color: var(--gl-paper);
      text-shadow: 0 1px 2px rgb(var(--gl-ink) / 0.55);
    }
    .mark {
      position: absolute;
      left: 9px;
      top: 50%;
      margin-top: -6px;
      border-block: 6px solid transparent;
      border-left: 7px solid var(--gl-cue);
    }
    p {
      margin: 0;
      white-space: nowrap;
      overflow: hidden;
      mask-image: linear-gradient(to right, #000 85%, transparent);
    }
    .read {
      color: var(--gl-paper-read);
    }
    .now {
      border-radius: 0.22em;
      margin: 0 -0.14em;
      padding: 0.04em 0.14em;
      background: var(--gl-cue-wash);
      box-shadow: inset 0 -0.05em 0 rgb(242 181 68 / 0.6);
      color: var(--gl-cue-text);
    }
  `,
})
export class DisplayPreview {
  readonly fontSize = input.required<number>();
  readonly opacity = input.required<number>();
  readonly sample = input.required<string>();
  protected readonly words = computed(() => this.sample().split(' '));
}
