import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DOCUMENT,
  effect,
  ElementRef,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { DEFAULT_HOTKEYS, type Language, type OverlayMode } from '../core/contracts';
import { SettingsClient } from '../core/settings-client';
import { I18n, type MessageKey } from '../i18n/i18n';
import { LogoMark } from '../overlay/logo-mark';
import { MAX_WPM, MIN_WPM, WPM_STEP } from '../prompter/prompter.store';
import { DisplayPreview } from './display-preview';
import { HotkeysSection } from './hotkeys-section';

type SectionId = 'script' | 'display' | 'voice' | 'hotkeys' | 'privacy' | 'language';

const SECTIONS: readonly { id: SectionId; title: MessageKey }[] = [
  { id: 'script', title: 'script.title' },
  { id: 'display', title: 'display.title' },
  { id: 'voice', title: 'voice.title' },
  { id: 'hotkeys', title: 'hotkeys.title' },
  { id: 'privacy', title: 'privacy.title' },
  { id: 'language', title: 'language.title' },
];

const MODES: readonly { id: OverlayMode; name: MessageKey; hint: MessageKey }[] = [
  { id: 'corner', name: 'display.mode.corner', hint: 'display.mode.corner.hint' },
  { id: 'strip', name: 'display.mode.strip', hint: 'display.mode.strip.hint' },
  { id: 'full', name: 'display.mode.full', hint: 'display.mode.full.hint' },
];

export const FONT_RANGE = { min: 18, max: 96, step: 2 } as const;
export const OPACITY_RANGE = { min: 20, max: 100, step: 5 } as const;
export const SPEED_RANGE = { min: MIN_WPM, max: MAX_WPM, step: WPM_STEP } as const;

const MB = 1024 * 1024;

/** Settings window. Every change goes through `SettingsClient.update`; sliders preview locally and commit on release. */
@Component({
  selector: 'app-settings-page',
  imports: [LogoMark, DisplayPreview, HotkeysSection],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'gl-settings',
    '(window:scroll)': 'spy()',
    '(window:wheel)': 'unpin()',
    '(window:touchstart)': 'unpin()',
    '(window:keydown)': 'unpin()',
  },
  templateUrl: './settings-page.html',
  styleUrl: './settings-page.scss',
})
export class SettingsPage {
  protected readonly client = inject(SettingsClient);
  protected readonly i18n = inject(I18n);
  protected readonly sections = SECTIONS;
  protected readonly modes = MODES;
  protected readonly fontRange = FONT_RANGE;
  protected readonly opacityRange = OPACITY_RANGE;
  protected readonly speedRange = SPEED_RANGE;
  protected readonly active = signal<SectionId>('script');

  protected readonly settings = this.client.settings;
  /** Live slider values; reset from settings whenever they change. */
  protected readonly fontDraft = linkedSignal(() => this.settings().fontSizePx);
  protected readonly opacityDraft = linkedSignal(() => Math.round(this.settings().opacity * 100));
  protected readonly speedDraft = linkedSignal(() => this.settings().speedWpm);

  protected readonly scriptPath = computed(() => this.settings().lastScriptPath);
  protected readonly scriptName = computed(() => this.scriptPath()?.split(/[\\/]/).pop() ?? null);
  /** Language names are written in their own language, never translated. */
  protected readonly languages: readonly { id: Language; name: string }[] = [
    { id: 'es', name: 'Español' },
    { id: 'en', name: 'English' },
  ];

  protected readonly installing = computed(() => this.client.modelProgress() !== null);
  protected readonly progressRatio = computed(() => {
    const p = this.client.modelProgress();
    return p?.total ? p.received / p.total : null;
  });
  protected readonly progressText = computed(() => {
    const p = this.client.modelProgress();
    if (!p) return '';
    const received = (p.received / MB).toFixed(1);
    return p.total
      ? this.i18n.t('voice.model.progress', { received, total: (p.total / MB).toFixed(1) })
      : this.i18n.t('voice.model.progressUnknown', { received });
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private pinned = false;
  private readonly reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor() {
    const doc = inject(DOCUMENT);
    // App syncs I18n.language; the document language is this window's job.
    effect(() => (doc.documentElement.lang = this.settings().language));
    void this.client.refreshDevices();
  }

  /** Scroll spy: the last section whose top crossed the upper third, or the last one at the page end. */
  protected spy(): void {
    if (this.pinned) return;
    const doc = this.host.nativeElement.ownerDocument;
    const view = doc.defaultView!;
    const atEnd = view.scrollY + view.innerHeight >= doc.documentElement.scrollHeight - 2;
    let current = SECTIONS[0].id;
    for (const s of this.host.nativeElement.querySelectorAll<HTMLElement>('section[id]')) {
      if (atEnd || s.getBoundingClientRect().top <= view.innerHeight / 3)
        current = s.id as SectionId;
    }
    this.active.set(current);
  }

  /** After a nav click the clicked section stays current until the user scrolls by hand. */
  protected unpin(): void {
    this.pinned = false;
  }

  protected go(id: SectionId): void {
    const section = this.host.nativeElement.querySelector<HTMLElement>(`#${id}`);
    section?.scrollIntoView({ behavior: this.reducedMotion.matches ? 'auto' : 'smooth' });
    section?.querySelector<HTMLElement>('h2')?.focus({ preventScroll: true });
    this.active.set(id);
    this.pinned = true;
  }

  protected fill(value: number, range: { min: number; max: number }): string {
    return `${((value - range.min) / (range.max - range.min)) * 100}%`;
  }

  protected numberOf(event: Event): number {
    return Number((event.target as HTMLInputElement).value);
  }

  protected save(patch: Parameters<SettingsClient['update']>[0]): void {
    void this.client.update(patch);
  }

  protected setLanguage(language: Language): void {
    this.save({ language });
  }

  protected installModel(): void {
    void this.client.installVoiceModel();
  }

  protected setMic(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.save({ micDevice: value === '' ? null : value });
  }

  protected resetHotkeys(): void {
    this.save({ hotkeys: DEFAULT_HOTKEYS });
  }
}
