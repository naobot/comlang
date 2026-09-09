import { describe, expect, it } from "vite-plus/test";

// `?raw` rather than node:fs, for the reason `phonotactics.test.ts` gives: this file is
// type-checked by the DOM tsconfig, which has no Node types.
import source from "./lemmaPhonotactics.ts?raw";

import { checkLemma } from "./lemmaPhonotactics";
import type {
  Grammar,
  ResolvedClass,
  ResolvedConstraint,
  ResolvedSlot,
  ResolvedTemplate,
} from "./phonotactics";

// A consonant/glide/vowel inventory wide enough for the words below (grammar.yaml's own
// segments, near enough).
const C: ResolvedClass = {
  id: "c",
  symbol: "C",
  label: "consonant",
  ipa: ["p", "b", "t", "d", "k", "g", "m", "n", "ŋ", "s", "z", "h", "l", "r"],
};
const G: ResolvedClass = { id: "g", symbol: "G", label: "glide", ipa: ["j", "w"] };
const V: ResolvedClass = { id: "v", symbol: "V", label: "vowel", ipa: ["i", "e", "a", "o", "u"] };

const inventory = new Set([...C.ipa, ...G.ipa, ...V.ipa]);

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

/** `(C)(G)V(C)` — the shape the seed conlang's words are built on. */
const cgvc: ResolvedTemplate = {
  id: "cgvc",
  name: "cgvc",
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
  templates: [cgvc],
  constraints: [],
  ...over,
});

describe("checkLemma — degenerate inputs fail safe", () => {
  it("passes a blank lemma", () => {
    expect(checkLemma(grammar(), inventory, "   ")).toEqual({ ok: true });
  });

  it("passes anything when the inventory is empty", () => {
    expect(checkLemma(grammar(), new Set(), "tlpk")).toEqual({ ok: true });
  });

  it("passes anything when no template has slots", () => {
    const empty = grammar({ templates: [{ id: "x", name: "x", weight: 1, slots: [] }] });
    expect(checkLemma(empty, inventory, "tlpk")).toEqual({ ok: true });
  });
});

describe("checkLemma — syllabification", () => {
  it("accepts a single CVC syllable", () => {
    expect(checkLemma(grammar(), inventory, "hot")).toEqual({ ok: true });
  });

  it("accepts a bare vowel through the optional slots", () => {
    expect(checkLemma(grammar(), inventory, "a")).toEqual({ ok: true });
  });

  it("accepts a CGVC syllable", () => {
    expect(checkLemma(grammar(), inventory, "mjoŋ")).toEqual({ ok: true });
  });

  it("accepts a polysyllabic word", () => {
    expect(checkLemma(grammar(), inventory, "bwanzwet")).toEqual({ ok: true });
  });

  it("accepts a three-syllable compound", () => {
    expect(checkLemma(grammar(), inventory, "pamŋwathoŋ")).toEqual({ ok: true });
  });

  it("flags a substring that is not a phoneme", () => {
    const result = checkLemma(grammar(), inventory, "xat");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("unknown-segment");
    expect(result.reason).toContain("inventory");
  });

  it("flags a word that fits no syllable pattern", () => {
    const result = checkLemma(grammar(), inventory, "tlpk");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("no-syllabification");
    expect(result.reason).toContain("(C)(G)V(C)");
  });

  it("ignores case", () => {
    expect(checkLemma(grammar(), inventory, "HOT")).toEqual({ ok: true });
  });

  it("folds script-g in the inventory against a romanized ‘g’", () => {
    // The IPA chart stores the voiced velar stop as ɡ (U+0261); lemmas write plain g.
    const scriptG: ResolvedClass = { ...C, ipa: C.ipa.map((x) => (x === "g" ? "ɡ" : x)) };
    const g = grammar({
      classes: [scriptG, G, V],
      templates: [{ ...cgvc, slots: [follows("onset", true, scriptG), ...cgvc.slots.slice(1)] }],
    });
    const inv = new Set([...scriptG.ipa, ...G.ipa, ...V.ipa]);
    expect(checkLemma(g, inv, "gal")).toEqual({ ok: true });
  });

  it("returns quickly on a long unparseable string", () => {
    const started = Date.now();
    const result = checkLemma(grammar(), inventory, "n".repeat(200));
    expect(result.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("checkLemma — constraints", () => {
  const forbidCoda: ResolvedConstraint = {
    kind: "forbid_in_role",
    role: "coda",
    a: { kind: "class", classId: "c" },
  };

  it("catches a forbidden pair — `violation()` scans the flat word, boundaries included", () => {
    const forbidTK: ResolvedConstraint = {
      kind: "forbid_sequence",
      position: "anywhere",
      a: { kind: "phoneme", ipa: "t" },
      b: { kind: "phoneme", ipa: "k" },
    };
    const result = checkLemma(grammar({ constraints: [forbidTK] }), inventory, "atka");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("constraint");
    expect(result.reason).toContain("not allowed");
  });

  it("catches identical adjacent segments", () => {
    const result = checkLemma(
      grammar({ constraints: [{ kind: "no_identical_adjacent" }] }),
      inventory,
      "annan",
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("constraint");
  });

  it("flags a word every split of which puts a consonant in the coda", () => {
    const result = checkLemma(grammar({ constraints: [forbidCoda] }), inventory, "hot");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("constraint");
  });

  it("passes when one valid split keeps every consonant out of the coda", () => {
    // "ata" parses as a.ta (t is an onset, no coda anywhere) or at.a (t is a coda). The
    // first clears `forbid coda`, so the word fits — a single canonical split would miss
    // this.
    const result = checkLemma(grammar({ constraints: [forbidCoda] }), inventory, "ata");
    expect(result).toEqual({ ok: true });
  });
});

describe("purity", () => {
  it("imports nothing from vue, pinia, or supabase", () => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.filter((i) => i !== undefined && !i.startsWith("."))).toEqual([]);
  });
});
