import { describe, expect, it } from "vite-plus/test";

// `?raw` rather than node:fs — this file is type-checked by the DOM tsconfig, which
// deliberately has no Node types, and Vite resolves the raw import in both.
import source from "./phonotactics.ts?raw";

import {
  type Grammar,
  type ResolvedClass,
  type ResolvedTemplate,
  type Draft,
  type DraftConstraint,
  generateWord,
  generateWords,
  impactOfRemoving,
  orphanedConstraints,
  orphanedTerms,
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

const heavy: ResolvedTemplate = {
  id: "t1",
  name: "heavy",
  weight: 1,
  slots: [
    { role: "onset", optional: true, cls: C },
    { role: "onset", optional: true, cls: G },
    { role: "nucleus", optional: false, cls: V },
    { role: "coda", optional: true, cls: C },
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

  it("reports a required slot whose class is empty", () => {
    const empty: ResolvedClass = { id: "v", symbol: "V", label: null, ipa: [] };
    const g: Grammar = {
      classes: [empty],
      templates: [{ ...heavy, slots: [{ role: "nucleus", optional: false, cls: empty }] }],
      constraints: [],
    };
    const result = generateWord(g, { maxAttempts: 10 }, seededRng(2));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("empty");
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
          { slot_index: 0, role: "onset", optional: true, class_symbol: "C" },
          { slot_index: 1, role: "onset", optional: false, class_symbol: "G" },
          { slot_index: 2, role: "nucleus", optional: false, class_symbol: "V" },
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

  it("reports nothing when nothing is being removed", () => {
    expect(impactOfRemoving(draft, new Set())).toEqual({
      classes: [],
      emptied: [],
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
