/**
 * The generative core: phoneme classes, syllable templates, constraints, and the
 * sampler that turns them into words.
 *
 * **This module must not import from `vue`, `pinia`, or `@/lib/supabase.`** It is
 * deliberately pure so that the phonotactics page and a future word-generator feature
 * consume exactly the same code; an import from any of those would quietly end that.
 *
 * Nothing upstream corresponds to this. `grammar.yaml` has no phonotactics section at
 * all — no syllable template, no onset/coda inventory, no cluster constraints. What it
 * does have is named sets of bare IPA strings (`glides`, `nasals`, `places.labial`),
 * which is why classes are the anchor here: they are the one machine-readable
 * cross-reference the source already uses.
 */

export type SlotRole = "onset" | "nucleus" | "coda";
export type SequencePosition = "anywhere" | "word_initial" | "word_final";

/** One side of a constraint: a whole class, or a single segment. */
export type Term = { kind: "class"; classId: string } | { kind: "phoneme"; ipa: string };

export type ResolvedClass = {
  id: string;
  symbol: string;
  label: string | null;
  /** Member segments, as IPA. Empty is legal and means the class cannot be filled. */
  ipa: string[];
};

export type ResolvedSlot = { role: SlotRole; optional: boolean; cls: ResolvedClass };

export type ResolvedTemplate = {
  id: string;
  name: string;
  /** Relative sampling frequency against the other templates. Always > 0. */
  weight: number;
  slots: ResolvedSlot[];
};

export type ResolvedConstraint =
  | { kind: "forbid_in_role"; role: SlotRole; a: Term }
  | { kind: "forbid_sequence"; position: SequencePosition; a: Term; b: Term }
  | { kind: "no_identical_adjacent" };

export type Grammar = {
  classes: ResolvedClass[];
  templates: ResolvedTemplate[];
  constraints: ResolvedConstraint[];
};

/** A generated segment, keeping the role it was generated into so constraints can see it. */
export type Segment = { ipa: string; role: SlotRole; classId: string };

/** Injected so tests are deterministic and "regenerate" can reseed. Returns [0, 1). */
export type Rng = () => number;

export type GenerateOptions = {
  minSyllables?: number;
  maxSyllables?: number;
  /** Chance an optional slot is filled. */
  optionalFillChance?: number;
  /** Ceiling on resamples before giving up. See the note on `generateWord`. */
  maxAttempts?: number;
};

export type GenerateResult =
  | { ok: true; ipa: string; segments: Segment[]; syllables: Segment[][] }
  | { ok: false; reason: string };

const DEFAULTS = {
  minSyllables: 1,
  maxSyllables: 3,
  optionalFillChance: 0.5,
  maxAttempts: 200,
} as const;

// Notation -------------------------------------------------------------------------

/** `(C)(G)V(C)` — the formal string, rendered from the slots so the two cannot drift. */
export function templateNotation(template: ResolvedTemplate): string {
  if (template.slots.length === 0) return "∅";
  return template.slots
    .map((slot) => (slot.optional ? `(${slot.cls.symbol})` : slot.cls.symbol))
    .join("");
}

// Constraint checking ----------------------------------------------------------------

function matches(term: Term, segment: Segment): boolean {
  return term.kind === "class" ? segment.classId === term.classId : segment.ipa === term.ipa;
}

function describe(term: Term, grammar: Grammar): string {
  if (term.kind === "phoneme") return `/${term.ipa}/`;
  return grammar.classes.find((c) => c.id === term.classId)?.symbol ?? "?";
}

/**
 * The first violated constraint, as a human-readable reason, or null if the word is
 * well-formed.
 *
 * Exported separately from generation so the page can explain a rejection, and so a
 * future check of hand-written lexicon entries can reuse it without generating anything.
 */
