import { Injectable, signal } from '@angular/core';
import { isTauri } from '@tauri-apps/api/core';
import { DEFAULT_HOTKEYS, type HotkeyConflict, type Settings, type VoiceStatus } from './contracts';
import { invoke, listen } from './ipc';

/** Must match `Settings::default()` in Rust. */
export const DEFAULT_SETTINGS: Settings = {
  language: 'es',
  hotkeys: DEFAULT_HOTKEYS,
  mode: 'corner',
  bounds: { corner: null, strip: null, full: null },
  fontSizePx: 32,
  speedWpm: 140,
  opacity: 0.75,
  captureHidden: true,
  micDevice: null,
  lastScriptPath: null,
};

/**
 * Settings + voice status shared by both windows. Rust is the source of truth; every change round-trips
 * through `set_settings` and comes back as `settings-changed`. Outside Tauri (browser preview) it keeps state in memory.
 */
@Injectable({ providedIn: 'root' })
export class SettingsClient {
  readonly settings = signal<Settings>(DEFAULT_SETTINGS);
  readonly conflicts = signal<readonly HotkeyConflict[]>([]);
  readonly voice = signal<VoiceStatus>({ modelInstalled: false, listening: false });
  readonly modelProgress = signal<{ received: number; total: number | null } | null>(null);
  readonly devices = signal<readonly string[]>([]);
  readonly lastError = signal<string | null>(null);

  private readonly native = isTauri();

  async init(): Promise<void> {
    if (!this.native) return;
    await listen('settings-changed', (s) => this.settings.set(s));
    await listen('voice-model-progress', (p) => this.modelProgress.set(p));
    await listen('backend-error', (e) => this.lastError.set(e.message));
    this.settings.set(await invoke('get_settings'));
    this.voice.set(await invoke('voice_status'));
  }

  async update(patch: Partial<Settings>): Promise<void> {
    const next = { ...this.settings(), ...patch };
    this.settings.set(next);
    if (this.native) this.conflicts.set(await invoke('set_settings', { settings: next }));
  }

  /** Native file picker; the chosen path becomes `lastScriptPath`, which the overlay loads. */
  async openScript(): Promise<void> {
    if (!this.native) return;
    const path = await invoke('open_script_dialog');
    if (path) await this.update({ lastScriptPath: path });
  }

  async installVoiceModel(): Promise<void> {
    if (!this.native) return;
    try {
      await invoke('install_voice_model');
      this.voice.set(await invoke('voice_status'));
    } catch (e) {
      this.lastError.set(String(e));
    } finally {
      this.modelProgress.set(null);
    }
  }

  async refreshDevices(): Promise<void> {
    if (this.native) this.devices.set(await invoke('list_input_devices'));
  }
}
