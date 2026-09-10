/**
 * Checking a word's phonemic shape against the phonotactics the project has committed to.
 *
 * **Pure, like `./phonotactics`.** It imports from that module and nothing else — no
 * `vue`, `pinia`, or Supabase — so the lexicon page and the entry editor reach the same
 * code. A `?raw` test enforces it.
 *
 * The input is `lexicon_entries.underlying_phonology` — a phonemic string in the
 * project's own IPA, the same symbols the grammar itself stores, optionally wrapped in
 * `/slashes/` the way that column is. It is **not** `lemma`: once a project has an
 * orthography (0031), `lemma` is the written spelling, which can merge or reshape
 * phonemic contrasts (two phonemes spelled the same, one phoneme spelled differently by
 * position) in ways that would make checking it against the grammar meaningless.
 *
 * `generateWord` runs the grammar forwards; this runs it backwards. Given a string it
 * (1) splits it into inventory phonemes, (2) finds a way to cut that sequence into
 * syllables each matching some syllable template, and (3) reuses `violation()` — which
 * already works on a flat `Segment[]` and already anticipates this use — to check the
 * constraints. A word "fits" if *any* such syllabification also passes the constraints;
 * only when every parse fails does a warning show.
 *
 * The warning is advisory everywhere it appears: a lexicon full of loanwords and frozen
 * compounds legitimately breaks its own rules, so nothing here blocks a save or an
 * import.
 *
 * Segmentation tolerates the character variants the co-designer's files have always
 * used — Latin `g` for `ɡ`, `r` for the tap `ɾ`, `w` for `ɰ`, and the digraphs `ng` and
 * `ts` for `ŋ` and `t͡s` (the same five the 0033 backfill folded in). Each only applies
 * when the language actually has the canonical phoneme and is not separately using the
 * typed form as a phoneme of its own — see `IPA_VARIANTS`. The togglable phoneme palette
 * beside the field is the way to type the exact glyphs; this is the safety net for when
 * someone doesn't.
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
 * Character-variant substitutions the lexicon has always tolerated, `[typed, canonical]`.
 *
 * The co-designer's source files use Latin `g` where IPA wants script `ɡ`, `r` for the
 * tap `ɾ`, `w` for the velar approximant `ɰ`, and the digraphs `ng` / `ts` for `ŋ` /
 * `t͡s`. Migration 0033's backfill made exactly these conversions when it split
 * `underlying_phonology` out of `lemma`.
 *
 * `variantMap` keeps a pair only when the language *has* the canonical phoneme and does
 * *not* separately use the typed form as its own segment — so a project where `w` is a
 * real phoneme keeps `w` meaning `w`. Longer keys first, so `ng` is tried before `n`.
 */
const IPA_VARIANTS: readonly (readonly [string, string])[] = [
  ["ng", "ŋ"],
  ["ts", "t͡s"],
  ["g", "ɡ"],
  ["r", "ɾ"],
  ["w", "ɰ"],
];

function variantMap(inventory: ReadonlySet<string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [typed, canonical] of IPA_VARIANTS) {
    if (inventory.has(canonical) && !inventory.has(typed)) out.set(typed, canonical);
  }
  return out;
}

/**
 * Split `s` into phonemes by greedy longest match against the inventory.
 *
 * The input is already the project's own IPA (see the module doc comment), so — unlike
 * when this matched a hand-written, Latin-orthography lemma — there is little glyph
 * reconciliation to do: a symbol either is in the inventory's own set of spellings, or is
 * one of the character variants `variantMap` maps back onto it.
 *
 * Longest-first is the conventional resolution for a phonemic transcription; it can in
 * principle mis-cut a prefix-ambiguous inventory (`t`, `t͡s`, `s` all present), but a
 * backtracking segmenter multiplies the search for no practical gain here. An exact
 * inventory match always beats a variant of the same length. A substring that matches
 * nothing is reported rather than skipped.
 */
function segment(
  inventory: ReadonlySet<string>,
  s: string,
): { ok: true; units: string[] } | { ok: false; bad: string } {
  const variants = variantMap(inventory);

  let maxLen = 1;
  for (const symbol of inventory) maxLen = Math.max(maxLen, symbol.length);
  for (const typed of variants.keys()) maxLen = Math.max(maxLen, typed.length);

  const units: string[] = [];
  let i = 0;
  while (i < s.length) {
    let matched: string | null = null;
    for (let len = Math.min(maxLen, s.length - i); len >= 1; len -= 1) {
      const candidate = s.slice(i, i + len);
      if (inventory.has(candidate)) {
        matched = candidate;
        i += len;
        break;
      }
      const canonical = variants.get(candidate);
      if (canonical !== undefined) {
        matched = canonical;
        i += len;
        break;
      }
    }
    if (matched === null) return { ok: false, bad: s[i] ?? "" };
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
 * Whether `phonology` fits the grammar, and if not, the first reason it does not.
 *
 * `phonology` is expected to be `underlying_phonology` — optionally wrapped in
 * `/slashes/`, which are stripped before matching — not `lemma`. See the module doc
 * comment for why the two are not interchangeable once a project has an orthography.
 *
 * `inventory` is passed rather than read off `grammar` on purpose: it is the language's
 * actual sound set, which lets an unknown symbol ("not a phoneme at all") read
 * differently from a real phoneme that no slot here happens to accept ("does not fit the
 * templates"). Every degenerate input — blank, empty inventory, no usable template —
 * returns `ok`, so a missed gate upstream can only ever fail quiet.
 */
export function checkLemma(
  grammar: Grammar,
  inventory: ReadonlySet<string>,
  phonology: string,
): LemmaCheck {
  const norm = phonology
    .trim()
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .normalize("NFC")
    .toLowerCase();
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