export function violation(grammar: Grammar, segments: Segment[]): string | null {
  for (const constraint of grammar.constraints) {
    if (constraint.kind === "forbid_in_role") {
      const hit = segments.find((s) => s.role === constraint.role && matches(constraint.a, s));
      if (hit) return `${describe(constraint.a, grammar)} cannot be a ${constraint.role}`;
      continue;
    }

    if (constraint.kind === "no_identical_adjacent") {
      for (let i = 1; i < segments.length; i += 1) {
        const prev = segments[i - 1];
        const here = segments[i];
        if (prev && here && prev.ipa === here.ipa) {
          return `identical adjacent segments (/${here.ipa}${here.ipa}/)`;
        }
      }
      continue;
    }

    // forbid_sequence. `position` narrows where the pair is checked; "anywhere" scans
    // the whole word, which is the case templates cannot express — they see one
    // syllable, and this sees across the boundary between two.
    const last = segments.length - 1;
    for (let i = 0; i < last; i += 1) {
      if (constraint.position === "word_initial" && i !== 0) break;
      if (constraint.position === "word_final" && i !== last - 1) continue;

      const a = segments[i];
      const b = segments[i + 1];
      if (a && b && matches(constraint.a, a) && matches(constraint.b, b)) {
        const where = constraint.position === "anywhere" ? "" : ` ${constraint.position}`;
        return `${describe(constraint.a, grammar)}${describe(constraint.b, grammar)} is not allowed${where}`;
      }
    }
  }
  return null;
}

// Generation --------------------------------------------------------------------------

function pick<T>(items: readonly T[], rng: Rng): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(rng() * items.length)] ?? null;
}

function pickTemplate(templates: ResolvedTemplate[], rng: Rng): ResolvedTemplate | null {
  const total = templates.reduce((sum, t) => sum + Math.max(1, t.weight), 0);
  if (total <= 0) return null;

  let roll = rng() * total;
  for (const template of templates) {
    roll -= Math.max(1, template.weight);
    if (roll < 0) return template;
  }
  return templates[templates.length - 1] ?? null;
}

function buildSyllable(
  template: ResolvedTemplate,
  optionalFillChance: number,
  rng: Rng,
): Segment[] | null {
  const out: Segment[] = [];
  for (const slot of template.slots) {
    if (slot.optional && rng() >= optionalFillChance) continue;
    const ipa = pick(slot.cls.ipa, rng);
    // A required slot whose class is empty makes this template unusable. Fail the
    // attempt rather than emitting a syllable with a hole in it.
    if (ipa === null) {
      if (slot.optional) continue;
      return null;
    }
    out.push({ ipa, role: slot.role, classId: slot.cls.id });
  }
  return out;
}

/**
 * One word, or a reason it could not be produced.
 *
 * **The attempt cap is load-bearing.** An over-constrained grammar — a constraint that
 * forbids the only nucleus class, say — has no satisfying word at all, and an unbounded
 * resample loop would hang the tab rather than report anything. Failure comes back as
 * data so the page can say "these rules can't produce a word" and stay responsive.
 */
export function generateWord(grammar: Grammar, options: GenerateOptions, rng: Rng): GenerateResult {
  const min = Math.max(1, options.minSyllables ?? DEFAULTS.minSyllables);
  const max = Math.max(min, options.maxSyllables ?? DEFAULTS.maxSyllables);
  const fill = options.optionalFillChance ?? DEFAULTS.optionalFillChance;
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULTS.maxAttempts);

  const usable = grammar.templates.filter((t) => t.slots.length > 0);
  if (usable.length === 0) {
    return { ok: false, reason: "no syllable template has any slots" };
  }

  let lastReason = "could not satisfy the constraints";

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const count = min + Math.floor(rng() * (max - min + 1));
    const syllables: Segment[][] = [];
    let failed = false;

    for (let i = 0; i < count; i += 1) {
      const template = pickTemplate(usable, rng);
      if (!template) {
        failed = true;
        break;
      }
      const syllable = buildSyllable(template, fill, rng);
      if (syllable === null) {
        lastReason = `template "${template.name}" has a required slot whose class is empty`;
        failed = true;
        break;
      }
      // An all-optional template can roll empty. Skip it rather than emitting nothing.
      if (syllable.length > 0) syllables.push(syllable);
    }
    if (failed) continue;

    const segments = syllables.flat();
    if (segments.length === 0) continue;

    const problem = violation(grammar, segments);
    if (problem) {
      lastReason = problem;
      continue;
    }
    return { ok: true, ipa: segments.map((s) => s.ipa).join(""), segments, syllables };
  }

  return { ok: false, reason: lastReason };
}

/** `n` words. Failures are returned in place rather than dropped, so a broken grammar
 *  is visible instead of just producing a short list. */
export function generateWords(
  grammar: Grammar,
  options: GenerateOptions,
  rng: Rng,
  n: number,
): GenerateResult[] {
  return Array.from({ length: Math.max(0, n) }, () => generateWord(grammar, options, rng));
}

/**
 * A small seedable PRNG (mulberry32), so "regenerate" is reproducible from a seed and
 * tests do not depend on Math.random.
 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
