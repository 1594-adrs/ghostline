//! System tray icon and menu.

use crate::{
    AppState, apply_settings,
    ipc::{EVENT_HOTKEY, HotkeyAction, HotkeyEvent, Language},
    lock, windows,
};
use tauri::{
    AppHandle, Emitter, Manager,
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};
use tauri_plugin_dialog::DialogExt;

const ID: &str = "main";

fn menu(app: &AppHandle, lang: Language) -> tauri::Result<Menu<tauri::Wry>> {
    let (open, settings, visible, edit, quit) = match lang {
        Language::Es => (
            "Abrir guion…",
            "Ajustes",
            "Mostrar/Ocultar",
            "Modo edición",
            "Salir",
        ),
        Language::En => ("Open script…", "Settings", "Show/Hide", "Edit mode", "Quit"),
    };
    let item = |id: &str, text: &str| MenuItem::with_id(app, id, text, true, None::<&str>);
    Menu::with_items(
        app,
        &[
            &item("open", open)?,
            &item("settings", settings)?,
            &PredefinedMenuItem::separator(app)?,
            &item("visible", visible)?,
            &item("edit", edit)?,
            &PredefinedMenuItem::separator(app)?,
            &item("quit", quit)?,
        ],
    )
}

pub fn build(app: &AppHandle, lang: Language) -> tauri::Result<()> {
    let mut builder = TrayIconBuilder::with_id(ID)
        .tooltip("Ghostline")
        .menu(&menu(app, lang)?)
        .on_menu_event(on_menu);
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app).map(drop)
}

pub fn set_language(app: &AppHandle, lang: Language) {
    if let (Some(tray), Ok(m)) = (app.tray_by_id(ID), menu(app, lang)) {
        let _ = tray.set_menu(Some(m));
    }
}

/// Native file picker (.md/.txt). Blocks: never call it from the main thread.
pub fn pick_script(app: &AppHandle) -> Option<String> {
    let picked = app
        .dialog()
        .file()
        .add_filter("Script", &["md", "markdown", "txt"])
        .blocking_pick_file()?;
    picked
        .into_path()
        .ok()
        .map(|p| p.to_string_lossy().into_owned())
}

fn on_menu(app: &AppHandle, event: MenuEvent) {
    let hotkey = |action| {
        let _ = app.emit_to(windows::OVERLAY, EVENT_HOTKEY, HotkeyEvent { action });
    };
    match event.id().as_ref() {
        "open" => {
            let app = app.clone();
            std::thread::spawn(move || {
                let Some(path) = pick_script(&app) else {
                    return;
                };
                let handle = app.clone();
                // Settings (and hotkey registration) must be applied on the main thread.
                let _ = app.run_on_main_thread(move || {
                    let mut s = lock(&handle.state::<AppState>().settings).clone();
                    s.last_script_path = Some(path);
                    apply_settings(&handle, s);
                });
            });
        }
        "settings" => {
            if let Err(e) = windows::show_settings(app) {
                log::warn!("{e}");
            }
        }
        "visible" => hotkey(HotkeyAction::ToggleVisible),
        "edit" => hotkey(HotkeyAction::ToggleEdit),
        "quit" => app.exit(0),
        _ => {}
    }
}
