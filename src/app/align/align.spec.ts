import type { Word } from '../core/contracts';
import { normalizeSpeech, normalizeWord } from '../core/normalize';
import { align } from './align';

function script(text: string): Word[] {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((t, index) => ({ index, text: t, norm: normalizeWord(t), blockId: 0 }));
}

/** Distinct 4-letter pseudo-words ("aaaa", "aaab"…): content weight, too short for fuzzy collisions. */
function filler(i: number): string {
  const a = 'abcdefghijklmnopqrstuvwxyz';
  return [17_576, 676, 26, 1].map((d) => a[Math.floor(i / d) % 26]).join('');
}

function fillerScript(n: number): Word[] {
  return script(Array.from({ length: n }, (_, i) => filler(i)).join(' '));
}

const heard = (text: string) => normalizeSpeech(text);

describe('align', () => {
  it('exact: advances past the heard words', () => {
    const words = script('hola a todos bienvenidos al canal');
    expect(align({ words, cursor: 0, heard: heard('hola a todos') }).cursor).toBe(3);
  });

  it('misrecognition: "tela adaptar" for "teleprompter" still advances', () => {
    const words = script('construir un teleprompter que nadie ve');
    const r = align({ words, cursor: 0, heard: heard('construir un tela adaptar que nadie') });
    expect(r.cursor).toBe(5);
  });

  it('misrecognition mid-stream: the chain bridges the substituted word', () => {
    const words = script('hoy vamos a construir un teleprompter que nadie ve');
    const r = align({
      words,
      cursor: 5,
      heard: heard('hoy vamos a construir un tela adaptar que'),
    });
    expect(r.cursor).toBe(7);
  });

  it('one skipped script word still advances past it', () => {
    const words = script('hola a todos bienvenidos al canal de hoy');
    expect(align({ words, cursor: 0, heard: heard('hola a bienvenidos al') }).cursor).toBe(5);
  });

  it('repeated phrase: prefers the nearest occurrence ahead', () => {
    const texts = Array.from({ length: 50 }, (_, i) => filler(i));
    texts[10] = 'y';
    texts[11] = 'luego';
    texts[40] = 'y';
    texts[41] = 'luego';
    const words = script(texts.join(' '));
    expect(align({ words, cursor: 8, heard: ['y', 'luego'] }).cursor).toBe(12);
  });

  it('ad-lib noise not in the script: unchanged, low confidence', () => {
    const words = script('hola a todos bienvenidos al canal');
    const r = align({ words, cursor: 2, heard: heard('perdón me equivoqué esperen un momento') });
    expect(r.cursor).toBe(2);
    expect(r.confidence).toBeLessThan(0.3);
  });

  it('a lone common word never moves the cursor', () => {
    const words = script('hola de la que y en el con por patio');
    for (const w of ['de', 'la', 'que', 'y']) {
      expect(align({ words, cursor: 1, heard: [w] }).cursor).toBe(1);
    }
    // Several in a row are still not enough without a content word.
    expect(align({ words, cursor: 1, heard: heard('de la que y en el con por') }).cursor).toBe(1);
  });

  it('re-reading: 3 consecutive words behind move back; a single one does not', () => {
    const words = fillerScript(40);
    const back = [15, 16, 17].map(filler);
    expect(align({ words, cursor: 20, heard: back }).cursor).toBe(18);
    expect(align({ words, cursor: 20, heard: [filler(15)] }).cursor).toBe(20);
    expect(align({ words, cursor: 20, heard: [filler(16), filler(17)] }).cursor).toBe(20);
  });

  it('re-reading after reading ahead: history then the re-read tail', () => {
    const words = fillerScript(40);
    const said = [12, 13, 14, 15, 16, 17, 18, 19, 15, 16, 17].map(filler);
    expect(align({ words, cursor: 20, heard: said }).cursor).toBe(18);
  });

  it('misrecognized newest words do not pull the cursor back', () => {
    const words = fillerScript(40);
    const said = [...[13, 14, 15, 16, 17].map(filler), 'ruido', 'otro'];
    expect(align({ words, cursor: 20, heard: said }).cursor).toBe(20);
  });

  it('revised partial dropping the last word does not jitter back', () => {
    const words = fillerScript(40);
    const said = [14, 15, 16, 17, 18].map(filler);
    expect(align({ words, cursor: 20, heard: said }).cursor).toBe(20);
  });

  it('never jumps back beyond the back window', () => {
    const words = fillerScript(200);
    const said = [10, 11, 12, 13, 14, 15].map(filler);
    expect(align({ words, cursor: 150, heard: said }).cursor).toBe(150);
  });

  it('skipped paragraph ~80 words ahead: needs 4 consecutive matches', () => {
    const words = fillerScript(300);
    const three = [80, 81, 82].map(filler);
    expect(align({ words, cursor: 0, heard: three }).cursor).toBe(0);
    expect(align({ words, cursor: 0, heard: [...three, filler(83)] }).cursor).toBe(84);
  });

  it('a far run of common words does not jump', () => {
    const texts = Array.from({ length: 200 }, (_, i) => filler(i));
    texts.splice(90, 5, 'de', 'la', 'que', 'y', 'el');
    const words = script(texts.join(' '));
    expect(align({ words, cursor: 0, heard: ['de', 'la', 'que', 'y', 'el'] }).cursor).toBe(0);
  });

  it('within the near window a sentence skip moves with two content words', () => {
    const words = fillerScript(100);
    expect(align({ words, cursor: 0, heard: [filler(15), filler(16)] }).cursor).toBe(17);
  });

  it('continues after a skipped word in a long history', () => {
    const words = fillerScript(40);
    const said = [2, 3, 4, 5, 6, 7, 8, 9, 11].map(filler);
    expect(align({ words, cursor: 10, heard: said }).cursor).toBe(12);
  });

  it('accents and case: "adios" matches "Adiós"', () => {
    const words = script('Bueno, ¡Adiós! Nos vemos');
    expect(align({ words, cursor: 1, heard: ['adios'] }).cursor).toBe(2);
  });

  it('near-miss spelling matches (fuzzy)', () => {
    const words = script('vamos a construir algo enorme');
    expect(align({ words, cursor: 0, heard: heard('vamos a construí algo') }).cursor).toBe(4);
  });

  it('script digits vs spoken number: no crash, recovers on the following words', () => {
    const words = script('lanzamos en el año 2026 una versión nueva para todos ustedes');
    const at = (text: string, cursor: number) => align({ words, cursor, heard: heard(text) });
    const mid = at('lanzamos en el año dos mil veintiséis', 4);
    expect(mid.cursor).toBeGreaterThanOrEqual(4);
    expect(mid.cursor).toBeLessThanOrEqual(5);
    const r = at('año dos mil veintiséis una versión nueva', mid.cursor);
    expect(r.cursor).toBe(8);
  });

  it('empty heard or cursor at the end: unchanged', () => {
    const words = script('hola a todos');
    expect(align({ words, cursor: 1, heard: [] })).toEqual({ cursor: 1, confidence: 0 });
    expect(align({ words, cursor: 3, heard: heard('a todos') }).cursor).toBe(3);
    expect(align({ words: [], cursor: 0, heard: ['hola'] }).cursor).toBe(0);
  });

  it('confidence is high when following cleanly', () => {
    const words = script('hola a todos bienvenidos al canal de cocina');
    expect(align({ words, cursor: 0, heard: heard('hola a todos bienvenidos') }).confidence).toBe(
      1,
    );
  });

  it('performance: 20k-word script, 1000 calls with 8 heard words < 200 ms', () => {
    const words = fillerScript(20_000);
    const noise = heard('bueno eh pues nada vamos alla venga ya');
    const start = performance.now();
    let cursor = 5_000;
    for (let call = 0; call < 1000; call++) {
      // Alternate on-track windows and pure noise (noise forces the expanded "lost" search).
      const said =
        call % 2 === 0 ? Array.from({ length: 8 }, (_, k) => filler(cursor - 7 + k)) : noise;
      cursor = align({ words, cursor, heard: said }).cursor + (call % 2 === 0 ? 1 : 0);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });
});
