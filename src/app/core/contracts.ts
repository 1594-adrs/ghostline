/**
 * Shared contracts between the Angular UI, the alignment engine and the Rust shell.
 * Rust mirrors the IPC types in `src-tauri/src/ipc.rs`; keep both in sync (serde uses camelCase).
 */

// ---------------------------------------------------------------- script model

export type ScriptFormat = 'md' | 'txt';

/** Optional YAML-ish frontmatter (`key: value` lines between `---` fences at the top of a .md). */
export interface ScriptMeta {
  readonly title?: string;
  /** Auto-scroll speed in words per minute. */
  readonly speed?: number;
  /** Font size in CSS px. */
  readonly fontSize?: number;
}

export type Emphasis = 'strong' | 'em' | 'code';

/** A renderable chunk of text. Spoken words carry their index into `Script.words`; whitespace and punctuation carry `null`. */
export interface Run {
  readonly text: string;
  readonly emphasis: readonly Emphasis[];
  readonly wordIndex: number | null;
}

/**
 * - `heading`: `#`..`######` — starts a section, displayed, NOT spoken.
 * - `paragraph` / `list-item`: spoken text.
 * - `note`: `> blockquote` — stage direction, displayed dimmed, NOT spoken.
 * - `pause`: `---` (thematic break) — visual beat, no runs.
 */
export type BlockKind = 'heading' | 'paragraph' | 'list-item' | 'note' | 'pause';

export interface Block {
  readonly id: number;
  readonly kind: BlockKind;
  /** Heading level 1–6, only for `heading`. */
  readonly level?: number;
  readonly runs: readonly Run[];
  /** True only for `paragraph` and `list-item`. Only spoken blocks produce `Word`s. */
  readonly spoken: boolean;
  /** Index into `Script.sections`; -1 for blocks before the first heading. */
  readonly section: number;
}

export interface Word {
  readonly index: number;
  /** As written in the script (no surrounding punctuation). */
  readonly text: string;
  /** `normalizeWord(text)` — the form compared against speech. */
  readonly norm: string;
  readonly blockId: number;
}

export interface Section {
  readonly index: number;
  readonly title: string;
  readonly blockId: number;
  /** First spoken word at or after the heading; `words.length` if none. */
  readonly firstWord: number;
}

export interface Script {
  readonly meta: ScriptMeta;
  readonly blocks: readonly Block[];
  readonly words: readonly Word[];
  readonly sections: readonly Section[];
}

/** `parseScript(source, format)` — pure, never throws, never produces HTML. */
export type ScriptParser = (source: string, format: ScriptFormat) => Script;

// ---------------------------------------------------------------- prompter

export type OverlayMode = 'corner' | 'strip' | 'full';

/** What moves the cursor while `playing`: a timer at `speedWpm`, or speech recognition. Hotkeys always work. */
export type FollowSource = 'auto' | 'voice';

export interface PrompterState {
  /** Index of the next word to read (0..words.length). */
  readonly cursor: number;
  readonly playing: boolean;
  readonly follow: FollowSource;
  readonly speedWpm: number;
  readonly mode: OverlayMode;
  readonly editMode: boolean;
  readonly visible: boolean;
}

// ---------------------------------------------------------------- alignment

export interface AlignInput {
  readonly words: readonly Word[];
  /** Current cursor (next word to read). */
  readonly cursor: number;
  /** Most recent recognized words, already `normalizeWord`ed, oldest first. */
  readonly heard: readonly string[];
}

export interface AlignResult {
  /** New cursor; equals the input cursor when nothing matched confidently. */
  readonly cursor: number;
  /** 0..1 */
  readonly confidence: number;
}

/** Pure function: no state, no I/O. */
export type Aligner = (input: AlignInput) => AlignResult;

// ---------------------------------------------------------------- settings & IPC (mirrored in Rust)

export const HOTKEY_ACTIONS = [
  'toggle-play',
  'prev-block',
  'next-block',
  'speed-down',
  'speed-up',
  'prev-section',
  'next-section',
  'toggle-visible',
  'toggle-edit',
  'toggle-voice',
  'cycle-mode',
  'toggle-capture',
] as const;
export type HotkeyAction = (typeof HOTKEY_ACTIONS)[number];

