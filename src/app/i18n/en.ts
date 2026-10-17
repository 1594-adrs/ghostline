import type { Dictionary } from './es';

export const EN: Dictionary = {
  'app.name': 'Ghostline',

  // overlay
  'overlay.empty.title': 'No script open',
  'overlay.empty.body':
    'Open a .md or .txt file from the Ghostline icon in the system tray, or from Settings.',
  'overlay.end': 'End of script',
  'overlay.pause': 'Pause',
  'overlay.edit.drag': 'Drag to move',
  'overlay.edit.done': 'Finish with',
  'overlay.edit.hotkeys': 'Keyboard shortcuts',
  'hud.playing': 'Reading',
  'hud.paused': 'Paused',
  'hud.finished': 'Finished',
  'hud.auto': 'Auto',
  'hud.voice': 'Voice',
  'hud.micOff': 'Microphone off',
  'hud.confidence': 'Confidence {pct}%',
  'hud.wpmUnit': 'wpm',

  // hotkey actions
  'hotkey.toggle-play': 'Play or pause',
  'hotkey.prev-block': 'Previous paragraph',
  'hotkey.next-block': 'Next paragraph',
  'hotkey.speed-down': 'Slower',
  'hotkey.speed-up': 'Faster',
  'hotkey.prev-section': 'Previous section',
  'hotkey.next-section': 'Next section',
  'hotkey.toggle-visible': 'Show or hide',
  'hotkey.toggle-edit': 'Move and resize',
  'hotkey.toggle-voice': 'Follow voice or auto',
  'hotkey.cycle-mode': 'Change layout',
  'hotkey.toggle-capture': 'Hide from capture',

  // key names
  'key.Super': 'Win',
  'key.PageUp': 'PgUp',
  'key.PageDown': 'PgDn',
  'key.Space': 'Space',
  'key.Delete': 'Del',
  'key.Insert': 'Ins',
  'key.Home': 'Home',
  'key.End': 'End',
  'key.Enter': 'Enter',
  'key.Backspace': 'Backspace',

  // settings — shell
  'settings.title': 'Settings',
  'settings.nav': 'Settings sections',
  'settings.error.dismiss': 'Dismiss notice',

  // script
  'script.title': 'Script',
  'script.none': 'No script open',
  'script.open': 'Open script…',
  'script.change': 'Change script…',
  'script.current': 'Current script',
  'script.reloads': 'Reloads by itself when you save the file.',
  'script.syntax': 'How Ghostline reads your script',
  'script.syntax.heading': 'starts a section; shown, not read',
  'script.syntax.note': 'note to yourself, dimmed; not read',
  'script.syntax.pause': 'visible pause before moving on',
  'script.syntax.emphasis': 'emphasis',

  // display
  'display.title': 'Display',
  'display.mode': 'Layout',
  'display.mode.corner': 'Corner',
  'display.mode.corner.hint': 'Compact, top right',
  'display.mode.strip': 'Strip',
  'display.mode.strip.hint': 'Under the camera, eyes forward',
  'display.mode.full': 'Full screen',
  'display.mode.full.hint': 'For reading from a distance',
  'display.fontSize': 'Text size',
  'display.opacity': 'Background opacity',
  'display.opacity.hint': 'Lower lets you see what is behind; higher reads better.',
  'display.speed': 'Auto speed',
  'display.speed.hint': 'Words per minute when not following your voice.',
  'display.preview': 'Preview',
  'display.preview.sample': 'Good morning everyone, thanks for joining.',
  'unit.px': '{n} px',
  'unit.pct': '{n}%',
  'unit.wpm': '{n} wpm',

  // voice
  'voice.title': 'Voice',
  'voice.model': 'Recognition model',
  'voice.model.installed': 'Installed and ready',
  'voice.model.missing': 'Downloaded once, then works offline.',
  'voice.model.install': 'Download model',
  'voice.model.installing': 'Downloading…',
  'voice.model.progress': '{received} of {total} MB',
  'voice.model.progressUnknown': '{received} MB downloaded',
  'voice.mic': 'Microphone',
  'voice.mic.default': 'System default',
  'voice.mic.refresh': 'Refresh the microphone list',
  'voice.note':
    'Recognition only understands Spanish for now. Audio is processed on your computer and never leaves it.',

  // hotkeys
  'hotkeys.title': 'Keyboard shortcuts',
  'hotkeys.hint': 'They work anywhere in Windows, even when Ghostline is not focused.',
  'hotkeys.reset': 'Reset shortcuts',
  'hotkeys.record': 'Change the shortcut for {action}. Current: {combo}',
  'hotkeys.recording': 'Press the combination…',
  'hotkeys.recording.hint': 'Esc to cancel',
  'hotkeys.needsModifier': 'Add Ctrl, Alt, Shift or Win to the key.',
  'hotkeys.unsupported': 'That key cannot be used as a global shortcut.',
  'hotkeys.altgr':
    'Ctrl+Alt with a letter, digit or symbol is AltGr on Windows and would block characters like € or @. Use F1–F12, arrows or PgUp/PgDn.',
  'hotkeys.duplicate': 'Also assigned to “{action}”.',

  // privacy
  'privacy.title': 'Privacy',
  'privacy.capture': 'Hide from capture and video calls',
  'privacy.capture.hint':
    'Meet, Teams, OBS and screen recordings do not show the prompter; you still see it.',
  'privacy.capture.limit':
    'Some capture paths (capture cards, older software) may still show it. Do a test run before presenting.',

  // language
  'language.title': 'Language',
  'language.label': 'Interface language',
};
