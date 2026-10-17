//! Settings persistence and validation (the trust boundary for everything the UI or the disk hands us).

use crate::ipc::{Rect, Settings};
use std::{fs, io, path::Path};

const FILE: &str = "settings.json";
const MAX_COORD: i32 = 100_000;

/// Clamps out-of-range values and fills anything missing from the defaults.
pub fn sanitize(mut s: Settings) -> Settings {
    let d = Settings::default();
    s.font_size_px = s.font_size_px.clamp(12, 160);
    s.speed_wpm = s.speed_wpm.clamp(60, 300);
    s.opacity = if s.opacity.is_finite() {
        s.opacity.clamp(0.2, 1.0)
    } else {
        d.opacity
    };
    for (action, accel) in d.hotkeys {
        // A global hotkey without a modifier would hijack a plain key system-wide.
        let usable = |k: &String| crate::hotkeys::parse(k).is_ok_and(|sc| !sc.mods.is_empty());
        if !s.hotkeys.get(&action).is_some_and(usable) {
            s.hotkeys.insert(action, accel);
        }
    }
    for (mode, _) in d.bounds {
        s.bounds.entry(mode).or_insert(None);
    }
    for rect in s.bounds.values_mut() {
        *rect = rect.filter(|r| r.width > 0 && r.height > 0).map(|r| Rect {
            x: r.x.clamp(-MAX_COORD, MAX_COORD),
            y: r.y.clamp(-MAX_COORD, MAX_COORD),
            width: r.width.min(MAX_COORD as u32),
            height: r.height.min(MAX_COORD as u32),
        });
    }
    s
}

/// Corrupt JSON (or wrong field types) falls back to the defaults instead of blocking startup.
pub fn parse(json: &str) -> Settings {
    match serde_json::from_str::<Settings>(json) {
        Ok(s) => sanitize(s),
        Err(e) => {
            log::warn!("settings file is corrupt, using defaults: {e}");
            Settings::default()
        }
    }
}

pub fn load(dir: &Path) -> Settings {
    match fs::read_to_string(dir.join(FILE)) {
        Ok(json) => parse(&json),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Settings::default(),
        Err(e) => {
            log::warn!("cannot read settings, using defaults: {e}");
            Settings::default()
        }
    }
}

/// Write to a temp file and rename so a crash never leaves half a file.
pub fn save(dir: &Path, s: &Settings) -> Result<(), String> {
    let json = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    fs::create_dir_all(dir).map_err(|e| format!("cannot create {}: {e}", dir.display()))?;
    let tmp = dir.join(format!("{FILE}.tmp"));
    fs::write(&tmp, json).map_err(|e| format!("cannot write settings: {e}"))?;
    fs::rename(&tmp, dir.join(FILE)).map_err(|e| format!("cannot save settings: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ipc::{HotkeyAction, OverlayMode, Rect};
    use serde_json::{Value, json};

    #[test]
    fn default_matches_ts_shape() {
        let v = serde_json::to_value(Settings::default()).unwrap();
        assert_eq!(
            v,
            json!({
                "language": "es",
                "hotkeys": {
                    "toggle-play": "Ctrl+Alt+F7", "prev-block": "Ctrl+Alt+Up", "next-block": "Ctrl+Alt+Down",
                    "speed-down": "Ctrl+Alt+Left", "speed-up": "Ctrl+Alt+Right",
                    "prev-section": "Ctrl+Alt+PageUp", "next-section": "Ctrl+Alt+PageDown",
                    "toggle-visible": "Ctrl+Alt+F8", "toggle-edit": "Ctrl+Alt+F9", "toggle-voice": "Ctrl+Alt+F10",
                    "cycle-mode": "Ctrl+Alt+F11", "toggle-capture": "Ctrl+Alt+F12"
                },
                "mode": "corner",
                "bounds": { "corner": null, "strip": null, "full": null },
                "fontSizePx": 32, "speedWpm": 140, "opacity": 0.75,
                "captureHidden": true, "micDevice": null, "lastScriptPath": null
            })
        );
    }

    #[test]
    fn clamps_and_fills() {
        let s = parse(
            r#"{"fontSizePx":9999,"speedWpm":1,"opacity":0.0,"hotkeys":{"toggle-play":"Ctrl+F1"},"bounds":{"full":{"x":1,"y":2,"width":0,"height":5}}}"#,
        );
        assert_eq!((s.font_size_px, s.speed_wpm, s.opacity), (160, 60, 0.2));
        assert_eq!(s.hotkeys[&HotkeyAction::TogglePlay], "Ctrl+F1");
        assert_eq!(s.hotkeys[&HotkeyAction::ToggleCapture], "Ctrl+Alt+F12");
        assert_eq!(s.bounds.len(), 3);
        assert_eq!(s.bounds[&OverlayMode::Full], None::<Rect>);
        assert_eq!(s.language, crate::ipc::Language::Es);
    }

    #[test]
    fn bad_hotkeys_fall_back_to_default() {
        let s = parse(
            r#"{"hotkeys":{"toggle-play":"F7","prev-block":"Banana","next-block":"Shift+Up","speed-up":""}}"#,
        );
        let d = Settings::default();
        assert_eq!(
            s.hotkeys[&HotkeyAction::TogglePlay],
            d.hotkeys[&HotkeyAction::TogglePlay]
        );
        assert_eq!(
            s.hotkeys[&HotkeyAction::PrevBlock],
            d.hotkeys[&HotkeyAction::PrevBlock]
        );
        assert_eq!(
            s.hotkeys[&HotkeyAction::SpeedUp],
            d.hotkeys[&HotkeyAction::SpeedUp]
        );
        assert_eq!(s.hotkeys[&HotkeyAction::NextBlock], "Shift+Up");
    }

    #[test]
    fn extreme_rects_are_clamped() {
        let s = parse(
            r#"{"bounds":{"full":{"x":2147483647,"y":-2147483648,"width":4294967295,"height":4294967295}}}"#,
        );
        let r = s.bounds[&OverlayMode::Full].unwrap();
        assert_eq!(
            (r.x, r.y, r.width, r.height),
            (100_000, -100_000, 100_000, 100_000)
        );
        let work = Rect {
            x: i32::MAX,
            y: i32::MAX,
            width: u32::MAX,
            height: u32::MAX,
        };
        for m in [OverlayMode::Corner, OverlayMode::Strip, OverlayMode::Full] {
            crate::layout::default_rect(m, work, 3.0);
            crate::layout::default_rect(
                m,
                Rect {
                    width: 0,
                    height: 0,
                    ..work
                },
                1.0,
            );
        }
    }

    #[test]
    fn corrupt_or_missing_gives_defaults() {
        assert_eq!(parse("{not json"), Settings::default());
        assert_eq!(parse(r#"{"fontSizePx":"big"}"#), Settings::default());
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(load(dir.path()), Settings::default());
        fs::write(dir.path().join(FILE), "garbage").unwrap();
        assert_eq!(load(dir.path()), Settings::default());
    }

    #[test]
    fn save_load_roundtrip() {
        let dir = tempfile::tempdir().unwrap();
        let mut s = Settings {
            last_script_path: Some("C:/a.md".into()),
            ..Default::default()
        };
        s.bounds.insert(
            OverlayMode::Strip,
            Some(Rect {
                x: -5,
                y: 0,
                width: 100,
                height: 50,
            }),
        );
        save(dir.path(), &s).unwrap();
        assert_eq!(load(dir.path()), s);
        let _: Value =
            serde_json::from_str(&fs::read_to_string(dir.path().join(FILE)).unwrap()).unwrap();
    }
}
