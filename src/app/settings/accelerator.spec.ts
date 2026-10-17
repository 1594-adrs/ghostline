import { describe, expect, it } from 'vitest';
import { isAltGrRisk, keyToken, recordKey, type KeyEventLike } from './accelerator';

const key = (code: string, mods: Partial<KeyEventLike> = {}): KeyEventLike => ({
  code,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('keyToken', () => {
  it.each([
    ['KeyA', 'A'],
    ['Digit7', '7'],
    ['Numpad3', 'Num3'],
    ['F7', 'F7'],
    ['F24', 'F24'],
    ['ArrowUp', 'Up'],
    ['PageDown', 'PageDown'],
    ['Backquote', 'Backquote'],
    ['F25', null],
    ['CapsLock', null],
  ])('%s → %s', (code, token) => expect(keyToken(code)).toBe(token));
});

describe('recordKey', () => {
  it('builds a Tauri accelerator in Ctrl, Alt, Shift, Super order', () => {
    expect(recordKey(key('F7', { ctrlKey: true, altKey: true }))).toEqual({
      kind: 'ok',
      accelerator: 'Ctrl+Alt+F7',
    });
    expect(recordKey(key('KeyK', { metaKey: true, shiftKey: true, ctrlKey: true }))).toEqual({
      kind: 'ok',
      accelerator: 'Ctrl+Shift+Super+K',
    });
  });

  it('waits while only modifiers are held', () => {
    expect(recordKey(key('AltLeft', { ctrlKey: true, altKey: true }))).toEqual({
      kind: 'pending',
      partial: 'Ctrl+Alt',
    });
  });

  it('rejects bare keys and keys global-hotkey cannot register', () => {
    expect(recordKey(key('F7'))).toEqual({ kind: 'needs-modifier' });
    expect(recordKey(key('CapsLock', { ctrlKey: true }))).toEqual({ kind: 'unsupported' });
  });
});

describe('isAltGrRisk', () => {
  it.each([
    ['Ctrl+Alt+E', true],
    ['Control+Option+2', true],
    ['Ctrl+Alt+Minus', true],
    ['Ctrl+Alt+F7', false],
    ['Ctrl+Alt+Up', false],
    ['Ctrl+Shift+E', false],
  ])('%s → %s', (accelerator, risky) => expect(isAltGrRisk(accelerator)).toBe(risky));
});
