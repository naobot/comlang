import { describe, expect, it } from "vite-plus/test";
import { reactive, ref } from "vue";

// `?raw` rather than node:fs — this file is type-checked by the DOM tsconfig, which
// deliberately has no Node types, and Vite resolves the raw import in both.
import source from "./phonotactics.ts?raw";

import {
  type Grammar,
  type ResolvedClass,
  type ResolvedSlot,
  type ResolvedTemplate,
  type Draft,
  type DraftConstraint,
  canonicalDraft,
  cloneDraft,
  generateWord,
  generateWords,
  impactOfRemoving,
  orphanedConstraints,
  orphanedMembers,
  orphanedSlotMembers,
  orphanedTerms,
  resolveGrammar,
  seededRng,
  templateNotation,
  violation,
} from "./phonotactics";

const C: ResolvedClass = {
  id: "c",
  symbol: "C",
  label: "consonant",
  ipa: ["p", "t", "k", "m", "n", "ŋ", "s", "l"],
};
const G: ResolvedClass = { id: "g", symbol: "G", label: "glide", ipa: ["j", "w"] };
const V: ResolvedClass = { id: "v", symbol: "V", label: "vowel", ipa: ["i", "e", "a", "o", "u"] };

/** A slot taking its whole class — what `resolveGrammar` builds from `phoneme_ipa: null`. */
const follows = (
  role: ResolvedSlot["role"],
  optional: boolean,
  cls: ResolvedClass,
): ResolvedSlot => ({
  role,
  optional,
  cls,
  ipa: cls.ipa,
  restricted: false,
});

/** A slot naming its own segments, which may be narrower than the class it belongs to. */
const restricts = (
  role: ResolvedSlot["role"],
  optional: boolean,
  cls: ResolvedClass,
  ipa: string[],
): ResolvedSlot => ({ role, optional, cls, ipa, restricted: true });

const heavy: ResolvedTemplate = {
  id: "t1",
  name: "heavy",
  weight: 1,
  slots: [
    follows("onset", true, C),
    follows("onset", true, G),
    follows("nucleus", false, V),
    follows("coda", true, C),
  ],
};

const grammar = (over: Partial<Grammar> = {}): Grammar => ({
  classes: [C, G, V],
  templates: [heavy],
  constraints: [],
  ...over,
});

describe("templateNotation", () => {
  it("brackets optional slots", () => {
    expect(templateNotation(heavy)).toBe("(C)(G)V(C)");
  });

  it("marks a template with no slots rather than rendering empty", () => {
    expect(templateNotation({ ...heavy, slots: [] })).toBe("∅");
  });

  it("primes a slot that names its own segments, inside the optional brackets", () => {
    const t: ResolvedTemplate = {
      ...heavy,
      slots: [restricts("onset", true, C, ["p", "t"]), follows("nucleus", false, V)],
    };
    expect(templateNotation(t)).toBe("(C′)V");
  });
});

describe("restricted slots", () => {
  const narrow: ResolvedTemplate = {
    id: "t2",
    name: "narrow",
    weight: 1,
    slots: [restricts("onset", false, C, ["p", "t"]), follows("nucleus", false, V)],
  };

  it("only ever emits segments the slot itself allows, not its whole class", () => {
    const g = grammar({ templates: [narrow] });
    for (const result of generateWords(g, { maxSyllables: 3 }, seededRng(9), 40)) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      for (const segment of result.segments) {
        if (segment.role === "onset") expect(["p", "t"]).toContain(segment.ipa);
      }
    }
  });

  it("still carries the slot's class, so a class constraint keeps firing on it", () => {
    // Restricting a slot narrows what it produces; it does not reclassify the result. A
    // rule about C has to reach /p/ generated into a C slot that only allows /p t/.
    const g = grammar({
      templates: [narrow],
      constraints: [{ kind: "forbid_in_role", role: "onset", a: { kind: "class", classId: "c" } }],
    });
    const result = generateWord(g, { maxAttempts: 40 }, seededRng(4));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("C cannot be a onset");
  });

  it("fails as data, not by hanging, when its own segments are all gone", () => {
    const g = grammar({ templates: [{ ...narrow, slots: [restricts("nucleus", false, V, [])] }] });
    const result = generateWord(g, { maxAttempts: 10 }, seededRng(1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("no segments left");
  });
});

describe("generation", () => {
  // The regression anchor: a fixed seed must keep producing the same word. If this
  // changes, the sampler changed — which may be fine, but it should be deliberate.
  it("is deterministic for a given seed", () => {
    const a = generateWord(grammar(), {}, seededRng(42));
    const b = generateWord(grammar(), {}, seededRng(42));
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
  });

  it("only ever emits segments from the classes its slots name", () => {
    const allowed = new Set([...C.ipa, ...G.ipa, ...V.ipa]);
    const rng = seededRng(7);
    for (const result of generateWords(grammar(), {}, rng, 200)) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      for (const segment of result.segments) expect(allowed.has(segment.ipa)).toBe(true);
    }
  });

  it("respects the syllable count range", () => {
    const rng = seededRng(3);
    for (const result of generateWords(grammar(), { minSyllables: 2, maxSyllables: 2 }, rng, 50)) {
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.syllables).toHaveLength(2);
    }
  });

  it("always produces a nucleus, since that slot is required", () => {
    const rng = seededRng(11);
    for (const result of generateWords(grammar(), {}, rng, 100)) {
      if (!result.ok) continue;
      expect(result.segments.some((s) => s.role === "nucleus")).toBe(true);
    }
  });
});

