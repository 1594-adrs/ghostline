# ADR-0002: Script format — Markdown subset (plus plain text)

## Status

Accepted

## Date

2026-10-16

## Context

Scripts are written by the user in any editor and read live while recording. The format has to:

- be plain text that people already know;
- support sections (to jump between), stage directions that are shown but not read aloud, and pauses;
- allow per-script defaults (speed, font size);
- never execute anything embedded in the file.

## Decision

Accept `.md`/`.markdown` (a GFM subset) and `.txt`. `parseScript` maps the `marked` lexer tokens to Ghostline's own block model (`src/app/core/contracts.ts`), and Angular templates render that model. `innerHTML` is never used.

| Markdown                                                               | Block                            | Spoken (followed by voice) |
| ---------------------------------------------------------------------- | -------------------------------- | -------------------------- |
| `# Heading` (any level)                                                | `heading` — starts a section     | no                         |
| paragraph, table row                                                   | `paragraph`                      | yes                        |
| `- item` / `1. item` (nested lists flattened, task checkboxes ignored) | `list-item`                      | yes                        |
| `> quote`, fenced code, block HTML                                     | `note` (stage direction, dimmed) | no                         |
| `---`                                                                  | `pause`                          | no                         |
| `**bold**`, `*em*`, `` `code` ``                                       | emphasis on runs                 | yes                        |
| inline HTML tags                                                       | shown literally                  | no                         |

Optional frontmatter at the very top: `title`, `speed` (words per minute), `fontSize` (px).

`.txt` files are split into paragraphs on blank lines, and Markdown syntax in them is not interpreted.

The file is re-read whenever it is saved (hot reload), and the cursor keeps its position.

## Alternatives Considered

### Custom markup (e.g. `[PAUSE]`, `{note}`)

- Rejected: users would have to learn it, and editors would not preview it.

### Fountain (screenplay format)

- Rejected: it is aimed at screenplays and its tooling is niche. A talk or video script has no use for character or dialogue structure.

### Rendering Markdown to HTML (marked → sanitizer → innerHTML)

- Rejected: highlighting the current word needs a word index per run, which rendered HTML does not give us. Rendering our own model also removes a whole class of XSS issues instead of relying on a sanitizer.

## Consequences

- Only these constructs are styled. Links render as their text, and images render as their alt text.
- Words are compared with speech after normalization (`normalizeWord`: lowercase, accents and punctuation stripped). The same function is applied to the script and to the recognizer output.
- Scripts are capped at 2 MB, and only the listed extensions are read. The Rust command `read_script` enforces this.
