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

  it("strips surrounding slashes, the shape underlying_phonology is stored in", () => {
    expect(checkLemma(grammar(), inventory, "/hot/")).toEqual({ ok: true });
    expect(checkLemma(grammar(), inventory, "/tlpk/").ok).toBe(false);
  });

  it("returns quickly on a long unparseable string", () => {
    const started = Date.now();
    const result = checkLemma(grammar(), inventory, "n".repeat(200));
    expect(result.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(500);
  });
});

describe("checkLemma — explicit syllable boundaries", () => {
  const forbidCoda: ResolvedConstraint = {
    kind: "forbid_in_role",
    role: "coda",
    a: { kind: "class", classId: "c" },
  };

  it("reads `.` as a boundary, not a forbidden character", () => {
    expect(checkLemma(grammar(), inventory, "soŋ.wo")).toEqual({ ok: true });
    expect(checkLemma(grammar(), inventory, "/soŋ.wo/")).toEqual({ ok: true });
  });

  it("validates the marked split, even where the phonemes alone are ambiguous", () => {
    // "ata" is fine unmarked — it can split a.ta, keeping t out of the coda …
    expect(checkLemma(grammar({ constraints: [forbidCoda] }), inventory, "ata")).toEqual({
      ok: true,
    });
    // … but "at.a" pins t into the coda, so now the constraint bites.
    const result = checkLemma(grammar({ constraints: [forbidCoda] }), inventory, "at.a");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("constraint");
  });

  it("flags a marked chunk that is not a possible syllable", () => {
    const result = checkLemma(grammar(), inventory, "tlp.k");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("no-syllabification");
  });

  it("tolerates leading, trailing and doubled dots", () => {
    expect(checkLemma(grammar(), inventory, ".hot.")).toEqual({ ok: true });
    expect(checkLemma(grammar(), inventory, "soŋ..wo")).toEqual({ ok: true });
  });

  it("treats a phonology of only dots as blank", () => {
    expect(checkLemma(grammar(), inventory, " . ")).toEqual({ ok: true });
  });
});

describe("checkLemma — character variants", () => {
  // An inventory that uses the real IPA glyphs, so the ASCII forms have to be mapped.
  const Ci: ResolvedClass = {
    id: "c",
    symbol: "C",
    label: null,
    ipa: ["p", "t", "k", "ɡ", "m", "n", "ŋ", "s", "t͡s", "ɾ", "ɰ", "l"],
  };
  const Vi: ResolvedClass = { id: "v", symbol: "V", label: null, ipa: ["i", "e", "a", "o", "u"] };
  const inv = new Set([...Ci.ipa, ...Vi.ipa]);
  const g = grammar({
    classes: [Ci, Vi],
    templates: [
      {
        id: "t",
        name: "t",
        weight: 1,
        slots: [
          follows("onset", true, Ci),
          follows("nucleus", false, Vi),
          follows("coda", true, Ci),
        ],
      },
    ],
  });

  it("reads Latin g as ɡ and Latin r as the tap ɾ", () => {
    expect(checkLemma(g, inv, "gat")).toEqual({ ok: true });
    expect(checkLemma(g, inv, "ran")).toEqual({ ok: true });
  });

  it("reads the digraphs ng and ts as ŋ and t͡s", () => {
    expect(checkLemma(g, inv, "ngang")).toEqual({ ok: true });
    expect(checkLemma(g, inv, "tsi")).toEqual({ ok: true });
  });

  it("reads w as the velar approximant ɰ", () => {
    expect(checkLemma(g, inv, "wa")).toEqual({ ok: true });
  });

  it("does not invent a phoneme the language does not have", () => {
    // ŋ is not in this inventory, so `ng` maps to nothing and `g` is flagged.
    const noNg = new Set(["p", "t", "k", "n", "s", "i", "e", "a", "o", "u"]);
    const result = checkLemma(g, noNg, "ngi");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.kind).toBe("unknown-segment");
  });

  it("keeps the typed form when the language uses it as its own phoneme", () => {
    // This inventory has a literal `w` in the slots, so `w` must stay `w`, not fold to ɰ.
    const Cw: ResolvedClass = { ...Ci, ipa: [...Ci.ipa, "w"] };
    const gw = grammar({
      classes: [Cw, Vi],
      templates: [
        {
          id: "t",
          name: "t",
          weight: 1,
          slots: [
            follows("onset", true, Cw),
            follows("nucleus", false, Vi),
            follows("coda", true, Cw),
          ],
        },
      ],
    });
    expect(checkLemma(gw, new Set([...inv, "w"]), "wa")).toEqual({ ok: true });
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