describe("constraints", () => {
  it("forbid_in_role keeps a segment out of that role", () => {
    const g = grammar({
      constraints: [{ kind: "forbid_in_role", role: "onset", a: { kind: "phoneme", ipa: "ŋ" } }],
    });
    const rng = seededRng(5);
    let sawOnsets = 0;
    for (const result of generateWords(g, {}, rng, 300)) {
      if (!result.ok) continue;
      for (const segment of result.segments) {
        if (segment.role === "onset") sawOnsets += 1;
        if (segment.role === "onset") expect(segment.ipa).not.toBe("ŋ");
      }
    }
    // Guard against passing vacuously because nothing generated an onset at all.
    expect(sawOnsets).toBeGreaterThan(0);
  });

  it("no_identical_adjacent excludes geminates", () => {
    const g = grammar({ constraints: [{ kind: "no_identical_adjacent" }] });
    const rng = seededRng(9);
    for (const result of generateWords(g, { minSyllables: 2, maxSyllables: 3 }, rng, 300)) {
      if (!result.ok) continue;
      for (let i = 1; i < result.segments.length; i += 1) {
        expect(result.segments[i]?.ipa).not.toBe(result.segments[i - 1]?.ipa);
      }
    }
  });

  it("forbid_sequence catches a pair spanning a syllable boundary", () => {
    // The case a template cannot express: it sees one syllable, this sees two.
    const g = grammar({
      constraints: [
        {
          kind: "forbid_sequence",
          position: "anywhere",
          a: { kind: "phoneme", ipa: "s" },
          b: { kind: "phoneme", ipa: "l" },
        },
      ],
    });
    expect(
      violation(g, [
        { ipa: "s", role: "coda", classId: "c" },
        { ipa: "l", role: "onset", classId: "c" },
      ]),
    ).toContain("not allowed");
  });

  it("word_initial only checks the first pair", () => {
    const g = grammar({
      constraints: [
        {
          kind: "forbid_sequence",
          position: "word_initial",
          a: { kind: "class", classId: "c" },
          b: { kind: "class", classId: "c" },
        },
      ],
    });
    const cc = (role: "onset" | "coda") => ({ ipa: "p", role, classId: "c" }) as const;
    expect(violation(g, [cc("onset"), cc("onset")])).not.toBeNull();
    // The same pair later in the word is fine.
    expect(
      violation(g, [{ ipa: "a", role: "nucleus", classId: "v" }, cc("coda"), cc("onset")]),
    ).toBeNull();
  });

  it("reports a well-formed word as having no violation", () => {
    expect(violation(grammar(), [{ ipa: "a", role: "nucleus", classId: "v" }])).toBeNull();
  });
});

