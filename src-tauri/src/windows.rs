//! Overlay and settings windows: creation, bounds, click-through, visibility, capture protection.

use crate::{
    AppState,
    ipc::{Language, Rect, Settings},
    layout, lock, settings,
};
use tauri::{
    AppHandle, Emitter, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder,
};

pub const OVERLAY: &str = "overlay";
pub const SETTINGS: &str = "settings";

fn index() -> WebviewUrl {
    WebviewUrl::App("index.html".into())
}

fn work_rect(m: &Monitor) -> Rect {
    let a = m.work_area();
    Rect {
        x: a.position.x,
        y: a.position.y,
        width: a.size.width,
        height: a.size.height,
    }
}

pub fn overlay(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(OVERLAY)
}

/// Overlay is non-focusable (WS_EX_NOACTIVATE in tao), so showing it never steals focus from the app being typed in.
pub fn create_overlay(app: &AppHandle, s: &Settings) -> tauri::Result<()> {
    let w = WebviewWindowBuilder::new(app, OVERLAY, index())
        .title("Ghostline")
        .inner_size(520.0, 240.0)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(true)
        .focused(false)
        .focusable(false)
        .content_protected(s.capture_hidden)
        .visible(false)
        .build()?;
    apply_bounds(app, &w, s);
    w.set_ignore_cursor_events(true)?;
    w.show()
}

/// Saved bounds for the current mode if still on a connected monitor, else the mode default on the overlay's monitor.
pub fn apply_bounds(app: &AppHandle, w: &WebviewWindow, s: &Settings) {
    let monitors = app.available_monitors().unwrap_or_default();
    let saved = s.bounds.get(&s.mode).copied().flatten().filter(|r| {
        monitors
            .iter()
            .any(|m| layout::intersects(*r, work_rect(m)))
    });
    let rect = saved.or_else(|| {
        let m = w
            .current_monitor()
            .ok()
            .flatten()
            .or_else(|| app.primary_monitor().ok().flatten())?;
        Some(layout::default_rect(
            s.mode,
            work_rect(&m),
            m.scale_factor(),
        ))
    });
    let Some(r) = rect else {
        return log::warn!("no monitor found, overlay bounds left unchanged");
    };
    let _ = w.set_size(PhysicalSize::new(r.width, r.height));
    let _ = w.set_position(PhysicalPosition::new(r.x, r.y));
}

pub fn apply_capture(app: &AppHandle, hidden: bool) {
    for w in app.webview_windows().values() {
        let _ = w.set_content_protected(hidden);
    }
}

/// Edit mode accepts the mouse; leaving it stores the dragged/resized bounds for the current mode.
pub fn set_edit_mode(app: &AppHandle, enabled: bool) -> Result<(), String> {
    let w = overlay(app).ok_or("The overlay window does not exist.")?;
    if enabled {
        return w.set_ignore_cursor_events(false).map_err(|e| e.to_string());
    }
    let (pos, size) = (
        w.outer_position().map_err(|e| e.to_string())?,
        w.outer_size().map_err(|e| e.to_string())?,
    );
    let state = app.state::<AppState>();
    let snapshot = {
        let mut s = lock(&state.settings);
        let mode = s.mode;
        s.bounds.insert(
            mode,
            Some(Rect {
                x: pos.x,
                y: pos.y,
                width: size.width,
                height: size.height,
            }),
        );
        s.clone()
    };
    if let Err(e) = settings::save(&state.config_dir, &snapshot) {
        log::warn!("{e}");
    }
    let _ = app.emit(crate::ipc::EVENT_SETTINGS_CHANGED, &snapshot);
    w.set_ignore_cursor_events(true).map_err(|e| e.to_string())
}

pub fn set_visible(app: &AppHandle, visible: bool) -> Result<(), String> {
    let w = overlay(app).ok_or("The overlay window does not exist.")?;
    (if visible { w.show() } else { w.hide() }).map_err(|e| e.to_string())
}

pub fn show_settings(app: &AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(SETTINGS) {
        let _ = w.unminimize();
        let _ = w.show();
        return w.set_focus().map_err(|e| e.to_string());
    }
    let (hidden, lang) = {
        let state = app.state::<AppState>();
        let s = lock(&state.settings);
        (s.capture_hidden, s.language)
    };
    let title = if lang == Language::Es {
        "Ghostline - Ajustes"
    } else {
        "Ghostline - Settings"
    };
    WebviewWindowBuilder::new(app, SETTINGS, index())
        .title(title)
        .inner_size(760.0, 680.0)
        .center()
        .content_protected(hidden)
        .build()
        .map(drop)
        .map_err(|e| e.to_string())
}
