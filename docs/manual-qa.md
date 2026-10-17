# Manual QA checklist (Windows 11)

Run this on the installed build (`npm run tauri build`). It cannot run in CI. Record the build, date, and pass/fail for each item in the release PR.

## Overlay

- [ ] The overlay is visible on screen and stays above other windows, including a maximized browser.
- [ ] **Capture hidden (default on):** the overlay does not appear in OBS (Display Capture and Window Capture), Snipping Tool (Win+Shift+S), or the Google Meet "present screen" preview. The settings window is hidden from capture too.
- [ ] Toggling capture (Ctrl+Alt+F12) makes the overlay show up in OBS, and toggling again hides it.
- [ ] **Click-through:** with the overlay over a text field, clicks reach the field and you can type in it.
- [ ] Showing the overlay (Ctrl+Alt+F8) does not take focus from the app you are typing in.
- [ ] Edit mode (Ctrl+Alt+F9): the overlay can be dragged and resized. Leaving edit mode makes it click-through again, and its position is restored after a restart.
- [ ] Cycling the mode (Ctrl+Alt+F11) goes corner → strip → full, and each mode keeps its own position.

## Hotkeys

- [ ] Every default hotkey works while another app has focus.
- [ ] AltGr characters (`@`, `€`, `#`, `[`) still type normally in other apps while Ghostline runs (Spanish keyboard layout).
- [ ] A hotkey that another app already holds shows a conflict in Settings, and the app does not crash.

## Script

- [ ] Opening a `.md` and a `.txt` file works; other extensions and files over 2 MB are rejected with a clear message.
- [ ] Editing and saving the script in VS Code and in Notepad updates the overlay, and the reading position is kept.
- [ ] Headings, notes (`>`), pauses (`---`), and emphasis render correctly. Embedded `<script>` is shown as text and not executed.
- [ ] Section jumps (Ctrl+Alt+PageUp/PageDown) and block steps (Ctrl+Alt+Up/Down) land on the right words.

## Voice

- [ ] The first enable downloads the model with visible progress. A broken download (e.g. Wi-Fi turned off mid-download) shows an error and leaves no partial model.
- [ ] Reading a 2-minute Spanish script aloud: the cursor follows within about one line and does not jump backward on its own.
- [ ] Notes (`>`) are skipped, ad-libs do not move the cursor, and skipping a paragraph recovers within a sentence.
- [ ] Picking a non-default microphone in Settings works.
- [ ] With microphone access blocked (Settings → Privacy → Microphone → desktop apps off), you get an actionable error.

## Display

- [ ] The display looks right at 100 % and 150 % scaling.
- [ ] With two monitors, the overlay stays on its monitor and default bounds use that monitor's work area.
- [ ] The UI language switches between es and en in both windows.
