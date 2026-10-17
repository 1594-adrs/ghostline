import { DestroyRef, inject } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';
import type { OverlayMode } from '../core/contracts';
import { PrompterStore } from '../prompter/prompter.store';
import { DEMO_SCRIPT } from './demo-script';

export type DemoBackdropTone = 'dark' | 'bright' | 'none';

export interface DemoOptions {
  readonly backdrop: DemoBackdropTone;
}

const MODES: readonly OverlayMode[] = ['corner', 'strip', 'full'];

/**
 * Browser preview only (`!isTauri()` and `?demo=1`). Query params:
 * `mode=corner|strip|full`, `bg=dark|bright|none`, `at=<word>`, `paused=1`, `edit=1`, `empty=1`,
 * `follow=voice`, `opacity=0.2..1`, `font=<px>`, `hidden=1`.
 */
export function demoParams(): URLSearchParams | null {
  if (isTauri()) return null;
  const params = new URLSearchParams(location.search);
  return params.get('demo') === '1' ? params : null;
}

/** Loads the demo script and runs the auto-scroll loop the real controller will own. Call in an injection context. */
export function startDemo(params: URLSearchParams): DemoOptions {
  const store = inject(PrompterStore);
  const mode = params.get('mode') as OverlayMode | null;
  if (mode && MODES.includes(mode)) store.mode.set(mode);
  const opacity = Number(params.get('opacity'));
  if (opacity >= 0.2 && opacity <= 1) store.opacity.set(opacity);
  if (params.get('edit') === '1') store.editMode.set(true);
  if (params.get('hidden') === '1') store.visible.set(false);
  if (params.get('follow') === 'voice') store.setFollow('voice');

  if (params.get('empty') !== '1') {
    store.loadScript(DEMO_SCRIPT);
    const font = Number(params.get('font'));
    if (font >= 12 && font <= 160) store.fontSizePx.set(font);
    const at = Number(params.get('at'));
    if (at > 0) store.setCursor(at);
    if (params.get('paused') !== '1') store.togglePlay();
  }

  let last = performance.now();
  let frame = requestAnimationFrame(function tick(now) {
    store.advanceBy(now - last);
    last = now;
    frame = requestAnimationFrame(tick);
  });
  inject(DestroyRef).onDestroy(() => cancelAnimationFrame(frame));

  const bg = params.get('bg');
  return { backdrop: bg === 'bright' || bg === 'none' ? bg : 'dark' };
}
