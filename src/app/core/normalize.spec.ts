import { describe, expect, it } from 'vitest';
import { normalizeSpeech, normalizeWord } from './normalize';

describe('normalizeWord', () => {
  it.each([
    ['Adiós', 'adios'],
    ['Ñandú', 'nandu'],
    ['¿Qué?', 'que'],
    ['e-mail', 'email'],
    ['...', ''],
  ])('normalizes %j to %j', (raw, expected) => {
    expect(normalizeWord(raw)).toBe(expected);
  });
});

describe('normalizeSpeech', () => {
  it('splits on whitespace, normalizes each word and drops empties', () => {
    expect(normalizeSpeech('  hola   QUÉ tal ')).toEqual(['hola', 'que', 'tal']);
  });
});
