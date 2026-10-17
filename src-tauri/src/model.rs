//! Spanish Vosk model: download (SHA-256 verified), zip-slip-safe extraction, atomic install.

use crate::ipc::VoiceModelProgress;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{self, Read, Write},
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

const URL: &str = "https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip";
const SHA256: &str = "09b239888f633ef2f0b4e09736e3d9936acfd810bc65d53fad45261762c6511f";
const SIZE: u64 = 39_817_833;
pub const NAME: &str = "vosk-model-small-es-0.42";

pub fn model_dir(data_dir: &Path) -> PathBuf {
    data_dir.join("models").join(NAME)
}

pub fn installed(data_dir: &Path) -> bool {
    model_dir(data_dir).join("am/final.mdl").is_file()
}

/// Extracts every entry under `dest`; any entry whose name escapes it (`../`, absolute paths) aborts the whole extraction.
pub fn extract_zip(reader: impl Read + io::Seek, dest: &Path) -> Result<(), String> {
    let mut zip =
        zip::ZipArchive::new(reader).map_err(|e| format!("Corrupt model archive: {e}"))?;
    for i in 0..zip.len() {
        let mut entry = zip
            .by_index(i)
            .map_err(|e| format!("Corrupt model archive: {e}"))?;
        let rel = entry
            .enclosed_name()
            .ok_or_else(|| "Unsafe path in model archive.".to_string())?;
        let out = dest.join(rel);
        if entry.is_dir() {
            fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = out.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut f = File::create(&out).map_err(|e| e.to_string())?;
            io::copy(&mut entry, &mut f).map_err(|e| format!("Cannot extract the model: {e}"))?;
        }
    }
    Ok(())
}

fn download(zip_path: &Path, progress: &impl Fn(VoiceModelProgress)) -> Result<(), String> {
    let agent: ureq::Agent = ureq::Agent::config_builder()
        .timeout_connect(Some(Duration::from_secs(15)))
        .timeout_recv_response(Some(Duration::from_secs(30)))
        .timeout_global(Some(Duration::from_secs(30 * 60)))
        .build()
        .into();
    let mut resp = agent
        .get(URL)
        .call()
        .map_err(|e| format!("Cannot download the voice model (check your connection): {e}"))?;
    let total = resp.body().content_length();
    let mut body = resp.body_mut().as_reader();
    let mut out = File::create(zip_path).map_err(|e| e.to_string())?;
    let (mut hasher, mut received, mut last) = (Sha256::new(), 0u64, Instant::now());
    let mut buf = vec![0u8; 64 * 1024];
    loop {
        let n = body
            .read(&mut buf)
            .map_err(|e| format!("Download interrupted: {e}"))?;
        if n == 0 {
            break;
        }
        received += n as u64;
        if received > SIZE {
            return Err("The download is larger than expected.".into());
        }
        hasher.update(&buf[..n]);
        out.write_all(&buf[..n]).map_err(|e| e.to_string())?;
        if last.elapsed() >= Duration::from_millis(150) {
            progress(VoiceModelProgress { received, total });
            last = Instant::now();
        }
    }
    progress(VoiceModelProgress { received, total });
    let digest = hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();
    if received != SIZE || digest != SHA256 {
        return Err("The downloaded voice model is corrupt (checksum mismatch). Try again.".into());
    }
    Ok(())
}

/// Blocking; run on a worker thread. Leaves nothing behind on failure.
pub fn install(data_dir: &Path, progress: impl Fn(VoiceModelProgress)) -> Result<(), String> {
    if installed(data_dir) {
        return Ok(());
    }
    let models = data_dir.join("models");
    let staging = models.join(".installing");
    let zip_path = data_dir.join("voice-model.zip.part");
    let run = || -> Result<(), String> {
        let _ = fs::remove_dir_all(&staging);
        fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
        download(&zip_path, &progress)?;
        extract_zip(File::open(&zip_path).map_err(|e| e.to_string())?, &staging)?;
        let _ = fs::remove_dir_all(model_dir(data_dir)); // a half-installed leftover, if any
        fs::rename(staging.join(NAME), model_dir(data_dir))
            .map_err(|e| format!("Cannot install the model: {e}"))
    };
    let result = run();
    let _ = fs::remove_dir_all(&staging);
    let _ = fs::remove_file(&zip_path);
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    fn zip_with(names: &[&str]) -> Vec<u8> {
        let mut w = zip::ZipWriter::new(Cursor::new(Vec::new()));
        for n in names {
            w.start_file(*n, zip::write::SimpleFileOptions::default())
                .unwrap();
            w.write_all(b"data").unwrap();
        }
        w.finish().unwrap().into_inner()
    }

    #[test]
    fn extracts_normal_entries() {
        let dir = tempfile::tempdir().unwrap();
        extract_zip(
            Cursor::new(zip_with(&["m/am/final.mdl", "m/README"])),
            dir.path(),
        )
        .unwrap();
        assert!(dir.path().join("m/am/final.mdl").is_file());
    }

    #[test]
    fn rejects_zip_slip() {
        let dir = tempfile::tempdir().unwrap();
        let inner = dir.path().join("inner");
        fs::create_dir(&inner).unwrap();
        let err = extract_zip(Cursor::new(zip_with(&["m/ok", "../evil.txt"])), &inner).unwrap_err();
        assert!(err.contains("Unsafe path"), "{err}");
        assert!(!dir.path().join("evil.txt").exists());
    }
}
