/**
 * Checking a hand-written lemma against the phonotactics the project has committed to.
 *
 * **Pure, like `./phonotactics`.** It imports from that module and nothing else — no
 * `vue`, `pinia`, or Supabase — so the lexicon page, the entry editor and the import
 * review dialog all reach the same code. A `?raw` test enforces it.
 *
 * `generateWord` runs the grammar forwards; this runs it backwards. Given a string it
 * (1) splits it into inventory phonemes, (2) finds a way to cut that sequence into
 * syllables each matching some syllable template, and (3) reuses `violation()` — which
 * already works on a flat `Segment[]` and already anticipates this use — to check the
 * constraints. A lemma "fits" if *any* such syllabification also passes the constraints;
 * only when every parse fails does a warning show.
 *
 * The warning is advisory everywhere it appears: a lexicon full of loanwords and frozen
 * compounds legitimately breaks its own rules, so nothing here blocks a save or an
 * import.
 */

import type { Grammar, ResolvedTemplate, Segment } from "./phonotactics";
import { templateNotation, violation } from "./phonotactics";

/**
 * Caps, in the spirit of `generateWord`'s attempt ceiling: an ambiguous grammar over a
 * long compound has a combinatorial number of parses, and an unbounded search would hang
 * the tab. Past the cap the answer is "cannot judge" (→ `ok`), never a false warning.
 */
const MAX_SYLLABLES = 20;
const MAX_PARSES = 200;
const MAX_STEPS = 20_000;

export type LemmaCheck =
  | { ok: true }
  | {
      ok: false;
      reason: string;
      kind: "unknown-segment" | "no-syllabification" | "constraint";
    };

/**
 * Latin-orthography lemmas and the IPA chart disagree on a few glyphs.
 *
 * The one that bites is the voiced velar stop: `src/data/ipa.ts` stores it as the proper
 * IPA symbol, script "ɡ" (U+0261), while a romanization following the conlang's
 * "lowercase Latin" orthography writes plain "g" (U+0067). Compared literally, "gal"
 * looks like it contains a sound the language does not have. Each pair is folded to one
 * form on both sides before matching. Length-preserving, so segmentation offsets are
 * unaffected; add a pair here if another lookalike turns up.
 */
const FOLD_PAIRS: ReadonlyArray<readonly [RegExp, string]> = [[/ɡ/g, "g"]];

function fold(s: string): string {
  let out = s;
  for (const [from, to] of FOLD_PAIRS) out = out.replace(from, to);
  return out;
}

/**
 * Split `s` into phonemes by greedy longest match against the inventory.
 *
 * Matching is done on the folded form (see `fold`), but each unit is emitted as the
 * inventory's own canonical symbol, so the grammar — `slot.ipa`, the constraint terms —
 * keeps matching against exactly what it stores.
 *
 * Longest-first is the conventional resolution for a phonemic romanization; it can in
 * principle mis-cut a prefix-ambiguous inventory (`t`, `ts`, `s` all present), but a
 * backtracking segmenter multiplies the search for no practical gain here. A substring
 * that matches nothing is reported rather than skipped.
 */
function segment(
  inventory: ReadonlySet<string>,
  s: string,
): { ok: true; units: string[] } | { ok: false; bad: string } {
  // Folded symbol -> the inventory's canonical spelling of it.
  const canonical = new Map<string, string>();
  let maxLen = 1;
  for (const symbol of inventory) {
    canonical.set(fold(symbol), symbol);
    maxLen = Math.max(maxLen, symbol.length);
  }

  const folded = fold(s);
  const units: string[] = [];
  let i = 0;
  while (i < folded.length) {
    let matched: string | null = null;
    for (let len = Math.min(maxLen, folded.length - i); len >= 1; len -= 1) {
      const hit = canonical.get(folded.slice(i, i + len));
      if (hit !== undefined) {
        matched = hit;
        i += len;
        break;
      }
    }
    if (matched === null) return { ok: false, bad: folded[i] ?? "" };
    units.push(matched);
  }
  return { ok: true, units };
}

/**
 * Every way one syllable template can consume a prefix of `units` starting at `start`,
 * as `{ end, segs }`. There is more than one when the template has optional slots: each
 * one branches on fill-then-skip, in that order, so enumeration is deterministic.
 *
 * A slot accepts a unit iff it is in `slot.ipa` — already the resolved, inventory-
 * filtered accept set, so there is no class-membership or restricted-set logic to redo.
 * The emitted segment carries `slot.cls.id` even from a restricted slot, exactly as
 * `buildSyllable` does, so a class-term constraint fires the same on a parsed word as on
 * a generated one.
 */
