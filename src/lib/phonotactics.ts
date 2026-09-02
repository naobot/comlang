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
export type ConstraintKind = "forbid_in_role" | "forbid_sequence" | "no_identical_adjacent";

/** One side of a constraint: a whole class, or a single segment. */
export type Term = { kind: "class"; classId: string } | { kind: "phoneme"; ipa: string };

export type ResolvedClass = {
  id: string;
  symbol: string;
  label: string | null;
  /** Member segments, as IPA. Empty is legal and means the class cannot be filled. */
  ipa: string[];
};

export type ResolvedSlot = {
  role: SlotRole;
  optional: boolean;
  /** The class the slot names. Identity, not contents — see `ipa`. */
  cls: ResolvedClass;
  /**
   * What the slot actually draws from: the class's members, or the slot's own explicit
   * set, in both cases filtered against the inventory.
   */
  ipa: string[];
  /** True when the slot names its own segments rather than following its class. */
  restricted: boolean;
};

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
    .map((slot) => {
      // The prime is what keeps a restricted slot from reading as its whole class: `CVC`
      // and `CVC′` are different grammars, and the notation is the only place that
      // difference is visible at a glance.
      const symbol = slot.restricted ? `${slot.cls.symbol}′` : slot.cls.symbol;
      return slot.optional ? `(${symbol})` : symbol;
    })
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
    const ipa = pick(slot.ipa, rng);
    // A required slot with nothing to draw from makes this template unusable. Fail the
    // attempt rather than emitting a syllable with a hole in it.
    if (ipa === null) {
      if (slot.optional) continue;
      return null;
    }
    // The class id is the slot's, even when the segment came from a restricted set. A
    // constraint naming the class still has to fire here: restricting a slot narrows what
    // it produces, it does not reclassify what it produced.
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
        lastReason = `template "${template.name}" has a required slot with no segments left to draw from`;
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

// The stored shape ------------------------------------------------------------------
//
// These mirror what `save_phonotactics` takes and what the store holds. They live here
// rather than in the store because they are plain data with no I/O, and because
// `impactOfRemoving` below has to reason over them — a store-side helper would drag the
// Supabase client into anything that wanted to test it.
//
// Classes and phonemes are referenced by `symbol` and `ipa` rather than by id, so a
// draft can name rows that do not exist yet.

export type DraftClass = {
  symbol: string;
  label: string | null;
  sort_order: number;
  phoneme_ipa: string[];
};

export type DraftSlot = {
  slot_index: number;
  role: SlotRole;
  optional: boolean;
  class_symbol: string;
  /**
   * The segments this slot allows, or `null` to follow its class.
   *
   * `null` is the default and is what keeps an untouched slot tracking edits to the class
   * it names; an array is an explicit set, which may legitimately include segments the
   * class does not. Stored as IPA text for the reason 0012 and 0013 gave: the reference is
   * allowed to dangle so the page can show it in red rather than lose it. Never empty —
   * the database refuses that, since a slot nothing can fill is a mistake and not a state.
   */
  phoneme_ipa: string[] | null;
};

export type DraftTemplate = {
  name: string;
  weight: number;
  sort_order: number;
  notes: string | null;
  slots: DraftSlot[];
};

/**
 * One side of a constraint as the draft stores it — a class, a segment, or neither yet.
 *
 * The resolved `Term` above is the same idea once it is known to be complete; this one is
 * what a half-filled editor holds, which is why both fields are nullable.
 */
export type DraftTerm = { class_symbol: string | null; phoneme_ipa: string | null };

export type DraftConstraint = {
  kind: ConstraintKind;
  role: SlotRole | null;
  seq_position: SequencePosition | null;
  a_class_symbol: string | null;
  a_phoneme_ipa: string | null;
  b_class_symbol: string | null;
  b_phoneme_ipa: string | null;
  note: string | null;
};

export type Draft = {
  classes: DraftClass[];
  templates: DraftTemplate[];
  constraints: DraftConstraint[];
};

/**
 * Deep copy of a draft.
 *
 * **Not `structuredClone`.** A draft held in a Vue `ref` is a reactive Proxy, and
 * `structuredClone` throws `DataCloneError: #<Object> could not be cloned` on one. That
 * failed silently: the store's `save()` cloned before doing anything else, so the throw
 * escaped before any error state was set and the button simply did nothing.
 *
 * A JSON round-trip reads through the proxy and is exact here, because a Draft is only
 * strings, numbers, booleans, nulls and arrays.
 */
export function cloneDraft(draft: Draft): Draft {
  return JSON.parse(JSON.stringify(draft)) as Draft;
}

