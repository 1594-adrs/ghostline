/**
 * KeyboardEvent ↔ Tauri accelerator (`global-hotkey` syntax, e.g. `Ctrl+Alt+F7`). Pure, no Angular.
 * Keys are taken from `event.code` so the result does not depend on the keyboard layout.
 */

export type KeyEventLike = Pick<
  KeyboardEvent,
  'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'
>;

export type Recorded =
  /** Only modifiers held so far; `partial` is e.g. `Ctrl+Alt`. */
  | { readonly kind: 'pending'; readonly partial: string }
  | { readonly kind: 'ok'; readonly accelerator: string }
  | { readonly kind: 'needs-modifier' }
  | { readonly kind: 'unsupported' };

const MODIFIER_CODES = new Set([
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'MetaLeft',
  'MetaRight',
  'OSLeft',
  'OSRight',
]);

/** Symbol keys (they type a character) and how they are shown. */
const SYMBOL_GLYPHS: Readonly<Record<string, string>> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
};

const NAMED_CODES: Readonly<Record<string, string>> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  Home: 'Home',
  End: 'End',
  Insert: 'Insert',
  Delete: 'Delete',
  Space: 'Space',
  Enter: 'Enter',
  Backspace: 'Backspace',
  Pause: 'Pause',
  PrintScreen: 'PrintScreen',
  ScrollLock: 'ScrollLock',
  NumpadAdd: 'NumAdd',
  NumpadSubtract: 'NumSubtract',
  NumpadMultiply: 'NumMultiply',
  NumpadDivide: 'NumDivide',
  NumpadDecimal: 'NumDecimal',
  NumpadEnter: 'NumEnter',
};

/** `event.code` → accelerator key token, or null when global-hotkey cannot register it. */
export function keyToken(code: string): string | null {
  let m = /^Key([A-Z])$/.exec(code);
  if (m) return m[1];
  m = /^Digit(\d)$/.exec(code);
  if (m) return m[1];
  m = /^Numpad(\d)$/.exec(code);
  if (m) return `Num${m[1]}`;
  m = /^F(\d{1,2})$/.exec(code);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 24) return code;
  if (code in SYMBOL_GLYPHS) return code;
  return NAMED_CODES[code] ?? null;
}

function modifiers(e: KeyEventLike): string[] {
  const mods: string[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  if (e.metaKey) mods.push('Super');
  return mods;
}

/** Interprets one keydown while recording. Global shortcuts need at least one modifier. */
export function recordKey(e: KeyEventLike): Recorded {
  const mods = modifiers(e);
  if (MODIFIER_CODES.has(e.code)) return { kind: 'pending', partial: mods.join('+') };
  const key = keyToken(e.code);
  if (!key) return { kind: 'unsupported' };
  if (mods.length === 0) return { kind: 'needs-modifier' };
  return { kind: 'ok', accelerator: [...mods, key].join('+') };
}

/** Splits `Ctrl+Alt+F7` into its tokens. */
export function acceleratorParts(accelerator: string): string[] {
  return accelerator
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
}

/** True for a letter, digit or symbol key: it produces a character. */
export function isCharacterKey(token: string): boolean {
  return (
    /^([A-Z0-9]|Key[A-Z]|Digit\d)$/i.test(token) ||
    token in SYMBOL_GLYPHS ||
    Object.values(SYMBOL_GLYPHS).includes(token)
  );
}

/** Ctrl+Alt+<character> is AltGr+<character> on Windows: registering it eats characters such as € or @. */
export function isAltGrRisk(accelerator: string): boolean {
  const parts = acceleratorParts(accelerator).map((p) => p.toLowerCase());
  const key = acceleratorParts(accelerator).at(-1) ?? '';
  const ctrl = parts.includes('ctrl') || parts.includes('control');
  const alt = parts.includes('alt') || parts.includes('option');
  return ctrl && alt && isCharacterKey(key);
}

const KEY_GLYPHS: Readonly<Record<string, string>> = {
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
};

/** Key names that are translated in the UI (`key.<token>` message keys). */
export const LOCALIZED_KEYS = [
  'Super',
  'PageUp',
  'PageDown',
  'Space',
  'Delete',
  'Insert',
  'Home',
  'End',
  'Enter',
  'Backspace',
] as const;
export type LocalizedKey = (typeof LOCALIZED_KEYS)[number];

/** Display label for one token: arrows as glyphs, localized names via `translate`, rest verbatim. */
export function keyLabel(token: string, translate: (key: LocalizedKey) => string): string {
  if (KEY_GLYPHS[token]) return KEY_GLYPHS[token];
  if ((LOCALIZED_KEYS as readonly string[]).includes(token))
    return translate(token as LocalizedKey);
  if (SYMBOL_GLYPHS[token]) return SYMBOL_GLYPHS[token];
  return token.startsWith('Num') && token.length > 3 ? `Num ${token.slice(3)}` : token;
}
