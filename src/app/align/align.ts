import type { Aligner, AlignResult, Word } from '../core/contracts';

/*
 * Tail-anchored local alignment of the heard words against a window of the script.
 *
 * dp[i][j] = best score of a monotone chain of (heard[k], script[l]) matches that ends with heard[i] ↔ script[j].
 * Chains may skip a few heard words (ad-libs, split misrecognitions, spoken numbers) and a few script words
 * (skipped words), paying a penalty per skip. A candidate is a chain ending on the last (or nearly last) heard
 * word; it proposes cursor = j + 1. Each candidate must pass a gate that gets stricter with distance and
 * direction; the survivor with the best `score - distance` wins. No survivor → hold position.
 * The window is first [cursor - BACK_WINDOW, cursor + NEAR_AHEAD); only when that yields nothing it expands
 * to FAR_AHEAD ("lost" mode), where a jump needs FAR_MIN_MATCHES matches.
 */

/** Credit of an exact match on a content word. */
const CONTENT_WEIGHT = 1;
/** Words of ≤3 letters outside the stopword list ("sol", "mar") collide more often by chance. */
const SHORT_WEIGHT = 0.6;
const SHORT_MAX_LEN = 3;
/** Function words appear every few words; they add little evidence and never move the cursor alone. */
const STOP_WEIGHT = 0.2;
/** Fraction of the weight a near-miss spelling earns ("todas" vs "todos", "construí" vs "construir"). */
const FUZZY_FACTOR = 0.6;
/** Below this length one edit is already a different word ("casa"/"cosa"), so no fuzzy matching. */
const FUZZY_MIN_LEN = 5;
/** Two edits allowed from this length on. */
const FUZZY_LONG_LEN = 8;

/** Max consecutive heard words skipped inside a chain: "dos mil veintiséis" for "2026", "tela adaptar". */
const MAX_HEARD_GAP = 3;
/** Max consecutive script words skipped inside a chain (speaker drops a word or two). */
const MAX_SCRIPT_GAP = 3;
/** Cost per skipped heard word (ad-lib). */
const HEARD_SKIP_COST = 0.3;
/** Cost per skipped script word. */
const SCRIPT_SKIP_COST = 0.35;
/** Cost of a heard word standing in for a script word (misrecognition): cheaper than skipping both. */
const SUBSTITUTION_COST = 0.35;
/** Newest heard words allowed to stay unmatched (fresh ad-lib, misrecognized last word, lagging partial). */
const MAX_TRAILING = 2;

/** Words behind the cursor searched for re-reading; never further back. */
const BACK_WINDOW = 30;
/** Normal forward search: about two sentences, enough to skip a line. */
const NEAR_AHEAD = 40;
/** "Lost" search, ~2 min of speech; also bounds the cost per call. */
const FAR_AHEAD = 300;

/** Ranking and gate cost per word of distance from the cursor: prefers the nearest occurrence ahead. */
const DISTANCE_COST = 0.05;
/** One clear content word right at the cursor is enough to step; a lone stopword is not. */
const STEP_MIN_SCORE = 0.9;
/** Backward jumps (re-reading) need at least this many matches ... */
const BACK_MIN_MATCHES = 3;
/** ... worth at least this much (three stopwords are not a re-read). */
const BACK_MIN_SCORE = 2;
/** Beyond NEAR_AHEAD a jump needs this many matches ... */
const FAR_MIN_MATCHES = 4;
/** ... worth at least this much. */
const FAR_MIN_SCORE = 3;
/** Score that maps to confidence 1. */
const CONFIDENT_SCORE = 3;

/** Normalized (`normalizeWord`) Spanish + English function words. */
const STOPWORDS = new Set(
  (
    'a al algo ante con contra cual de del desde donde e el ella ellas ellos en entre era es esa ese eso esta ' +
    'estas este esto estos fue ha han hay he la las le les lo los me mi mis muy ni no nos o os para pero por ' +
    'que se ser si sin sobre son su sus te ti tu tus u un una unas uno unos y ya yo ' +
    'an and are as at be but by for from in is it of on or so the this to was we with you'
  ).split(' '),
);

interface Candidate {
  readonly cursor: number;
  readonly score: number;
  readonly rank: number;
}

export const align: Aligner = ({ words, cursor, heard }) => {
  const n = words.length;
  const at = Math.max(0, Math.min(Math.round(cursor), n));
  if (heard.length === 0 || n === 0) return { cursor: at, confidence: 0 };
  const lo = Math.max(0, at - BACK_WINDOW);
  const best =
    search(words, at, heard, lo, Math.min(n, at + NEAR_AHEAD)) ??
    (at + NEAR_AHEAD < n ? search(words, at, heard, lo, Math.min(n, at + FAR_AHEAD)) : null);
  return result(at, best);
};

