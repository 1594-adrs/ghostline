import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { I18n } from '../i18n/i18n';
import { acceleratorParts, keyLabel } from './accelerator';

/** Renders an accelerator as key caps. Colours come from `--kc-*` so it works on the overlay and in settings. */
@Component({
  selector: 'app-keycaps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (key of keys(); track $index) {
      <kbd>{{ key }}</kbd>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex-wrap: wrap;
      gap: 3px;
      font-family: var(--gl-font-small);
      font-size: var(--gl-size-xs);
      line-height: 1;
    }
    kbd {
      display: inline-grid;
      place-items: center;
      min-width: 22px;
      height: 22px;
      padding: 0 6px;
      border: 1px solid var(--kc-line, var(--s-line-strong));
      border-bottom-width: 2px;
      border-radius: var(--gl-r-chip);
      background: var(--kc-bg, var(--s-bg));
      color: var(--kc-text, var(--s-text));
      font: inherit;
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class Keycaps {
  readonly accelerator = input.required<string>();
  private readonly i18n = inject(I18n);

  protected readonly keys = computed(() =>
    acceleratorParts(this.accelerator()).map((part) =>
      keyLabel(part, (k) => this.i18n.t(`key.${k}`)),
    ),
  );
}

/** Same labels as text, for aria-labels: "Ctrl Alt F7". */
export function acceleratorLabel(accelerator: string, i18n: I18n): string {
  return acceleratorParts(accelerator)
    .map((part) => keyLabel(part, (k) => i18n.t(`key.${k}`)))
    .join(' ');
}
