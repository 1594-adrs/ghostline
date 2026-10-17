import { ChangeDetectionStrategy, Component } from '@angular/core';

/** The Ghostline mark (same drawing as `public/logo.svg`): a read line fading out, the amber reading line with its cue arrow, the next line. */
@Component({
  selector: 'app-logo-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 64 64">
      <rect width="64" height="64" rx="16" fill="#0C1118" />
      <rect x="19" y="14" width="24" height="7" rx="3.5" fill="#F4F6F8" fill-opacity="0.32" />
      <path d="M8 26.5 15 32l-7 5.5z" fill="#F2B544" />
      <rect x="19" y="28.5" width="34" height="7" rx="3.5" fill="#F2B544" />
      <rect x="19" y="43" width="28" height="7" rx="3.5" fill="#F4F6F8" />
    </svg>
  `,
  styles: `
    :host {
      display: block;
      flex: none;
      width: var(--logo-size, 40px);
      height: var(--logo-size, 40px);
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class LogoMark {}
