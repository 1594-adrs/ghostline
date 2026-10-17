import { Lexer, type Token, type Tokens } from 'marked';
import type {
  Block,
  BlockKind,
  Emphasis,
  Run,
  Script,
  ScriptFormat,
  ScriptMeta,
  Section,
  Word,
} from '../core/contracts';
import { normalizeWord } from '../core/normalize';

interface InlinePiece {
  readonly text: string;
  readonly emphasis: readonly Emphasis[];
  /** Raw HTML tags: displayed literally, never spoken. */
  readonly literal?: true;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
/** Leading punctuation, word core, trailing punctuation. */
const WORD_PARTS = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su;

/** Markdown/plain text → renderable blocks + spoken word index. Never emits HTML: raw HTML is kept as literal text. */
export function parseScript(source: string, format: ScriptFormat): Script {
  const builder = new ScriptBuilder();
  if (format === 'txt') {
    for (const para of source.split(/\r?\n\s*\r?\n/)) {
      const text = para.replace(/\s+/g, ' ').trim();
      if (text) builder.add('paragraph', [{ text, emphasis: [] }]);
    }
    return builder.build({});
  }
  const { meta, body } = splitFrontmatter(source);
  for (const token of new Lexer({ gfm: true }).lex(body)) addBlock(builder, token, false);
  return builder.build(meta);
}

function splitFrontmatter(source: string): { meta: ScriptMeta; body: string } {
  const match = FRONTMATTER.exec(source);
  if (!match) return { meta: {}, body: source };
  const meta: { title?: string; speed?: number; fontSize?: number } = {};
  for (const line of match[1].split(/\r?\n/)) {
    const [, key, value] = /^\s*(\w+)\s*:\s*(.*?)\s*$/.exec(line) ?? [];
    if (key === 'title' && value) meta.title = value.replace(/^["']|["']$/g, '');
    if (key === 'speed' && Number(value) > 0) meta.speed = Number(value);
    if (key === 'fontSize' && Number(value) > 0) meta.fontSize = Number(value);
  }
  return { meta, body: source.slice(match[0].length) };
}

function addBlock(builder: ScriptBuilder, token: Token, inNote: boolean): void {
  const kind = (k: BlockKind): BlockKind => (inNote ? 'note' : k);
  switch (token.type) {
    case 'heading':
      if (inNote) return builder.add('note', inline((token as Tokens.Heading).tokens));
      return builder.addHeading(
        (token as Tokens.Heading).depth,
        inline((token as Tokens.Heading).tokens),
      );
    case 'paragraph':
      return builder.add(kind('paragraph'), inline((token as Tokens.Paragraph).tokens));
    case 'text': // bare text inside tight list items
      return builder.add(kind('paragraph'), inline((token as Tokens.Text).tokens ?? [token]));
    case 'blockquote':
      for (const child of (token as Tokens.Blockquote).tokens) addBlock(builder, child, true);
      return;
    case 'list':
      for (const item of (token as Tokens.List).items) addListItem(builder, item, inNote);
      return;
    case 'hr':
      return inNote ? undefined : builder.add('pause', []);
    case 'code':
      return builder.add('note', [{ text: (token as Tokens.Code).text, emphasis: ['code'] }]);
    case 'html':
      return builder.add('note', [
        { text: (token as Tokens.HTML).text.trim(), emphasis: [], literal: true },
      ]);
    case 'table': {
      const table = token as Tokens.Table;
      for (const row of [table.header, ...table.rows])
        builder.add(
          kind('paragraph'),
          row.flatMap((cell, i) => [...(i ? [space()] : []), ...inline(cell.tokens)]),
        );
      return;
    }
    default: // space, def, …
      return;
  }
}

function addListItem(builder: ScriptBuilder, item: Tokens.ListItem, inNote: boolean): void {
  const own: InlinePiece[] = [];
  for (const child of item.tokens) {
    if (child.type === 'list') {
      flush();
      for (const sub of (child as Tokens.List).items) addListItem(builder, sub, inNote);
    } else if (child.type === 'text' || child.type === 'paragraph') {
      if (own.length) own.push(space());
      own.push(...inline((child as Tokens.Text).tokens ?? [child]));
    } else if (child.type !== 'checkbox' && child.type !== 'space') {
      flush();
      addBlock(builder, child, inNote);
    }
  }
  flush();

  function flush(): void {
    if (own.length) builder.add(inNote ? 'note' : 'list-item', own.splice(0));
  }
}

function inline(tokens: readonly Token[], emphasis: readonly Emphasis[] = []): InlinePiece[] {
  const out: InlinePiece[] = [];
  for (const t of tokens) {
    switch (t.type) {
      case 'strong':
        out.push(...inline((t as Tokens.Strong).tokens, [...emphasis, 'strong']));
        break;
      case 'em':
        out.push(...inline((t as Tokens.Em).tokens, [...emphasis, 'em']));
        break;
      case 'codespan':
        out.push({ text: (t as Tokens.Codespan).text, emphasis: [...emphasis, 'code'] });
        break;
      case 'br':
        out.push({ text: ' ', emphasis });
        break;
      case 'html':
        out.push({ text: (t as Tokens.HTML).text, emphasis, literal: true });
        break;
      case 'image':
        if ((t as Tokens.Image).text) out.push({ text: (t as Tokens.Image).text, emphasis });
        break;
      default: {
        // text, escape, link, del…: recurse into children when present, else take the text.
        const nested = (t as Tokens.Generic).tokens;
        if (nested?.length) out.push(...inline(nested, emphasis));
        else out.push({ text: (t as Tokens.Text).text ?? '', emphasis });
      }
    }
  }
  return out;
}

function space(): InlinePiece {
  return { text: ' ', emphasis: [] };
}

class ScriptBuilder {
  private readonly blocks: Block[] = [];
  private readonly words: Word[] = [];
  private readonly sections: { index: number; title: string; blockId: number }[] = [];

  addHeading(level: number, pieces: readonly InlinePiece[]): void {
    const title = pieces
      .map((p) => p.text)
      .join('')
      .replace(/\s+/g, ' ')
      .trim();
    this.sections.push({ index: this.sections.length, title, blockId: this.blocks.length });
    this.push('heading', pieces, level);
  }

  add(kind: BlockKind, pieces: readonly InlinePiece[]): void {
    if (kind !== 'pause' && !pieces.some((p) => p.text.trim())) return;
    this.push(kind, pieces);
  }

  build(meta: ScriptMeta): Script {
    const sections: Section[] = this.sections.map((s) => ({
      ...s,
      firstWord: this.words.find((w) => w.blockId > s.blockId)?.index ?? this.words.length,
    }));
    return { meta, blocks: this.blocks, words: this.words, sections };
  }

  private push(kind: BlockKind, pieces: readonly InlinePiece[], level?: number): void {
    const id = this.blocks.length;
    const spoken = kind === 'paragraph' || kind === 'list-item';
    const runs: Run[] = [];
    for (const piece of pieces) {
      for (const chunk of piece.text.split(/(\s+)/)) {
        if (!chunk) continue;
        const norm = spoken && !piece.literal ? normalizeWord(chunk) : '';
        if (!norm) {
          runs.push({ text: chunk, emphasis: piece.emphasis, wordIndex: null });
          continue;
        }
        const [, lead, core, trail] = WORD_PARTS.exec(chunk) ?? ['', '', chunk, ''];
        if (lead) runs.push({ text: lead, emphasis: piece.emphasis, wordIndex: null });
        const index = this.words.length;
        this.words.push({ index, text: core, norm, blockId: id });
        runs.push({ text: core, emphasis: piece.emphasis, wordIndex: index });
        if (trail) runs.push({ text: trail, emphasis: piece.emphasis, wordIndex: null });
      }
    }
    this.blocks.push({
      id,
      kind,
      ...(level ? { level } : {}),
      runs,
      spoken,
      section: this.sections.length - 1,
    });
  }
}
