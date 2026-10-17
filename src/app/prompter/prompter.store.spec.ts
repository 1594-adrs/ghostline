import { describe, expect, it } from 'vitest';
import type { ScriptFile } from '../core/contracts';
import { PrompterStore } from './prompter.store';

const md = (content: string): ScriptFile => ({
  path: '/guion.md',
  name: 'guion.md',
  format: 'md',
  content,
});
const repeat = (n: number) => Array.from({ length: n }, () => 'palabra').join(' ');
/** Five spoken words in blocks 0, 2, 4 with a heading (block 1) and a note (block 3) between. */
const mixed = md('Uno dos\n\n# Titulo\n\nTres cuatro\n\n> nota\n\nCinco');

function storeWith(file: ScriptFile): PrompterStore {
  const store = new PrompterStore();
  store.loadScript(file);
  return store;
}

describe('PrompterStore', () => {
  describe('loadScript', () => {
    it('resets cursor and playing and applies meta speed (clamped) and fontSize', () => {
      const store = storeWith(md('---\nspeed: 500\nfontSize: 40\n---\nUno dos tres'));
      store.setCursor(2);
      store.togglePlay();

      store.loadScript(md('---\nspeed: 500\nfontSize: 40\n---\nUno dos tres'));

      expect(store.cursor()).toBe(0);
      expect(store.playing()).toBe(false);
      expect(store.speedWpm()).toBe(300);
      expect(store.fontSizePx()).toBe(40);
    });

    it("falls back to the given defaults so one script's meta doesn't leak into the next", () => {
      const store = storeWith(md('---\nspeed: 200\nfontSize: 40\n---\nUno'));

      store.loadScript(md('Dos'), false, { speedWpm: 140, fontSizePx: 999 });

      expect(store.speedWpm()).toBe(140);
      expect(store.fontSizePx()).toBe(160);
    });

    it('clamps a low meta speed to 60', () => {
      const store = storeWith(md('---\nspeed: 10\n---\nUno'));

      expect(store.speedWpm()).toBe(60);
    });

    it('keeps the cursor when keepPosition is true', () => {
      const store = storeWith(md(repeat(3)));
      store.setCursor(2);

      store.loadScript(md(repeat(5)), true);

      expect(store.cursor()).toBe(2);
    });

    it('clamps the kept cursor to the length of the new words', () => {
      const store = storeWith(md(repeat(3)));
      store.setCursor(3);

      store.loadScript(md(repeat(1)), true);

      expect(store.cursor()).toBe(1);
    });
  });

  describe('setCursor', () => {
    it('clamps below 0 to 0 and above words.length to words.length', () => {
      const store = storeWith(md(repeat(4)));

      store.setCursor(-5);
      expect(store.cursor()).toBe(0);

      store.setCursor(999);
      expect(store.cursor()).toBe(4);
    });

    it('rounds to the nearest whole word', () => {
      const store = storeWith(md(repeat(10)));

      store.setCursor(2.6);
      expect(store.cursor()).toBe(3);

      store.setCursor(2.4);
      expect(store.cursor()).toBe(2);
    });
  });

  describe('togglePlay', () => {
    it('toggles playing on and off', () => {
      const store = storeWith(md(repeat(3)));

      store.togglePlay();
      expect(store.playing()).toBe(true);

      store.togglePlay();
      expect(store.playing()).toBe(false);
    });

    it('does not start when the script is finished', () => {
      const store = storeWith(md(repeat(3)));
      store.setCursor(3);

      store.togglePlay();

      expect(store.playing()).toBe(false);
    });
  });

  describe('advanceBy', () => {
    it('advances speedWpm words per minute of elapsed time', () => {
      const store = storeWith(md(repeat(200)));
      store.togglePlay();

      store.advanceBy(60_000);

      expect(store.cursor()).toBe(140);
    });

    it('stops at the end of the script and pauses', () => {
      const store = storeWith(md(repeat(10)));
      store.togglePlay();

      store.advanceBy(60_000);

      expect(store.cursor()).toBe(10);
      expect(store.playing()).toBe(false);
    });

    it('carries fractional words between calls', () => {
      const store = storeWith(md(repeat(50)));
      store.togglePlay();

      for (let i = 0; i < 10; i++) store.advanceBy(43);

      expect(store.cursor()).toBe(1);
    });

    it('does not move while paused', () => {
      const store = storeWith(md(repeat(200)));

      store.advanceBy(60_000);

      expect(store.cursor()).toBe(0);
    });

    it('does not move when follow is voice', () => {
      const store = storeWith(md(repeat(200)));
      store.setFollow('voice');
      store.togglePlay();

      store.advanceBy(60_000);

      expect(store.cursor()).toBe(0);
    });
  });

  describe('speed', () => {
    it('speedUp and speedDown step by 10 wpm', () => {
      const store = storeWith(md(repeat(3)));

      store.speedUp();
      expect(store.speedWpm()).toBe(150);

      store.speedDown();
      store.speedDown();
      expect(store.speedWpm()).toBe(130);
    });

    it('stays within 60..300', () => {
      const store = storeWith(md(repeat(3)));
      store.setSpeed(295);
      store.speedUp();
      expect(store.speedWpm()).toBe(300);

      store.setSpeed(65);
      store.speedDown();
      store.speedDown();
      expect(store.speedWpm()).toBe(60);
    });
  });

  describe('nextBlock and prevBlock', () => {
    it('nextBlock moves to the first word of the next spoken block, skipping headings and notes', () => {
      const store = storeWith(mixed);

      store.nextBlock();
      expect(store.cursor()).toBe(2);

      store.nextBlock();
      expect(store.cursor()).toBe(4);
    });

    it('nextBlock on the last block goes to words.length', () => {
      const store = storeWith(mixed);
      store.setCursor(4);

      store.nextBlock();

      expect(store.cursor()).toBe(5);
    });

    it('prevBlock mid-block goes to that block start', () => {
      const store = storeWith(mixed);
      store.setCursor(3);

      store.prevBlock();

      expect(store.cursor()).toBe(2);
    });

    it('prevBlock at a block start goes to the previous block start', () => {
      const store = storeWith(mixed);
      store.setCursor(2);

      store.prevBlock();

      expect(store.cursor()).toBe(0);
    });

    it('prevBlock at 0 stays at 0', () => {
      const store = storeWith(mixed);

      store.prevBlock();

      expect(store.cursor()).toBe(0);
    });
  });

  describe('nextSection and prevSection', () => {
    it('nextSection moves to the next section firstWord', () => {
      const store = sectioned();

      store.nextSection();
      expect(store.cursor()).toBe(1);

      store.setCursor(2);
      store.nextSection();
      expect(store.cursor()).toBe(3);
    });

    it('nextSection on the last section is a no-op', () => {
      const store = sectioned();
      store.setCursor(6);

      store.nextSection();

      expect(store.cursor()).toBe(6);
    });

    it('prevSection mid-section goes to that section start', () => {
      const store = sectioned();
      store.setCursor(2);

      store.prevSection();

      expect(store.cursor()).toBe(1);
    });

    it('prevSection at a section start goes to the previous section start', () => {
      const store = sectioned();
      store.setCursor(3);

      store.prevSection();

      expect(store.cursor()).toBe(1);
    });

    it('prevSection before the first section goes to 0', () => {
      const store = sectioned();
      store.setCursor(1);

      store.prevSection();

      expect(store.cursor()).toBe(0);
    });
  });

  describe('cycleMode', () => {
    it('cycles corner, strip, full and returns the new mode', () => {
      const store = new PrompterStore();

      expect(store.cycleMode()).toBe('strip');
      expect(store.mode()).toBe('strip');
      expect(store.cycleMode()).toBe('full');
      expect(store.cycleMode()).toBe('corner');
    });
  });

  describe('derived state', () => {
    it('currentSection is -1 before the first heading and the holding section after', () => {
      const store = sectioned();

      expect(store.currentSection()).toBe(-1);

      store.setCursor(1);
      expect(store.currentSection()).toBe(0);

      store.setCursor(3);
      expect(store.currentSection()).toBe(1);
    });

    it('progress is cursor divided by word count, and 0 for an empty script', () => {
      const store = storeWith(md(repeat(4)));

      store.setCursor(1);
      expect(store.progress()).toBe(0.25);

      expect(new PrompterStore().progress()).toBe(0);
    });

    it('finished is true only once the cursor reaches words.length', () => {
      const store = storeWith(md(repeat(3)));

      expect(store.finished()).toBe(false);

      store.setCursor(3);
      expect(store.finished()).toBe(true);
    });

    it('currentBlockId is the block of the next word, or the last block when finished', () => {
      const store = storeWith(md('Uno\n\n---'));

      expect(store.currentBlockId()).toBe(0);

      store.setCursor(1);
      expect(store.currentBlockId()).toBe(1);
    });
  });
});

/** Words: Antes(0) | Uno: A(1) B(2) | Dos: C(3) D(4) E(5) | Tres: F(6) */
function sectioned(): PrompterStore {
  return storeWith(md('Antes\n\n# Uno\n\nA B\n\n## Dos\n\nC D E\n\n# Tres\n\nF'));
}