/** Tauri accelerator strings, e.g. `"Ctrl+Alt+F7"`. Only non-character keys: Ctrl+Alt is AltGr on Windows. */
export const DEFAULT_HOTKEYS: Readonly<Record<HotkeyAction, string>> = {
  'toggle-play': 'Ctrl+Alt+F7',
  'prev-block': 'Ctrl+Alt+Up',
  'next-block': 'Ctrl+Alt+Down',
  'speed-down': 'Ctrl+Alt+Left',
  'speed-up': 'Ctrl+Alt+Right',
  'prev-section': 'Ctrl+Alt+PageUp',
  'next-section': 'Ctrl+Alt+PageDown',
  'toggle-visible': 'Ctrl+Alt+F8',
  'toggle-edit': 'Ctrl+Alt+F9',
  'toggle-voice': 'Ctrl+Alt+F10',
  'cycle-mode': 'Ctrl+Alt+F11',
  'toggle-capture': 'Ctrl+Alt+F12',
};

export type Language = 'es' | 'en';

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Settings {
  readonly language: Language;
  readonly hotkeys: Readonly<Record<HotkeyAction, string>>;
  readonly mode: OverlayMode;
  /** Physical-pixel window bounds remembered per mode; null = Rust computes a default for the current monitor. */
  readonly bounds: Readonly<Record<OverlayMode, Rect | null>>;
  readonly fontSizePx: number;
  readonly speedWpm: number;
  /** Background opacity of the overlay panel, 0.2..1. */
  readonly opacity: number;
  readonly captureHidden: boolean;
  /** cpal input device name; null = system default. */
  readonly micDevice: string | null;
  readonly lastScriptPath: string | null;
}

export interface ScriptFile {
  readonly path: string;
  readonly name: string;
  readonly format: ScriptFormat;
  readonly content: string;
}

export interface HotkeyConflict {
  readonly action: HotkeyAction;
  readonly accelerator: string;
  readonly reason: string;
}

export interface VoiceStatus {
  readonly modelInstalled: boolean;
  readonly listening: boolean;
}

/** Command name → [args, result]. Args are passed as a named object (Tauri convention). */
export interface IpcCommands {
  get_settings: [Record<string, never>, Settings];
  /** Persists, re-registers hotkeys, applies capture/mode, broadcasts `settings-changed`. Returns hotkeys that failed to register. */
  set_settings: [{ settings: Settings }, HotkeyConflict[]];
  /** Native file picker (.md/.txt). Returns the chosen path or null. */
  open_script_dialog: [Record<string, never>, string | null];
  /** Reads a .md/.txt file (≤ 2 MB). */
  read_script: [{ path: string }, ScriptFile];
  /** Watches one file at a time (replaces the previous watch); emits `script-changed`. */
  watch_script: [{ path: string }, void];
  /** Edit mode = window accepts clicks/focus and can be dragged/resized; leaving it saves bounds for the current mode. */
  set_edit_mode: [{ enabled: boolean }, void];
  set_visible: [{ visible: boolean }, void];
  show_settings_window: [Record<string, never>, void];
  voice_status: [Record<string, never>, VoiceStatus];
  /** Downloads + SHA-256-verifies + extracts the Spanish Vosk model; emits `voice-model-progress`. */
  install_voice_model: [Record<string, never>, void];
  list_input_devices: [Record<string, never>, string[]];
  start_listening: [Record<string, never>, void];
  stop_listening: [Record<string, never>, void];
}

/** Event name → payload. */
export interface IpcEvents {
  hotkey: { action: HotkeyAction };
  'settings-changed': Settings;
  'script-changed': { path: string };
  'voice-model-progress': { received: number; total: number | null };
  /**
   * Vosk results. `partial` text is cumulative for the current utterance and replaced by the next partial;
   * `final` closes the utterance. `utterance` increments after each final.
   */
  speech: { kind: 'partial' | 'final'; utterance: number; text: string };
  /** Non-fatal backend problem to surface in the UI (mic lost, watch failed…). */
  'backend-error': { message: string };
}
