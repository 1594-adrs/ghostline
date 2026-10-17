# Ghostline

**A teleprompter that only you can see.** Ghostline floats your script over any app on Windows. Clicks go through it, it never takes focus, and screen capture can't see it: it does not show up in Google Meet screen sharing, OBS or Snipping Tool. It can scroll on its own at a set speed, or follow your voice offline.

> Status: early development (v0.1). Windows 11 only.

<!-- TODO(release): demo GIF -->

## Features

- **Overlay that stays out of the way:** transparent, always on top, click-through, and it never takes keyboard focus. Edit mode (Ctrl+Alt+F9) lets you drag and resize it.
- **Hidden from capture by default:** it uses `WDA_EXCLUDEFROMCAPTURE`. You can toggle it with Ctrl+Alt+F12 when you want it recorded.
- **Three layouts:** a compact corner, a strip under the webcam (so your eyes stay near the lens) and full screen. Each layout remembers its position.
- **Voice follow, offline:** Spanish speech recognition with [Vosk](https://alphacephei.com/vosk/). The cursor follows what you say, skips stage directions and ignores ad-libs. Nothing leaves your machine.
- **Markdown scripts:** sections, stage directions, pauses and emphasis ([format](#script-format)). The script reloads when you save the file.
- **Global hotkeys** work while you type in another app. You can change them, and conflicts are reported.
- UI in English and Spanish.

## Install

Download the installer from [Releases](../../releases). The installers are not code-signed yet, so Windows SmartScreen will warn you the first time: choose **More info → Run anyway**.

To use voice follow, install the Spanish voice model (~40 MB) from **Settings → Voice**. Its SHA-256 is checked before it is unpacked.

## Script format

```markdown
---
title: Launch video
speed: 150
---

# Intro

Hola a todos, **bienvenidos** al canal.

> Smile, look at the camera — not read aloud.

---

# Demo

- First point
- Second point
```

| Syntax                          | Meaning                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------- |
| `# Heading`                     | Section. You can jump between sections with Ctrl+Alt+PageUp/PageDown. It is not read aloud. |
| paragraphs, lists               | What you read. Voice follow tracks these.                                                   |
| `> quote`, code blocks          | Stage directions. They are shown dimmed and voice follow skips them.                        |
| `---`                           | Pause marker                                                                                |
| frontmatter `speed`, `fontSize` | Defaults for this script                                                                    |

Plain `.txt` files work too: each blank line starts a new paragraph. Details are in [ADR-0002](docs/adr/0002-script-format.md).

## Default hotkeys

| Action                   | Keys                       |
| ------------------------ | -------------------------- |
| Play / pause             | Ctrl+Alt+F7                |
| Previous / next block    | Ctrl+Alt+↑ / ↓             |
| Slower / faster          | Ctrl+Alt+← / →             |
| Previous / next section  | Ctrl+Alt+PageUp / PageDown |
| Show / hide              | Ctrl+Alt+F8                |
| Edit mode (move/resize)  | Ctrl+Alt+F9                |
| Voice follow on/off      | Ctrl+Alt+F10               |
| Cycle layout             | Ctrl+Alt+F11               |
| Hide from capture on/off | Ctrl+Alt+F12               |

The defaults use only non-character keys, because on Windows Ctrl+Alt is the same as AltGr, and Ctrl+Alt+letter shortcuts would block characters such as `@` and `€`.

## Known limitations

- Capture exclusion depends on the capture API. The standard Windows capture paths respect it, but some tools may still record the overlay. Check it with your own setup before going live.
- Voice follow is Spanish only for now.
- Windows only for now.
- Some Intel graphics drivers use Ctrl+Alt+arrow keys to rotate the screen. If the arrow hotkeys do nothing, turn off those driver hotkeys or rebind Ghostline's in Settings.
- A hotkey that another app already registered globally can't be recorded in Settings; Windows delivers it to that app.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). The stack is Tauri 2 (Rust) with Angular 22 (signals, zoneless), and speech recognition uses cpal and Vosk natively. Design decisions are recorded in [docs/adr](docs/adr).

## License

[MIT](LICENSE). The Vosk model is Apache 2.0, by Alpha Cephei.
