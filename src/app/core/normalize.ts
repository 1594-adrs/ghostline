/**
 * Comparison form shared by the script parser and speech alignment:
 * lowercase, diacritics stripped (á→a, ñ→n, ü→u), everything but letters and digits removed.
 * Returns '' for pure punctuation.
 */
export function normalizeWord(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Splits recognized speech into normalized words, dropping empties. */
export function normalizeSpeech(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w !== '');
}
