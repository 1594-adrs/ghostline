# ADR-0001: Tauri 2 + Angular, with native offline speech recognition

## Status

Accepted

## Date

2026-10-16

## Context

Ghostline is a teleprompter overlay for Windows. It must:

- float above every window, be transparent, and let mouse clicks pass through to the app below;
- show up when the global hotkeys fire without taking focus from the app the user is typing in;
- stay invisible to screen capture (OBS, Snipping Tool, Google Meet screen share) while the user can still see it;
- follow the user's voice offline, in Spanish, with low latency;
- ship as a small installer and be maintainable as a public portfolio project.

## Decision

- **Shell:** Tauri 2 (Rust + WebView2). Capture exclusion uses `contentProtected`; in tao 0.37 that calls `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` (checked in the source). Click-through uses `set_ignore_cursor_events`. The overlay is created with `focus: false`.
- **UI:** Angular 22 (standalone components, signals, zoneless). One bundle serves two windows (`overlay`, `settings`), and the window label picks the view.
- **Speech:** native in Rust. `cpal` captures the microphone and downmixes it to mono i16. The `vosk` crate wraps libvosk 0.3.45 and uses `vosk-model-small-es-0.42`. Rust emits `speech` events (cumulative partials and finals). Aligning speech to the script is a pure TypeScript function.
- **Model distribution:** the model (~40 MB, Apache 2.0) is not bundled. It is downloaded on first use and its SHA-256 is checked before extraction. The libvosk DLLs (~25 MB) ship with the installer.

## Alternatives Considered

### Electron + Angular

- Pros: `setContentProtection` is documented first-party, and it has a large ecosystem.
- Cons: it adds ~100 MB to the installer and uses more RAM, which is a poor fit for an always-on overlay.
- Rejected: Tauri covers the same Windows APIs, so the only thing we would gain is documentation.

### vosk-browser (WASM in a Web Worker)

- Pros: everything stays in TypeScript, and the same code would run in a plain browser.
- Cons: no release since 2022. In the spike, `getUserMedia` inside WebView2 hung, most likely behind a permission prompt that was never shown.
- Rejected: native Vosk measured a 0.19 s model load and processed 13.4 s of audio in 0.7 s, with partial results every ~100 ms.

### Web Speech API / cloud STT

- Rejected: it is not offline, sends the user's voice to a third party, and is unavailable or unreliable in WebView2.

## Consequences

- Builds need the libvosk import library. `npm run fetch:vosk` downloads it and checks its SHA-256, and CI does the same.
- v1 supports Windows only. macOS and Linux need their own capture-exclusion and click-through checks, plus libvosk builds.
- Some capture paths can still record the overlay. Microsoft documents that `WDA_EXCLUDEFROMCAPTURE` is honored by the standard capture APIs, but not every one. This is listed as a known limitation.
- Global hotkeys avoid Ctrl+Alt+<character>, because on Windows Ctrl+Alt is AltGr and those combinations would swallow characters like `@` and `€`. A hotkey that fails to register is reported as a conflict instead of crashing the app.