function* matchSyllable(
  tmpl: ResolvedTemplate,
  units: string[],
  start: number,
): Generator<{ end: number; segs: Segment[] }> {
  function* walk(
    slotIndex: number,
    pos: number,
    segs: Segment[],
  ): Generator<{ end: number; segs: Segment[] }> {
    if (slotIndex === tmpl.slots.length) {
      // A syllable has to consume something — mirrors `generateWord` dropping an empty
      // roll, and stops an all-optional template from recursing forever.
      if (pos > start) yield { end: pos, segs };
      return;
    }
    const slot = tmpl.slots[slotIndex];
    if (!slot) return;
    const unit = units[pos];
    if (unit !== undefined && slot.ipa.includes(unit)) {
      yield* walk(slotIndex + 1, pos + 1, [
        ...segs,
        { ipa: unit, role: slot.role, classId: slot.cls.id },
      ]);
    }
    if (slot.optional) {
      yield* walk(slotIndex + 1, pos, segs);
    }
    // A required slot with nothing it accepts: this path simply ends.
  }
  yield* walk(0, start, []);
}

/**
 * Every full syllabification of `units` under the grammar's templates, each as the flat
 * `Segment[]` `violation()` wants. `exhausted` is set if a cap cut the search short —
 * the caller treats that as "cannot judge" rather than "does not parse".
 */
function parseWord(grammar: Grammar, units: string[]): { parses: Segment[][]; exhausted: boolean } {
  const usable = grammar.templates.filter((t) => t.slots.length > 0);
  const parses: Segment[][] = [];
  let steps = 0;
  let exhausted = false;

  function descend(pos: number, acc: Segment[], syllables: number): void {
    if (parses.length >= MAX_PARSES || exhausted) return;
    if (syllables > MAX_SYLLABLES) return;
    if ((steps += 1) > MAX_STEPS) {
      exhausted = true;
      return;
    }
    if (pos === units.length) {
      parses.push(acc);
      return;
    }
    for (const tmpl of usable) {
      for (const { end, segs } of matchSyllable(tmpl, units, pos)) {
        descend(end, [...acc, ...segs], syllables + 1);
        if (parses.length >= MAX_PARSES || exhausted) return;
      }
    }
  }

  descend(0, [], 0);
  return { parses, exhausted };
}

/**
 * Whether `lemma` fits the grammar, and if not, the first reason it does not.
 *
 * `inventory` is passed rather than read off `grammar` on purpose: it is the language's
 * actual sound set, which lets an unknown symbol ("not a phoneme at all") read
 * differently from a real phoneme that no slot here happens to accept ("does not fit the
 * templates"). Every degenerate input — blank lemma, empty inventory, no usable template
 * — returns `ok`, so a missed gate upstream can only ever fail quiet.
 */
export function checkLemma(
  grammar: Grammar,
  inventory: ReadonlySet<string>,
  lemma: string,
): LemmaCheck {
  const norm = lemma.normalize("NFC").trim().toLowerCase();
  if (norm === "") return { ok: true };
  if (inventory.size === 0) return { ok: true };

  const usable = grammar.templates.filter((t) => t.slots.length > 0);
  if (usable.length === 0) return { ok: true };

  const parsed = segment(inventory, norm);
  if (!parsed.ok) {
    return {
      ok: false,
      kind: "unknown-segment",
      reason: `“${norm}” uses “${parsed.bad}”, which isn’t in the phoneme inventory.`,
    };
  }

  const { parses, exhausted } = parseWord(grammar, parsed.units);
  if (parses.length === 0) {
    if (exhausted) return { ok: true };
    return {
      ok: false,
      kind: "no-syllabification",
      reason: `“${norm}” doesn’t fit any syllable pattern (${usable
        .map(templateNotation)
        .join(", ")}).`,
    };
  }

  // A word fits if *some* valid syllabification also clears the constraints. Checking
  // one "canonical" split instead would be wrong for `forbid_sequence`, whose whole
  // point is the pair spanning a boundary — a different legal split can avoid it. Do not
  // "simplify" this to a single parse.
  let firstReason: string | null = null;
  for (const parse of parses) {
    const problem = violation(grammar, parse);
    if (problem === null) return { ok: true };
    if (firstReason === null) firstReason = problem;
  }
  return { ok: false, kind: "constraint", reason: `“${norm}”: ${firstReason}` };
}
