mod hotkeys;
pub mod ipc;
mod layout;
mod model;
mod script;
mod settings;
mod speech;
mod tray;
mod windows;

use ipc::{
    BackendError, EVENT_BACKEND_ERROR, EVENT_SETTINGS_CHANGED, EVENT_VOICE_MODEL_PROGRESS,
    HotkeyConflict, ScriptFile, Settings, VoiceStatus,
};
use notify_debouncer_mini::{Debouncer, notify::RecommendedWatcher};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex, MutexGuard,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::{AppHandle, Emitter, Manager, async_runtime::spawn_blocking};

#[derive(Default)]
struct Voice {
    model: Option<Arc<vosk::Model>>,
    session: Option<speech::Session>,
}

pub struct AppState {
    config_dir: PathBuf,
    data_dir: PathBuf,
    settings: Mutex<Settings>,
    watcher: Mutex<Option<Debouncer<RecommendedWatcher>>>,
    voice: Mutex<Voice>,
    installing: AtomicBool,
}

/// A panicking thread must not turn every later `lock()` into a panic.
pub(crate) fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn report(app: &AppHandle, message: String) {
    log::warn!("{message}");
    let _ = app.emit(EVENT_BACKEND_ERROR, BackendError { message });
}

/// Persist, apply (capture, bounds, tray language, hotkeys) and broadcast. Main thread only (global hotkeys).
pub(crate) fn apply_settings(app: &AppHandle, new: Settings) -> Vec<HotkeyConflict> {
    let new = settings::sanitize(new);
    let state = app.state::<AppState>();
    let prev = std::mem::replace(&mut *lock(&state.settings), new.clone());
    if let Err(e) = settings::save(&state.config_dir, &new) {
        report(app, e);
    }
    windows::apply_capture(app, new.capture_hidden);
    if let Some(w) = windows::overlay(app).filter(|_| {
        prev.mode != new.mode || prev.bounds.get(&new.mode) != new.bounds.get(&new.mode)
    }) {
        windows::apply_bounds(app, &w, &new);
    }
    if prev.language != new.language {
        tray::set_language(app, new.language);
    }
    let conflicts = hotkeys::register(app, &new.hotkeys);
    let _ = app.emit(EVENT_SETTINGS_CHANGED, &new);
    conflicts
}

#[tauri::command]
fn get_settings(state: tauri::State<AppState>) -> Settings {
    lock(&state.settings).clone()
}

#[tauri::command]
fn set_settings(app: AppHandle, settings: Settings) -> Vec<HotkeyConflict> {
    apply_settings(&app, settings)
}

#[tauri::command]
async fn open_script_dialog(app: AppHandle) -> Option<String> {
    spawn_blocking(move || tray::pick_script(&app))
        .await
        .ok()
        .flatten()
}

#[tauri::command]
fn read_script(path: String) -> Result<ScriptFile, String> {
    script::read(&path)
}

#[tauri::command]
fn watch_script(app: AppHandle, path: String) -> Result<(), String> {
    script::watch(&app, &path)
}

#[tauri::command]
fn set_edit_mode(app: AppHandle, enabled: bool) -> Result<(), String> {
    windows::set_edit_mode(&app, enabled)
}

#[tauri::command]
fn set_visible(app: AppHandle, visible: bool) -> Result<(), String> {
    windows::set_visible(&app, visible)
}

#[tauri::command]
fn show_settings_window(app: AppHandle) -> Result<(), String> {
    windows::show_settings(&app)
}

#[tauri::command]
fn voice_status(state: tauri::State<AppState>) -> VoiceStatus {
    // try_lock: a start/stop in progress must not block the UI; it counts as "not listening yet".
    let listening = state
        .voice
        .try_lock()
        .is_ok_and(|v| v.session.as_ref().is_some_and(speech::Session::is_running));
    VoiceStatus {
        model_installed: model::installed(&state.data_dir),
        listening,
    }
}

#[tauri::command]
async fn install_voice_model(app: AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.installing.swap(true, Ordering::SeqCst) {
        return Err("The voice model is already being installed.".into());
    }
    let (data_dir, handle) = (state.data_dir.clone(), app.clone());
    let result = spawn_blocking(move || {
        model::install(&data_dir, |p| {
            drop(handle.emit(EVENT_VOICE_MODEL_PROGRESS, p))
        })
    })
    .await;
    state.installing.store(false, Ordering::SeqCst);
    result.map_err(|e| e.to_string())?
}

#[tauri::command]
fn list_input_devices() -> Vec<String> {
    speech::list_devices()
}

#[tauri::command]
async fn start_listening(app: AppHandle) -> Result<(), String> {
    let handle = app.clone();
    let result: Result<(), String> = spawn_blocking(move || {
        let state = handle.state::<AppState>();
        let (lang, device) = {
            let s = lock(&state.settings);
            (s.language, s.mic_device.clone())
        };
        let mut voice = lock(&state.voice);
        if voice
            .session
            .as_ref()
            .is_some_and(speech::Session::is_running)
        {
            return Ok(());
        }
        let model = match &voice.model {
            Some(m) => m.clone(),
            None => {
                let m = Arc::new(speech::load_model(&state.data_dir, lang)?);
                voice.model = Some(m.clone());
                m
            }
        };
        voice.session = Some(speech::start(&handle, model, device, lang)?);
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?;
    if let Err(e) = &result {
        report(&app, e.clone());
    }
    result
}

#[tauri::command]
async fn stop_listening(app: AppHandle) -> Result<(), String> {
    spawn_blocking(move || {
        let session = lock(&app.state::<AppState>().voice).session.take();
        if let Some(s) = session {
            s.stop();
        }
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let handle = app.handle();
            let (config_dir, data_dir) = (app.path().app_config_dir()?, app.path().app_data_dir()?);
            let initial = settings::load(&config_dir);
            app.manage(AppState {
                config_dir,
                data_dir,
                settings: Mutex::new(initial.clone()),
                watcher: Mutex::new(None),
                voice: Mutex::new(Voice::default()),
                installing: AtomicBool::new(false),
            });
            windows::create_overlay(handle, &initial)?;
            tray::build(handle, initial.language)?;
            for c in hotkeys::register(handle, &initial.hotkeys) {
                log::warn!(
                    "hotkey {:?} ({}) not registered: {}",
                    c.action,
                    c.accelerator,
                    c.reason
                );
            }
            if initial.last_script_path.is_none() {
                windows::show_settings(handle)?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_settings,
            open_script_dialog,
            read_script,
            watch_script,
            set_edit_mode,
            set_visible,
            show_settings_window,
            voice_status,
            install_voice_model,
            list_input_devices,
            start_listening,
            stop_listening,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Ghostline");
}
