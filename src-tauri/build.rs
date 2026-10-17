use std::{env, fs, path::PathBuf};

fn main() {
    let vosk = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap()).join("vendor/vosk");
    println!("cargo:rerun-if-changed={}", vosk.display());
    if !vosk.join("libvosk.lib").exists() {
        panic!(
            "libvosk not found at {}. Run `npm run fetch:vosk` first.",
            vosk.display()
        );
    }
    println!("cargo:rustc-link-search=native={}", vosk.display());

    // OUT_DIR = target/<profile>/build/<pkg>-<hash>/out; the exe lives in target/<profile>, test exes in .../deps.
    let profile_dir = PathBuf::from(env::var("OUT_DIR").unwrap()).join("../../..");
    for dir in [profile_dir.clone(), profile_dir.join("deps")] {
        fs::create_dir_all(&dir).unwrap();
        for entry in fs::read_dir(&vosk).unwrap().flatten() {
            let path = entry.path();
            if path.extension().is_some_and(|e| e == "dll") {
                fs::copy(&path, dir.join(path.file_name().unwrap())).unwrap();
            }
        }
    }

    tauri_build::build()
}
