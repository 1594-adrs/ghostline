import { describe, expect, it } from 'vitest';
import { parseScript } from './parse-script';

const words = (source: string) => parseScript(source, 'md').words.map((w) => w.text);

describe('parseScript', () => {
  describe('frontmatter', () => {
    it('reads title (quotes stripped), speed and fontSize', () => {
      const script = parseScript(
        '---\ntitle: "Mi guion"\nspeed: 120\nfontSize: 40\n---\nHola',
        'md',
      );

      expect(script.meta).toEqual({ title: 'Mi guion', speed: 120, fontSize: 40 });
    });

    it('ignores non-numeric and non-positive speed and fontSize', () => {
      const script = parseScript('---\nspeed: rapido\nfontSize: 0\n---\nHola', 'md');

      expect(script.meta.speed).toBeUndefined();
      expect(script.meta.fontSize).toBeUndefined();
    });

    it('keeps frontmatter out of the body', () => {
      const script = parseScript('---\ntitle: Guion\nspeed: 120\n---\nHola', 'md');

      expect(script.words.map((w) => w.text)).toEqual(['Hola']);
      expect(script.blocks).toHaveLength(1);
    });

    it('treats a later --- as a pause block', () => {
      const script = parseScript('---\nspeed: 120\n---\nUno\n\n---\n\nDos', 'md');

      expect(script.blocks.map((b) => b.kind)).toEqual(['paragraph', 'pause', 'paragraph']);
    });
  });

  describe('headings and sections', () => {
    const source = 'Antes\n\n# Uno\n\nA B\n\n## Dos\n\nC D E\n\n# Tres\n\nF';

    it('creates sections with title, blockId and firstWord', () => {
      const { sections } = parseScript(source, 'md');

      expect(sections).toEqual([
        { index: 0, title: 'Uno', blockId: 1, firstWord: 1 },
        { index: 1, title: 'Dos', blockId: 3, firstWord: 3 },
        { index: 2, title: 'Tres', blockId: 5, firstWord: 6 },
      ]);
    });

    it('sets firstWord to words.length when the heading is the last spoken content', () => {
      const { sections, words: all } = parseScript('Intro\n\n# Final', 'md');

      expect(sections).toEqual([{ index: 0, title: 'Final', blockId: 1, firstWord: all.length }]);
    });

    it('never puts heading text into words', () => {
      expect(words(source)).toEqual(['Antes', 'A', 'B', 'C', 'D', 'E', 'F']);
    });

    it('assigns each block the index of its latest heading, or -1 before the first', () => {
      const { blocks } = parseScript(source, 'md');

      expect(blocks.map((b) => b.section)).toEqual([-1, 0, 0, 1, 1, 2, 2]);
    });
  });

  describe('spoken words and punctuation', () => {
    it('strips surrounding punctuation from words and keeps it in runs', () => {
      const script = parseScript('¡Hola, mundo!', 'md');

      expect(script.words.map((w) => w.text)).toEqual(['Hola', 'mundo']);
      expect(script.blocks[0].runs.map((r) => r.text).join('')).toBe('¡Hola, mundo!');
    });

    it('applies strong emphasis to bold text', () => {
      const run = parseScript('**bold**', 'md').blocks[0].runs.find((r) => r.text === 'bold');

      expect(run?.emphasis).toEqual(['strong']);
    });

    it('nests strong and em for triple-asterisk text', () => {
      const run = parseScript('***x***', 'md').blocks[0].runs.find((r) => r.text === 'x');

      expect([...(run?.emphasis ?? [])].sort()).toEqual(['em', 'strong']);
    });

    it('nests em inside strong for mixed emphasis', () => {
      const run = parseScript('**a *b* c**', 'md').blocks[0].runs.find((r) => r.text === 'b');

      expect(run?.emphasis).toEqual(['strong', 'em']);
    });

    it('marks inline code with code emphasis and speaks it', () => {
      const run = parseScript('`npm`', 'md').blocks[0].runs.find((r) => r.text === 'npm');

      expect(run?.emphasis).toEqual(['code']);
      expect(run?.wordIndex).not.toBeNull();
      expect(words('`npm`')).toEqual(['npm']);
    });
  });

  describe('blockquotes', () => {
    it('makes a quote a non-spoken note with no words', () => {
      const script = parseScript('> Entra el actor', 'md');

      expect(script.blocks).toHaveLength(1);
      expect(script.blocks[0]).toMatchObject({ kind: 'note', spoken: false });
      expect(script.words).toEqual([]);
    });

    it('turns two paragraphs in one quote into two notes', () => {
      const script = parseScript('> uno\n>\n> dos', 'md');

      expect(script.blocks.map((b) => b.kind)).toEqual(['note', 'note']);
    });

    it('turns a list inside a quote into notes', () => {
      const script = parseScript('> - a\n> - b', 'md');

      expect(script.blocks.map((b) => b.kind)).toEqual(['note', 'note']);
      expect(script.words).toEqual([]);
    });
  });

  describe('lists', () => {
    it('emits list items in document order with nested items after their parent', () => {
      const script = parseScript('- uno\n  - sub\n- dos', 'md');

      expect(script.blocks.map((b) => b.kind)).toEqual(['list-item', 'list-item', 'list-item']);
      expect(script.words.map((w) => w.text)).toEqual(['uno', 'sub', 'dos']);
    });

    it('ignores the GFM task checkbox and speaks the item text', () => {
      const script = parseScript('- [ ] x', 'md');

      expect(script.blocks[0]).toMatchObject({ kind: 'list-item', spoken: true });
      expect(script.words.map((w) => w.text)).toEqual(['x']);
    });
  });

  describe('thematic breaks and code fences', () => {
    it('makes --- a pause block with no runs', () => {
      const pause = parseScript('Uno\n\n---\n\nDos', 'md').blocks[1];

      expect(pause).toMatchObject({ kind: 'pause', runs: [], spoken: false });
    });

    it('makes a fenced code block a non-spoken code note', () => {
      const script = parseScript('```\nconst a = 1;\n```', 'md');

      expect(script.blocks).toHaveLength(1);
      expect(script.blocks[0]).toMatchObject({ kind: 'note', spoken: false });
      expect(script.blocks[0].runs.every((r) => r.emphasis.includes('code'))).toBe(true);
      expect(script.words).toEqual([]);
    });
  });

  describe('raw HTML', () => {
    it('keeps inline tags as non-word runs and speaks the text between them', () => {
      const script = parseScript('Esto es <b>ya</b> listo', 'md');
      const tag = script.blocks[0].runs.find((r) => r.text === '<b>');

      expect(tag?.wordIndex).toBeNull();
      expect(script.words.map((w) => w.text)).toEqual(['Esto', 'es', 'ya', 'listo']);
    });

    it('turns a block-level script element into a note with no words', () => {
      const script = parseScript('<script>alert(1)</script>', 'md');

      expect(script.blocks).toHaveLength(1);
      expect(script.blocks[0]).toMatchObject({ kind: 'note', spoken: false });
      expect(script.words).toEqual([]);
    });
  });

  describe('txt format', () => {
    it('splits paragraphs on blank lines and collapses internal newlines', () => {
      const script = parseScript('Hola\nmundo\n\nAdiós', 'txt');

      expect(script.blocks.map((b) => b.kind)).toEqual(['paragraph', 'paragraph']);
      expect(script.blocks[0].runs.map((r) => r.text).join('')).toBe('Hola mundo');
      expect(script.words.map((w) => w.text)).toEqual(['Hola', 'mundo', 'Adiós']);
    });

    it('does not interpret markdown', () => {
      const script = parseScript('# Hola', 'txt');

      expect(script.blocks).toHaveLength(1);
      expect(script.words.map((w) => w.text)).toEqual(['Hola']);
      expect(script.blocks[0].runs.find((r) => r.text === '#')?.wordIndex).toBeNull();
      expect(script.sections).toEqual([]);
    });
  });

  describe('empty input', () => {
    it.each(['', '   \n\t  \n'])('returns no blocks, words or sections for %j', (source) => {
      const script = parseScript(source, 'md');

      expect(script.blocks).toEqual([]);
      expect(script.words).toEqual([]);
      expect(script.sections).toEqual([]);
    });
  });

  describe('word invariants', () => {
    const source = '# Uno\n\nHola, **mundo** `x`\n\n- item tres\n\n> nota\n\n---\n\nFin.';

    it('gives each word an index equal to its position', () => {
      const { words: all } = parseScript(source, 'md');

      all.forEach((w, i) => expect(w.index).toBe(i));
    });

    it('points each word at the block whose runs contain that word index', () => {
      const script = parseScript(source, 'md');

      for (const word of script.words) {
        const block = script.blocks.find((b) => b.id === word.blockId);
        expect(block?.runs.some((r) => r.wordIndex === word.index)).toBe(true);
      }
    });
  });

  describe('line endings', () => {
    it('produces the same result for CRLF and LF input', () => {
      const lf =
        '---\ntitle: Guion\n---\n# Uno\n\nHola, **mundo**\n\n- item\n\n> nota\n\n---\n\nFin';
      const crlf = lf.replace(/\n/g, '\r\n');

      expect(parseScript(crlf, 'md')).toEqual(parseScript(lf, 'md'));
    });
  });
});