describe("grammars that cannot produce anything", () => {
  // The one failure that would otherwise take the tab with it: an unbounded resample
  // loop over a grammar with no satisfying word.
  it("gives up within the attempt cap instead of hanging", () => {
    const g = grammar({
      constraints: [
        { kind: "forbid_in_role", role: "nucleus", a: { kind: "class", classId: "v" } },
      ],
    });
    const result = generateWord(g, { maxAttempts: 50 }, seededRng(1));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("nucleus");
  });

  it("reports a required slot with nothing to draw from", () => {
    const empty: ResolvedClass = { id: "v", symbol: "V", label: null, ipa: [] };
    const g: Grammar = {
      classes: [empty],
      templates: [{ ...heavy, slots: [follows("nucleus", false, empty)] }],
      constraints: [],
    };
    const result = generateWord(g, { maxAttempts: 10 }, seededRng(2));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("no segments left");
  });

  it("reports a grammar with no usable template", () => {
    const g = grammar({ templates: [{ ...heavy, slots: [] }] });
    const result = generateWord(g, {}, seededRng(2));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("no syllable template");
  });

  it("does not divide by zero when there are no templates at all", () => {
    const result = generateWord(grammar({ templates: [] }), {}, seededRng(2));
    expect(result.ok).toBe(false);
  });
});

describe("purity", () => {
  // The reuse claim rests entirely on this module having no framework or I/O
  // dependencies, and a doc comment saying so does not hold. A future word generator
  // imports it as-is; the moment it reaches for the Supabase client it stops being
  // reusable and starts being this page's internals.
  it("imports nothing from vue, pinia, or supabase", () => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.filter((i) => i !== undefined && !i.startsWith("."))).toEqual([]);
  });
});

describe("impactOfRemoving", () => {
  const draft: Draft = {
    classes: [
      { symbol: "C", label: null, sort_order: 0, phoneme_ipa: ["p", "t", "ŋ"] },
      { symbol: "G", label: null, sort_order: 1, phoneme_ipa: ["j", "w"] },
      { symbol: "V", label: null, sort_order: 2, phoneme_ipa: ["a", "i"] },
    ],
    templates: [
      {
        name: "heavy",
        weight: 1,
        sort_order: 0,
        notes: null,
        slots: [
          { slot_index: 0, role: "onset", optional: true, class_symbol: "C", phoneme_ipa: null },
          { slot_index: 1, role: "onset", optional: false, class_symbol: "G", phoneme_ipa: null },
          { slot_index: 2, role: "nucleus", optional: false, class_symbol: "V", phoneme_ipa: null },
        ],
      },
    ],
    constraints: [
      {
        kind: "forbid_in_role",
        role: "onset",
        seq_position: null,
        a_class_symbol: null,
        a_phoneme_ipa: "ŋ",
        b_class_symbol: null,
        b_phoneme_ipa: null,
        note: null,
      },
      {
        kind: "no_identical_adjacent",
        role: null,
        seq_position: null,
        a_class_symbol: null,
        a_phoneme_ipa: null,
        b_class_symbol: null,
        b_phoneme_ipa: null,
        note: null,
      },
    ],
  };

  it("names a slot that would lose segments it holds itself", () => {
    const withRestricted: Draft = {
      ...draft,
      templates: [
        {
          ...draft.templates[0]!,
          slots: [
            {
              slot_index: 0,
              role: "onset",
              optional: false,
              class_symbol: "C",
              phoneme_ipa: ["p", "ŋ"],
            },
            {
              slot_index: 1,
              role: "nucleus",
              optional: false,
              class_symbol: "V",
              phoneme_ipa: null,
            },
          ],
        },
      ],
    };
    const impact = impactOfRemoving(withRestricted, new Set(["ŋ"]));
    expect(impact.slots).toEqual([{ template: "heavy", slotIndex: 0, ipa: ["ŋ"] }]);
    // Its class still has /p/ and so does the slot, so nothing stops generating.
    expect(impact.templates).toEqual([]);
  });

  // A restricted slot has to be judged on its own set: C still holds /p/ and /t/, but this
  // slot allows neither, so the template it is required in stops producing anything.
  it("names a template whose required slot's own segments are all going", () => {
    const withRestricted: Draft = {
      ...draft,
      templates: [
        {
          ...draft.templates[0]!,
          slots: [
            {
              slot_index: 0,
              role: "onset",
              optional: false,
              class_symbol: "C",
              phoneme_ipa: ["ŋ"],
            },
          ],
        },
      ],
    };
    expect(impactOfRemoving(withRestricted, new Set(["ŋ"])).templates).toEqual(["heavy"]);
  });

  it("reports nothing when nothing is being removed", () => {
    expect(impactOfRemoving(draft, new Set())).toEqual({
      classes: [],
      emptied: [],
      slots: [],
      orphaned: [],
      templates: [],
    });
  });

  it("names the classes that lose members, and which members", () => {
    const impact = impactOfRemoving(draft, new Set(["p", "j"]));
    expect(impact.classes).toEqual([
      { symbol: "C", ipa: ["p"] },
      { symbol: "G", ipa: ["j"] },
    ]);
    expect(impact.emptied).toEqual([]);
  });

  // The rule survives the segment leaving — it is reported as orphaned, not deleted.
  it("reports a rule that would be left orphaned", () => {
    const impact = impactOfRemoving(draft, new Set(["ŋ"]));
    expect(impact.orphaned).toHaveLength(1);
    expect(impact.orphaned[0]?.a_phoneme_ipa).toBe("ŋ");
  });

  it("leaves rules that name no phoneme alone", () => {
    const impact = impactOfRemoving(draft, new Set(["p", "t", "ŋ"]));
    expect(impact.orphaned.every((c) => c.kind !== "no_identical_adjacent")).toBe(true);
  });

  it("flags a class emptied completely, and the template it breaks", () => {
    const impact = impactOfRemoving(draft, new Set(["j", "w"]));
    expect(impact.emptied).toEqual(["G"]);
    // G fills a required slot, so `heavy` stops generating entirely.
    expect(impact.templates).toEqual(["heavy"]);
  });

  it("does not blame a template whose emptied class only fills an optional slot", () => {
    const impact = impactOfRemoving(draft, new Set(["p", "t", "ŋ"]));
    expect(impact.emptied).toEqual(["C"]);
    expect(impact.templates).toEqual([]);
  });
});