function result(cursor: number, best: Candidate | null): AlignResult {
  if (!best) return { cursor, confidence: 0 };
  return { cursor: best.cursor, confidence: Math.min(1, best.score / CONFIDENT_SCORE) };
}

function search(
  words: readonly Word[],
  cursor: number,
  heard: readonly string[],
  lo: number,
  hi: number,
): Candidate | null {
  const h = heard.length;
  const w = hi - lo;
  if (w <= 0) return null;
  // Flat [i * w + (j - lo)] tables; score < 0 = heard[i] does not match script[j].
  const score = new Float64Array(h * w).fill(-1);
  const matches = new Int32Array(h * w);
  const strong = new Int32Array(h * w);

  for (let i = 0; i < h; i++) {
    for (let j = lo; j < hi; j++) {
      const s = sim(heard[i], words[j].norm);
      if (s <= 0) continue;
      const isStrong = s > STOP_WEIGHT ? 1 : 0;
      let bestScore = s;
      let bestMatches = 1;
      let bestStrong = isStrong;
      for (let di = 1; di <= MAX_HEARD_GAP + 1 && i - di >= 0; di++) {
        for (let dj = 1; dj <= MAX_SCRIPT_GAP + 1 && j - dj >= lo; dj++) {
          const k = (i - di) * w + (j - dj - lo);
          const prev = score[k];
          if (prev < 0) continue;
          const v = prev + s - gapCost(di - 1, dj - 1);
          if (v > bestScore) {
            bestScore = v;
            bestMatches = matches[k] + 1;
            bestStrong = strong[k] + isStrong;
          }
        }
      }
      const k = i * w + (j - lo);
      score[k] = bestScore;
      matches[k] = bestMatches;
      strong[k] = bestStrong;
    }
  }

  let best: Candidate | null = null;
  for (let i = Math.max(0, h - 1 - MAX_TRAILING); i < h; i++) {
    const trailing = h - 1 - i;
    for (let j = lo; j < hi; j++) {
      const k = i * w + (j - lo);
      if (score[k] < 0) continue;
      const s = score[k] - trailing * HEARD_SKIP_COST;
      const delta = j + 1 - cursor;
      if (!accepted(delta, s, matches[k], strong[k], trailing)) continue;
      // One word behind is jitter from a revised partial, not a re-read: hold.
      const next = delta === -1 ? cursor : j + 1;
      const rank = s - DISTANCE_COST * Math.abs(delta);
      if (
        !best ||
        rank > best.rank ||
        (rank === best.rank && Math.abs(next - cursor) < Math.abs(best.cursor - cursor))
      ) {
        best = { cursor: next, score: s, rank };
      }
    }
  }
  return best;
}

function accepted(
  delta: number,
  score: number,
  matches: number,
  strong: number,
  trailing: number,
): boolean {
  if (score <= 0) return false;
  if (delta === 0 || delta === -1) return true; // holding position needs no extra evidence
  if (strong === 0) return false; // common words never move the cursor on their own
  if (delta < 0) return trailing === 0 && matches >= BACK_MIN_MATCHES && score >= BACK_MIN_SCORE;
  if (delta <= NEAR_AHEAD) return score >= STEP_MIN_SCORE + DISTANCE_COST * (delta - 1);
  return matches >= FAR_MIN_MATCHES && score >= FAR_MIN_SCORE;
}

/** Skips on both sides at once are first paired up as substitutions. */
function gapCost(heardSkips: number, scriptSkips: number): number {
  const sub = Math.min(heardSkips, scriptSkips);
  return (
    sub * SUBSTITUTION_COST +
    (heardSkips - sub) * HEARD_SKIP_COST +
    (scriptSkips - sub) * SCRIPT_SKIP_COST
  );
}

function weight(norm: string): number {
  if (STOPWORDS.has(norm)) return STOP_WEIGHT;
  return norm.length <= SHORT_MAX_LEN ? SHORT_WEIGHT : CONTENT_WEIGHT;
}

/** Match credit of a heard word against a script word; 0 = no match. */
function sim(heard: string, script: string): number {
  if (heard === script) return script === '' ? 0 : weight(script);
  const len = Math.max(heard.length, script.length);
  if (Math.min(heard.length, script.length) < FUZZY_MIN_LEN || heard[0] !== script[0]) return 0;
  const maxEdits = len >= FUZZY_LONG_LEN ? 2 : 1;
  if (Math.abs(heard.length - script.length) > maxEdits || STOPWORDS.has(script)) return 0;
  return editDistance(heard, script, maxEdits) <= maxEdits ? FUZZY_FACTOR * weight(script) : 0;
}

/** Levenshtein distance, giving up (returns max + 1) once every cell of a row exceeds `max`. */
function editDistance(a: string, b: string, max: number): number {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(
        prev[j] + 1,
        row[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      row.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = row;
  }
  return prev[b.length];
}
