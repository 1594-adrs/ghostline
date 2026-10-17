//! Script loading (validated) and file watching.

use crate::{
    AppState,
    ipc::{
        BackendError, EVENT_BACKEND_ERROR, EVENT_SCRIPT_CHANGED, ScriptChangedEvent, ScriptFile,
        ScriptFormat,
    },
    lock,
};
use notify_debouncer_mini::{new_debouncer, notify::RecursiveMode};
use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
    time::Duration,
};
use tauri::{AppHandle, Emitter, Manager};

pub const MAX_BYTES: u64 = 2 * 1024 * 1024;

/// Rejects UNC/device paths before any filesystem access (so Windows never starts SMB auth),
/// checks the extension, then canonicalizes. Returns the canonical path and its format.
fn validate(path: &str) -> Result<(PathBuf, ScriptFormat), String> {
    if path.starts_with(r"\\") || path.starts_with("//") {
        return Err("Network and device paths are not supported.".into());
    }
    let p = Path::new(path);
    let ext = p
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase);
    let format = match ext.as_deref() {
        Some("md" | "markdown") => ScriptFormat::Md,
        Some("txt") => ScriptFormat::Txt,
        _ => return Err("Only .md, .markdown and .txt scripts are supported.".into()),
    };
    let canon = p
        .canonicalize()
        .map_err(|e| format!("Cannot open the script: {e}"))?;
    // Local files canonicalize to `\\?\C:\...`; only `\\?\UNC\...` is a network share (e.g. a mapped drive).
    if canon.to_string_lossy().starts_with(r"\\?\UNC\") || !canon.is_file() {
        return Err("The script must be a regular file on a local drive.".into());
    }
    Ok((canon, format))
}

pub fn read(path: &str) -> Result<ScriptFile, String> {
    let (p, format) = validate(path)?;
    let p = p.as_path();
    let file = File::open(p).map_err(|e| format!("Cannot open the script: {e}"))?;
    // Read one byte past the limit so a file that grows after open() is still rejected.
    let mut bytes = Vec::new();
    file.take(MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| format!("Cannot read the script: {e}"))?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err("The script is larger than 2 MB.".into());
    }
    let content =
        String::from_utf8(bytes).map_err(|_| "The script is not valid UTF-8 text.".to_string())?;
    let content = content
        .strip_prefix('\u{feff}')
        .map(str::to_owned)
        .unwrap_or(content);
    let name = p
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(path)
        .to_owned();
    Ok(ScriptFile {
        path: path.to_owned(),
        name,
        format,
        content,
    })
}

/// Watches the parent directory (editors replace files atomically) and filters by file name. Replaces any previous watch.
pub fn watch(app: &AppHandle, path: &str) -> Result<(), String> {
    let (target, _) = validate(path)?;
    let dir = target
        .parent()
        .ok_or("The script path has no parent directory.")?
        .to_owned();
    let name = target
        .file_name()
        .ok_or("The script path has no file name.")?
        .to_owned();
    let (handle, reported) = (app.clone(), path.to_owned());
    let mut debouncer = new_debouncer(
        Duration::from_millis(200),
        move |res: notify_debouncer_mini::DebounceEventResult| match res {
            Ok(events) => {
                if events
                    .iter()
                    .any(|e| e.path.file_name() == Some(name.as_os_str()))
                {
                    let _ = handle.emit_to(
                        "overlay",
                        EVENT_SCRIPT_CHANGED,
                        ScriptChangedEvent {
                            path: reported.clone(),
                        },
                    );
                }
            }
            Err(e) => {
                let _ = handle.emit(
                    EVENT_BACKEND_ERROR,
                    BackendError {
                        message: format!("File watcher error: {e}"),
                    },
                );
            }
        },
    )
    .map_err(|e| format!("Cannot watch the script: {e}"))?;
    debouncer
        .watcher()
        .watch(&dir, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Cannot watch the script: {e}"))?;
    *lock(&app.state::<AppState>().watcher) = Some(debouncer);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn write(name: &str, bytes: &[u8]) -> (tempfile::TempDir, String) {
        let dir = tempfile::tempdir().unwrap();
        let p = dir.path().join(name);
        fs::write(&p, bytes).unwrap();
        let s = p.to_string_lossy().into_owned();
        (dir, s)
    }

    #[test]
    fn reads_md_and_txt() {
        let (_d, p) = write("a.MD", "\u{feff}# Hola".as_bytes());
        let f = read(&p).unwrap();
        assert_eq!(
            (f.format, f.content.as_str(), f.name.as_str()),
            (ScriptFormat::Md, "# Hola", "a.MD")
        );
        let (_d, p) = write("b.txt", b"hi");
        assert_eq!(read(&p).unwrap().format, ScriptFormat::Txt);
    }

    #[test]
    fn rejects_bad_extension_size_and_utf8() {
        let (_d, p) = write("a.exe", b"x");
        assert!(read(&p).unwrap_err().contains(".md"));
        let (_d, p) = write("big.txt", &vec![b'a'; MAX_BYTES as usize + 1]);
        assert!(read(&p).unwrap_err().contains("2 MB"));
        let (_d, p) = write("ok.txt", &vec![b'a'; MAX_BYTES as usize]);
        assert!(read(&p).is_ok());
        let (_d, p) = write("bad.md", &[0xff, 0xfe, 0x41]);
        assert!(read(&p).unwrap_err().contains("UTF-8"));
        assert!(read("C:/definitely/missing.md").is_err());
    }

    #[test]
    fn rejects_unc_device_paths_and_directories() {
        for p in [
            r"\\server\share\a.md",
            "//server/share/a.md",
            r"\\?\C:\a.md",
            r"\\.\pipe\a.md",
        ] {
            assert!(read(p).unwrap_err().contains("Network"), "{p}");
        }
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("d.md");
        fs::create_dir(&sub).unwrap();
        assert!(read(&sub.to_string_lossy()).is_err());
    }

    #[test]
    fn accepts_local_file_whose_canonical_form_is_verbatim() {
        let (_d, p) = write("v.md", b"hi");
        let canon = Path::new(&p).canonicalize().unwrap();
        assert!(canon.to_string_lossy().starts_with(r"\\?\"), "{canon:?}");
        assert!(read(&p).is_ok());
    }
}