describe("orphaned rules", () => {
  const rule = (a: string | null, b: string | null): DraftConstraint => ({
    kind: b === null ? "forbid_in_role" : "forbid_sequence",
    role: b === null ? "onset" : null,
    seq_position: b === null ? null : "anywhere",
    a_class_symbol: null,
    a_phoneme_ipa: a,
    b_class_symbol: null,
    b_phoneme_ipa: b,
    note: null,
  });

  const inventory = new Set(["p", "a"]);

  it("finds a term the inventory no longer has", () => {
    expect(orphanedTerms(rule("ŋ", null), inventory)).toEqual(["ŋ"]);
  });

  it("says nothing about a rule whose terms all exist", () => {
    expect(orphanedTerms(rule("p", "a"), inventory)).toEqual([]);
  });

  it("reports both sides of a sequence rule", () => {
    expect(orphanedTerms(rule("ŋ", "s"), inventory)).toEqual(["ŋ", "s"]);
  });

  it("does not report the same missing segment twice", () => {
    expect(orphanedTerms(rule("ŋ", "ŋ"), inventory)).toEqual(["ŋ"]);
  });

  it("ignores class terms, which are still foreign keys", () => {
    const byClass: DraftConstraint = { ...rule(null, null), a_class_symbol: "C" };
    expect(orphanedTerms(byClass, inventory)).toEqual([]);
  });

  it("collects every broken rule in a draft", () => {
    const draft: Draft = {
      classes: [],
      templates: [],
      constraints: [rule("p", null), rule("ŋ", null), rule("s", "p")],
    };
    const broken = orphanedConstraints(draft, inventory);
    expect(broken).toHaveLength(2);
    expect(broken.map((b) => b.missing)).toEqual([["ŋ"], ["s"]]);
  });
});

describe("cloneDraft", () => {
  const draft: Draft = {
    classes: [{ symbol: "C", label: null, sort_order: 0, phoneme_ipa: ["p", "t"] }],
    templates: [
      {
        name: "basic",
        weight: 1,
        sort_order: 0,
        notes: null,
        slots: [
          { slot_index: 0, role: "nucleus", optional: false, class_symbol: "C", phoneme_ipa: null },
        ],
      },
    ],
    constraints: [],
  };

  it("copies deeply rather than sharing nested arrays", () => {
    const copy = cloneDraft(draft);
    copy.classes[0]?.phoneme_ipa.push("k");
    expect(draft.classes[0]?.phoneme_ipa).toEqual(["p", "t"]);
  });

  // The regression. `structuredClone` throws DataCloneError on a Vue reactive proxy, and
  // the store clones as the first thing `save()` does — so every save died before
  // reaching the database, with nothing shown to the user.
  it("survives a Vue reactive proxy", () => {
    expect(() => cloneDraft(reactive(structuredClone(draft)))).not.toThrow();
    expect(() => cloneDraft(ref(structuredClone(draft)).value)).not.toThrow();
  });

  it("produces a plain object a reactive source can be compared against", () => {
    const live = ref(structuredClone(draft));
    expect(canonicalDraft(cloneDraft(live.value))).toBe(canonicalDraft(draft));
  });
});