/**
 * A stable string for comparing two drafts, used for both the dirty check and for
 * telling a collaborator's save apart from the echo of our own.
 *
 * Order-insensitive within each list, so re-ordering something that has no meaningful
 * order does not read as a change — while slot order, which *is* meaningful, is
 * preserved by sorting on `slot_index` rather than discarding it.
 */
export function canonicalDraft(draft: Draft): string {
  return JSON.stringify({
    classes: [...draft.classes]
      .map((c) => ({ ...c, phoneme_ipa: [...c.phoneme_ipa].sort() }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol)),
    templates: [...draft.templates]
      .map((t) => ({
        ...t,
        slots: [...t.slots]
          .sort((a, b) => a.slot_index - b.slot_index)
          // Sorted, like a class's members: the order of a set is not information, so
          // re-ordering one must not read as a change. `null` stays `null` — "follow the
          // class" and "these exact segments" are different states even when they resolve
          // to the same list today.
          .map((s) => ({ ...s, phoneme_ipa: s.phoneme_ipa ? [...s.phoneme_ipa].sort() : null })),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    constraints: [...draft.constraints].map((c) => JSON.stringify(c)).sort(),
  });
}

export type RemovalImpact = {
  /** Classes that lose members, and which. */
  classes: { symbol: string; ipa: string[] }[];
  /** Classes that would be left with nothing in them. */
  emptied: string[];
  /** Slots naming these segments explicitly, and which. */
  slots: { template: string; slotIndex: number; ipa: string[] }[];
  /** Rules left naming a segment the inventory no longer has. Kept, not deleted. */
  orphaned: DraftConstraint[];
  /** Templates with a required slot whose class would be emptied — these stop generating. */
  templates: string[];
};

/**
 * Which of a rule's segment terms are not in the inventory.
 *
 * The database cannot answer this any more, and that is on purpose: a constraint's
 * phoneme terms are plain IPA text rather than foreign keys, precisely so that removing a
 * segment leaves the rule standing instead of cascading it away (migration 0012). The
 * cost of keeping the rule is that the dangling reference has to be found here.
 */
export function orphanedTerms(
  constraint: DraftConstraint,
  inventory: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  const { a_phoneme_ipa: a, b_phoneme_ipa: b } = constraint;
  if (a !== null && !inventory.has(a)) out.push(a);
  if (b !== null && !inventory.has(b) && b !== a) out.push(b);
  return out;
}

/** Class members naming a segment the inventory no longer has. */
export function orphanedMembers(
  draft: Draft,
  inventory: ReadonlySet<string>,
): { symbol: string; missing: string[] }[] {
  return draft.classes
    .map((c) => ({ symbol: c.symbol, missing: c.phoneme_ipa.filter((ipa) => !inventory.has(ipa)) }))
    .filter((entry) => entry.missing.length > 0);
}

/**
 * Slots naming a segment the inventory no longer has.
 *
 * The slot-level twin of `orphanedMembers`, and needed for the same reason: a restricted
 * slot holds IPA text so the reference survives the phoneme leaving, which means something
 * other than the database has to notice that it dangles. A slot that follows its class has
 * nothing of its own to dangle — `orphanedMembers` already covers it.
 */
export function orphanedSlotMembers(
  draft: Draft,
  inventory: ReadonlySet<string>,
): { template: string; slotIndex: number; missing: string[] }[] {
  return draft.templates.flatMap((t) =>
    t.slots
      .map((slot) => ({
        template: t.name,
        slotIndex: slot.slot_index,
        missing: (slot.phoneme_ipa ?? []).filter((ipa) => !inventory.has(ipa)),
      }))
      .filter((entry) => entry.missing.length > 0),
  );
}

/**
 * The draft resolved into what the sampler consumes, with class membership **filtered
 * against the inventory**.
 *
 * That filter is not a detail. Since 0013 a class may hold a segment the language no
 * longer has, and without this the generator would keep producing it — removing a phoneme
 * would change the chart and nothing else. The inventory is what the language *has*; a
 * class is only a name for part of it.
 */
export function resolveGrammar(draft: Draft, inventory: ReadonlySet<string>): Grammar {
  const classes: ResolvedClass[] = draft.classes.map((c) => ({
    // The symbol is the natural key and is unique within a draft, so it serves as the id
    // without needing the database's uuid.
    id: c.symbol,
    symbol: c.symbol,
    label: c.label,
    ipa: c.phoneme_ipa.filter((ipa) => inventory.has(ipa)),
  }));
  const bySymbol = new Map(classes.map((c) => [c.symbol, c]));

  const templates: ResolvedTemplate[] = draft.templates.map((t) => ({
    id: t.name,
    name: t.name,
    weight: t.weight,
    slots: t.slots
      .map((slot) => {
        const cls = bySymbol.get(slot.class_symbol);
        if (!cls) return null;
        // The same filter the class members get, and for the same reason: a slot may name
        // a segment the language no longer has, and generating it anyway would make
        // removing a phoneme mean nothing. `cls.ipa` is already filtered above.
        const ipa =
          slot.phoneme_ipa === null
            ? cls.ipa
            : slot.phoneme_ipa.filter((symbol) => inventory.has(symbol));
        return {
          role: slot.role,
          optional: slot.optional,
          cls,
          ipa,
          restricted: slot.phoneme_ipa !== null,
        };
      })
      .filter((slot): slot is ResolvedSlot => slot !== null),
  }));

  const term = (classSymbol: string | null, ipa: string | null): Term | null => {
    if (classSymbol !== null) return { kind: "class", classId: classSymbol };
    if (ipa !== null) return { kind: "phoneme", ipa };
    return null;
  };

  // A half-specified rule is dropped rather than guessed at: the database's kind_shape
  // check would refuse it on save, so the generator must not act on something that
  // cannot be persisted.
  const constraints = draft.constraints.flatMap((c): ResolvedConstraint[] => {
    if (c.kind === "no_identical_adjacent") return [{ kind: "no_identical_adjacent" }];

    const a = term(c.a_class_symbol, c.a_phoneme_ipa);
    if (!a) return [];

    if (c.kind === "forbid_in_role") {
      return c.role ? [{ kind: "forbid_in_role", role: c.role, a }] : [];
    }

    const b = term(c.b_class_symbol, c.b_phoneme_ipa);
    if (!b || !c.seq_position) return [];
    return [{ kind: "forbid_sequence", position: c.seq_position, a, b }];
  });

  return { classes, templates, constraints };
}

/** Every rule in the draft with at least one dangling segment reference. */
export function orphanedConstraints(
  draft: Draft,
  inventory: ReadonlySet<string>,
): { constraint: DraftConstraint; missing: string[] }[] {
  return draft.constraints
    .map((constraint) => ({ constraint, missing: orphanedTerms(constraint, inventory) }))
    .filter((entry) => entry.missing.length > 0);
}

/**
 * What removing these segments from the inventory would do to the phonotactics.
 *
 * Nothing is destroyed any more — since 0012 and 0013 both rules and class membership
 * survive the segment leaving, holding a reference that no longer resolves. But they stop
 * having any effect, because `resolveGrammar` filters class members against the inventory
 * and a rule can only fire on a segment that can be generated. Silently inert is a quieter
 * failure than deleted, so it still has to be said out loud before the save.
 */
export function impactOfRemoving(draft: Draft, removing: ReadonlySet<string>): RemovalImpact {
  if (removing.size === 0) {
    return { classes: [], emptied: [], slots: [], orphaned: [], templates: [] };
  }

  const classes = draft.classes
    .map((c) => ({ symbol: c.symbol, ipa: c.phoneme_ipa.filter((ipa) => removing.has(ipa)) }))
    .filter((c) => c.ipa.length > 0);

  // "Emptied" means nothing *usable* is left. The members stay in the class since 0013,
  // but the generator ignores what the inventory does not have, so the effect is the same.
  const emptied = draft.classes
    .filter((c) => c.phoneme_ipa.length > 0 && c.phoneme_ipa.every((ipa) => removing.has(ipa)))
    .map((c) => c.symbol);

  // Not deleted — kept, and left pointing at something that is gone. They stop being
  // enforced, which is a quieter failure than disappearing and so still worth saying.
  const orphaned = draft.constraints.filter(
    (c) =>
      (c.a_phoneme_ipa !== null && removing.has(c.a_phoneme_ipa)) ||
      (c.b_phoneme_ipa !== null && removing.has(c.b_phoneme_ipa)),
  );

  const slots = draft.templates.flatMap((t) =>
    t.slots
      .map((s) => ({
        template: t.name,
        slotIndex: s.slot_index,
        ipa: (s.phoneme_ipa ?? []).filter((ipa) => removing.has(ipa)),
      }))
      .filter((s) => s.ipa.length > 0),
  );

  // A required slot with nothing left to draw from makes the whole template unusable —
  // see `buildSyllable`. Worth naming separately: an emptied class is recoverable, a
  // template that can no longer generate is the visible symptom.
  //
  // A restricted slot has to be judged on its own set rather than on its class: the class
  // may still be full of segments the slot does not allow, and the class may be emptied
  // while the slot names something outside it that survives.
  const drained = (slot: DraftSlot) =>
    slot.phoneme_ipa === null
      ? emptied.includes(slot.class_symbol)
      : slot.phoneme_ipa.every((ipa) => removing.has(ipa));

  const templates = draft.templates
    .filter((t) => t.slots.some((s) => !s.optional && drained(s)))
    .map((t) => t.name);

  return { classes, emptied, slots, orphaned, templates };
}
