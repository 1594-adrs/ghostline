import { Injectable, signal } from '@angular/core';
import type { Language } from '../core/contracts';
import { EN } from './en';
import { ES, type Dictionary } from './es';

export type MessageKey = keyof Dictionary;

const DICTIONARIES: Record<Language, Dictionary> = { es: ES, en: EN };

// shortcut: runtime dictionary instead of Angular's compiled i18n; switch if more than ~3 languages are needed.
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly language = signal<Language>('es');

  /** `{name}` placeholders are replaced from `params`. Reads `language`, so it is reactive inside templates/computed. */
  t(key: MessageKey, params?: Record<string, string | number>): string {
    const text = DICTIONARIES[this.language()][key];
    return params ? text.replace(/\{(\w+)\}/g, (m, p: string) => String(params[p] ?? m)) : text;
  }
}