describe("canonicalDraft", () => {
  const base: Draft = {
    classes: [
      { symbol: "V", label: null, sort_order: 1, phoneme_ipa: ["a", "i"] },
      { symbol: "C", label: null, sort_order: 0, phoneme_ipa: ["p"] },
    ],
    templates: [],
    constraints: [],
  };

  it("ignores the order of classes and of members within them", () => {
    const shuffled: Draft = {
      ...base,
      classes: [
        { symbol: "C", label: null, sort_order: 0, phoneme_ipa: ["p"] },
        { symbol: "V", label: null, sort_order: 1, phoneme_ipa: ["i", "a"] },
      ],
    };
    expect(canonicalDraft(shuffled)).toBe(canonicalDraft(base));
  });

  it("still notices a real change", () => {
    const changed = cloneDraft(base);
    changed.classes[0]?.phoneme_ipa.push("u");
    expect(canonicalDraft(changed)).not.toBe(canonicalDraft(base));
  });

  // Slot order is meaningful — (C)V is not V(C) — so it must survive canonicalisation.
  it("does not flatten slot order", () => {
    const one: Draft = {
      ...base,
      templates: [
        {
          name: "t",
          weight: 1,
          sort_order: 0,
          notes: null,
          slots: [
            { slot_index: 0, role: "onset", optional: true, class_symbol: "C", phoneme_ipa: null },
            {
              slot_index: 1,
              role: "nucleus",
              optional: false,
              class_symbol: "V",
              phoneme_ipa: null,
            },
          ],
        },
      ],
    };
    const two = cloneDraft(one);
    const slots = two.templates[0]?.slots;
    if (slots?.[0] && slots[1]) {
      slots[0].class_symbol = "V";
      slots[1].class_symbol = "C";
    }
    expect(canonicalDraft(two)).not.toBe(canonicalDraft(one));
  });

  const withSlot = (phoneme_ipa: string[] | null): Draft => ({
    ...base,
    templates: [
      {
        name: "t",
        weight: 1,
        sort_order: 0,
        notes: null,
        slots: [
          { slot_index: 0, role: "nucleus", optional: false, class_symbol: "V", phoneme_ipa },
        ],
      },
    ],
  });

  it("ignores the order of a slot's own segments", () => {
    expect(canonicalDraft(withSlot(["a", "i"]))).toBe(canonicalDraft(withSlot(["i", "a"])));
  });

  // Different states, even where they resolve to the same list today: one follows the
  // class as it is edited and the other does not.
  it("tells following the class apart from naming exactly what the class holds", () => {
    expect(canonicalDraft(withSlot(["i", "a"]))).not.toBe(canonicalDraft(withSlot(null)));
  });
});

