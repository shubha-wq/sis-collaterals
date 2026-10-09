/**
 * Line breaking for event titles. Pure: works on measured word widths, so
 * it is unit-tested without a browser and the template applies the result as
 * explicit breaks (identical in editor and export).
 *
 * Given the words of each typed line (a typed line break is always kept),
 * it finds the fewest lines that fit the width, then the most balanced way
 * to break into that many lines: the narrowest common measure that still
 * needs no extra line. Lines never end on a short connector ("x", "&",
 * "and", "in", …) when that word can move down, so a name isn't split
 * at an awkward joint.
 */

export const CONNECTORS = new Set(["x", "×", "&", "+", "and", "of", "in", "the", "a", "at", "for", "with", "to", "on", "by", "vs", "vs.", "-", "–", "—", "|", "·"]);

export function isConnector(word: string): boolean {
  return CONNECTORS.has(word.toLowerCase());
}

export interface TitleLine {
  /** Width of each word, in px. */
  words: number[];
  /** Whether each word is a connector. */
  connectors?: boolean[];
}

export interface TitleBreaks {
  /** Per typed line: indices of words that start a new rendered line (never 0). */
  breaks: number[][];
  /** Total rendered lines. */
  lines: number;
  /** Width of the widest rendered line. */
  widest: number;
  /** Lines that end on a connector (only when it couldn't move down). */
  dangling: number;
}

function lineWidth(words: number[], from: number, to: number, gap: number): number {
  let w = 0;
  for (let i = from; i < to; i++) w += words[i]!;
  return w + gap * Math.max(0, to - from - 1);
}

/** Greedy fill to measure `measure`, moving a trailing connector down to the next line. */
function greedy(line: TitleLine, gap: number, measure: number): { breaks: number[]; widest: number; dangling: number } | null {
  const { words } = line;
  const breaks: number[] = [];
  let start = 0;
  let widest = 0;
  let dangling = 0;
  while (start < words.length) {
    if (words[start]! > measure + 0.01) return null; // a single word wider than the measure
    let end = start + 1;
    while (end < words.length && lineWidth(words, start, end + 1, gap) <= measure + 0.01) end++;
    // Don't leave a connector dangling at the end of a line (if the line keeps
    // another word), but only move it down if it fits beside the next word:
    // a connector alone on a line is worse than one at a line end.
    while (end < words.length && end - start > 1 && line.connectors?.[end - 1] && lineWidth(words, end - 1, end + 1, gap) <= measure + 0.01) end--;
    widest = Math.max(widest, lineWidth(words, start, end, gap));
    if (end < words.length) {
      breaks.push(end);
      if (line.connectors?.[end - 1]) dangling++;
    }
    start = end;
  }
  return { breaks, widest, dangling };
}

/**
 * Balanced breaks for all typed lines at one width. Returns null when some
 * word is wider than the width (the caller must size the type down first).
 */
export function balanceTitle(lines: TitleLine[], gap: number, width: number): TitleBreaks | null {
  const atWidth = lines.map((l) => greedy(l, gap, width));
  if (atWidth.some((r) => r === null)) return null;
  const count = (rs: Array<{ breaks: number[] } | null>) => rs.reduce((n, r) => n + (r ? r.breaks.length + 1 : Infinity), 0);
  const fewest = count(atWidth);
  const dangling = (rs: Array<{ dangling: number } | null>) => rs.reduce((n, r) => n + (r ? r.dangling : 0), 0);
  const allowed = dangling(atWidth);
  // Narrowest measure that still needs no more lines than the fewest possible
  // and leaves no more connectors at line ends than the full width would.
  let lo = Math.max(0, ...lines.flatMap((l) => l.words));
  let hi = width;
  for (let i = 0; i < 32 && hi - lo > 0.25; i++) {
    const mid = (lo + hi) / 2;
    const rs = lines.map((l) => greedy(l, gap, mid));
    if (count(rs) <= fewest && dangling(rs) <= allowed) hi = mid;
    else lo = mid;
  }
  const best = lines.map((l) => greedy(l, gap, hi)!);
  return { breaks: best.map((b) => b.breaks), lines: count(best), widest: Math.max(0, ...best.map((b) => b.widest)), dangling: dangling(best) };
}
