//! IPC contract shared with the UI. Mirrors `src/app/core/contracts.ts` — keep both in sync.
//! Command handlers live in their own modules; this file holds only the wire types and event names.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const EVENT_HOTKEY: &str = "hotkey";
pub const EVENT_SETTINGS_CHANGED: &str = "settings-changed";
pub const EVENT_SCRIPT_CHANGED: &str = "script-changed";
pub const EVENT_VOICE_MODEL_PROGRESS: &str = "voice-model-progress";
pub const EVENT_SPEECH: &str = "speech";
pub const EVENT_BACKEND_ERROR: &str = "backend-error";

/// Same order and spelling as `HOTKEY_ACTIONS` in contracts.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum HotkeyAction {
    TogglePlay,
    PrevBlock,
    NextBlock,
    SpeedDown,
    SpeedUp,
    PrevSection,
    NextSection,
    ToggleVisible,
    ToggleEdit,
    ToggleVoice,
    CycleMode,
    ToggleCapture,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OverlayMode {
    Corner,
    Strip,
    Full,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Language {
    Es,
    En,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScriptFormat {
    Md,
    Txt,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub language: Language,
    /// Tauri accelerator strings, e.g. "Ctrl+Alt+F7".
    pub hotkeys: BTreeMap<HotkeyAction, String>,
    pub mode: OverlayMode,
    /// Physical-pixel bounds per mode; `None` = default for the current monitor.
    pub bounds: BTreeMap<OverlayMode, Option<Rect>>,
    pub font_size_px: u32,
    pub speed_wpm: u32,
    /// Overlay panel background opacity, 0.2..=1.0.
    pub opacity: f32,
    pub capture_hidden: bool,
    pub mic_device: Option<String>,
    pub last_script_path: Option<String>,
}

/// Must equal `DEFAULT_SETTINGS` / `DEFAULT_HOTKEYS` in the TS mirror.
impl Default for Settings {
    fn default() -> Self {
        use HotkeyAction::*;
        let hotkeys = [
            (TogglePlay, "Ctrl+Alt+F7"),
            (PrevBlock, "Ctrl+Alt+Up"),
            (NextBlock, "Ctrl+Alt+Down"),
            (SpeedDown, "Ctrl+Alt+Left"),
            (SpeedUp, "Ctrl+Alt+Right"),
            (PrevSection, "Ctrl+Alt+PageUp"),
            (NextSection, "Ctrl+Alt+PageDown"),
            (ToggleVisible, "Ctrl+Alt+F8"),
            (ToggleEdit, "Ctrl+Alt+F9"),
            (ToggleVoice, "Ctrl+Alt+F10"),
            (CycleMode, "Ctrl+Alt+F11"),
            (ToggleCapture, "Ctrl+Alt+F12"),
        ];
        Self {
            language: Language::Es,
            hotkeys: hotkeys
                .into_iter()
                .map(|(a, k)| (a, k.to_string()))
                .collect(),
            mode: OverlayMode::Corner,
            bounds: [OverlayMode::Corner, OverlayMode::Strip, OverlayMode::Full]
                .into_iter()
                .map(|m| (m, None))
                .collect(),
            font_size_px: 32,
            speed_wpm: 140,
            opacity: 0.75,
            capture_hidden: true,
            mic_device: None,
            last_script_path: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ScriptFile {
    pub path: String,
    pub name: String,
    pub format: ScriptFormat,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct HotkeyConflict {
    pub action: HotkeyAction,
    pub accelerator: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceStatus {
    pub model_installed: bool,
    pub listening: bool,
}

// ---- event payloads

#[derive(Debug, Clone, Serialize)]
pub struct HotkeyEvent {
    pub action: HotkeyAction,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScriptChangedEvent {
    pub path: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct VoiceModelProgress {
    pub received: u64,
    pub total: Option<u64>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum SpeechKind {
    Partial,
    Final,
}

/// `partial` text is cumulative for the current utterance; `final` closes it and `utterance` increments.
#[derive(Debug, Clone, Serialize)]
pub struct SpeechEvent {
    pub kind: SpeechKind,
    pub utterance: u64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BackendError {
    pub message: String,
}

// Commands (names, args → result), implemented with #[tauri::command] elsewhere:
//   get_settings()                        -> Settings
//   set_settings(settings: Settings)      -> Vec<HotkeyConflict>   persist, re-register hotkeys, apply mode/capture, emit settings-changed
//   open_script_dialog()                  -> Option<String>
//   read_script(path: String)             -> ScriptFile            .md/.txt only, ≤ 2 MB
//   watch_script(path: String)            -> ()                    one watch at a time, emits script-changed
//   set_edit_mode(enabled: bool)          -> ()                    leaving edit mode saves bounds for current mode
//   set_visible(visible: bool)            -> ()
//   show_settings_window()                -> ()
//   voice_status()                        -> VoiceStatus
//   install_voice_model()                 -> ()                    download + SHA-256 + extract, emits voice-model-progress
//   list_input_devices()                  -> Vec<String>
//   start_listening() / stop_listening()  -> ()                    emits speech
// Errors are returned as `Result<_, String>` with a user-readable message.