describe("resolveGrammar", () => {
  const draft: Draft = {
    classes: [
      { symbol: "C", label: null, sort_order: 0, phoneme_ipa: ["p", "ŋ"] },
      { symbol: "V", label: null, sort_order: 1, phoneme_ipa: ["a"] },
    ],
    templates: [
      {
        name: "basic",
        weight: 1,
        sort_order: 0,
        notes: null,
        slots: [
          { slot_index: 0, role: "onset", optional: true, class_symbol: "C", phoneme_ipa: null },
          { slot_index: 1, role: "nucleus", optional: false, class_symbol: "V", phoneme_ipa: null },
        ],
      },
    ],
    constraints: [],
  };

  // The load-bearing one. A class may name a segment the inventory no longer has, and if
  // the generator kept producing it then removing a phoneme would change nothing at all.
  it("drops class members the inventory does not have", () => {
    const g = resolveGrammar(draft, new Set(["p", "a"]));
    expect(g.classes.find((c) => c.symbol === "C")?.ipa).toEqual(["p"]);
  });

  it("never generates a segment that has left the inventory", () => {
    const g = resolveGrammar(draft, new Set(["p", "a"]));
    for (const result of generateWords(g, {}, seededRng(4), 200)) {
      if (!result.ok) continue;
      expect(result.ipa).not.toContain("ŋ");
    }
  });

  it("keeps everything when the inventory still has it", () => {
    const g = resolveGrammar(draft, new Set(["p", "ŋ", "a"]));
    expect(g.classes.find((c) => c.symbol === "C")?.ipa).toEqual(["p", "ŋ"]);
  });

  const restricted = (phoneme_ipa: string[] | null): Draft => ({
    ...draft,
    templates: [
      {
        ...draft.templates[0]!,
        slots: [
          { slot_index: 0, role: "nucleus", optional: false, class_symbol: "C", phoneme_ipa },
        ],
      },
    ],
  });

  it("gives a following slot its class's members, filtered", () => {
    const slot = resolveGrammar(restricted(null), new Set(["p", "a"])).templates[0]?.slots[0];
    expect(slot?.ipa).toEqual(["p"]);
    expect(slot?.restricted).toBe(false);
  });

  // The same filter class members get, for the same reason: a slot may name a segment the
  // language no longer has, and generating it anyway would make removing a phoneme mean
  // nothing at all.
  it("filters a slot's own segments against the inventory too", () => {
    const slot = resolveGrammar(restricted(["p", "ŋ"]), new Set(["p", "a"])).templates[0]?.slots[0];
    expect(slot?.ipa).toEqual(["p"]);
    expect(slot?.restricted).toBe(true);
  });

  it("lets a slot name a segment its class does not hold", () => {
    const slot = resolveGrammar(restricted(["a"]), new Set(["p", "ŋ", "a"])).templates[0]?.slots[0];
    expect(slot?.ipa).toEqual(["a"]);
    expect(slot?.cls.symbol).toBe("C");
  });

  it("drops a slot whose class does not exist rather than emitting a hole", () => {
    const broken: Draft = {
      ...draft,
      templates: [
        {
          ...draft.templates[0]!,
          slots: [
            {
              slot_index: 0,
              role: "onset",
              optional: true,
              class_symbol: "GONE",
              phoneme_ipa: null,
            },
            {
              slot_index: 1,
              role: "nucleus",
              optional: false,
              class_symbol: "V",
              phoneme_ipa: null,
            },
          ],
        },
      ],
    };
    expect(resolveGrammar(broken, new Set(["a"])).templates[0]?.slots).toHaveLength(1);
  });

  it("drops a half-specified rule the database would refuse anyway", () => {
    const halfRule: Draft = {
      ...draft,
      constraints: [
        {
          kind: "forbid_sequence",
          role: null,
          seq_position: "anywhere",
          a_class_symbol: "C",
          a_phoneme_ipa: null,
          b_class_symbol: null,
          b_phoneme_ipa: null,
          note: null,
        },
      ],
    };
    expect(resolveGrammar(halfRule, new Set(["p", "a"])).constraints).toEqual([]);
  });
});

describe("orphanedMembers", () => {
  const draft: Draft = {
    classes: [
      { symbol: "C", label: null, sort_order: 0, phoneme_ipa: ["p", "ŋ"] },
      { symbol: "V", label: null, sort_order: 1, phoneme_ipa: ["a"] },
    ],
    templates: [],
    constraints: [],
  };

  it("names the class and the segments it can no longer use", () => {
    expect(orphanedMembers(draft, new Set(["p", "a"]))).toEqual([{ symbol: "C", missing: ["ŋ"] }]);
  });

  it("says nothing when every member is in the inventory", () => {
    expect(orphanedMembers(draft, new Set(["p", "ŋ", "a"]))).toEqual([]);
  });
});

describe("orphanedSlotMembers", () => {
  const withSlots = (slots: Draft["templates"][number]["slots"]): Draft => ({
    classes: [{ symbol: "C", label: null, sort_order: 0, phoneme_ipa: ["p", "ŋ"] }],
    templates: [{ name: "basic", weight: 1, sort_order: 0, notes: null, slots }],
    constraints: [],
  });

  it("names the template, the slot and the segments it can no longer use", () => {
    const draft = withSlots([
      { slot_index: 0, role: "onset", optional: false, class_symbol: "C", phoneme_ipa: ["p", "ŋ"] },
    ]);
    expect(orphanedSlotMembers(draft, new Set(["p"]))).toEqual([
      { template: "basic", slotIndex: 0, missing: ["ŋ"] },
    ]);
  });

  // A following slot has nothing of its own to dangle: it takes whatever the class has,
  // and orphanedMembers already reports the class.
  it("says nothing about a slot that follows its class", () => {
    const draft = withSlots([
      { slot_index: 0, role: "onset", optional: false, class_symbol: "C", phoneme_ipa: null },
    ]);
    expect(orphanedSlotMembers(draft, new Set(["p"]))).toEqual([]);
  });
});
