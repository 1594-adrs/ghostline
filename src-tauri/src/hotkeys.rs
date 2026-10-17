//! Global hotkeys. Failures are collected as `HotkeyConflict`s, never panics.

use crate::ipc::{EVENT_HOTKEY, HotkeyAction, HotkeyConflict, HotkeyEvent};
use std::collections::BTreeMap;
use tauri::{AppHandle, Emitter};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

pub fn parse(accelerator: &str) -> Result<Shortcut, String> {
    accelerator
        .parse::<Shortcut>()
        .map_err(|e| format!("Invalid shortcut: {e}"))
}

/// Replaces all registered hotkeys. Must run on the main thread (the hotkey window belongs to it).
pub fn register(app: &AppHandle, hotkeys: &BTreeMap<HotkeyAction, String>) -> Vec<HotkeyConflict> {
    let gs = app.global_shortcut();
    if let Err(e) = gs.unregister_all() {
        log::warn!("unregister_all failed: {e}");
    }
    let mut conflicts = Vec::new();
    for (&action, accelerator) in hotkeys {
        let result = parse(accelerator).and_then(|shortcut| {
            gs.on_shortcut(shortcut, move |app, _, event| {
                if event.state == ShortcutState::Pressed {
                    let _ = app.emit_to("overlay", EVENT_HOTKEY, HotkeyEvent { action });
                }
            })
            .map_err(|e| e.to_string())
        });
        if let Err(reason) = result {
            log::warn!("hotkey {action:?} ({accelerator}) not registered: {reason}");
            conflicts.push(HotkeyConflict {
                action,
                accelerator: accelerator.clone(),
                reason,
            });
        }
    }
    conflicts
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_parse_and_garbage_is_an_error() {
        for accel in crate::ipc::Settings::default().hotkeys.values() {
            assert!(parse(accel).is_ok(), "{accel}");
        }
        assert!(parse("Ctrl+Alt+Banana").is_err());
        assert!(parse("").is_err());
        assert!(parse("Ctrl+").is_err());
    }
}
