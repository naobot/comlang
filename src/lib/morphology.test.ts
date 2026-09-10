import { describe, expect, it } from "vite-plus/test";

// `?raw` rather than node:fs — this file is type-checked by the DOM tsconfig, which
// deliberately has no Node types, and Vite resolves the raw import in both.
import source from "./morphology.ts?raw";
import {
  type AffixEntry,
  type Analysis,
  type MorphologySpec,
  type RuleConfig,
  type StemEntry,
  affixVariants,
  analyze,
  buildRecognizer,
  reduplicant,
  syllabify,
  tokenizeConlang,
} from "./morphology";

const RULES: RuleConfig = {
  vowels: "aeiou",
  glides: "jw",
  digraphs: ["ng", "ts"],
  reduplication: { enabled: true, role: "plural", gloss: "plural", copySyllables: 2 },
  harmony: { enabled: false, pairs: { i: "u", e: "o" }, neutral: "a" },
  elision: { enabled: false },
  lowering: { enabled: false, after: "w", map: { u: "o" } },
  gemination: { enabled: false, from: "ng", to: "ngg", positions: ["suffix"] },
};

const stem = (over: Partial<StemEntry> & { lemma: string }): StemEntry => ({
  entryKey: null,
  gloss: null,
  wordClass: "noun",
  slotClass: "nominal",
  ...over,
});

const affix = (
  over: Partial<AffixEntry> & { form: string; role: AffixEntry["role"] },
): AffixEntry => ({
  position: "suffix",
  entryKey: null,
  gloss: null,
  wordClass: null,
  ...over,
});

/** A small xenic-shaped spec: a couple of stems, a prefix, and a suffix chain. */
const spec = (over: Partial<MorphologySpec> = {}): MorphologySpec => ({
  rules: RULES,
  order: {
    nominal: ["numeral", "classifier", "STEM", "plural", "case", "semanticParticle"],
    predicate: ["negation", "STEM", "tense", "force", "evidential", "conjunction"],
  },
  stems: [
    stem({ lemma: "buk", entryKey: "n_exterior", gloss: "exterior" }),
    stem({ lemma: "njuhja", entryKey: "n_pen", gloss: "pen" }),
    stem({
      lemma: "hju",
      entryKey: "v_eat",
      gloss: "eat",
      wordClass: "verb",
      slotClass: "predicate",
    }),
    stem({
      lemma: "ga",
      entryKey: "v_exist",
      gloss: "exist",
      wordClass: "predicate",
      slotClass: "predicate",
    }),
    stem({ lemma: "de", entryKey: "n_wind", gloss: "wind" }),
  ],
  affixes: [
    affix({ form: "ha", role: "negation", position: "prefix", entryKey: "p_neg1", gloss: "not" }),
    affix({
      form: "bi",
      role: "case",
      entryKey: "p_loc",
      gloss: "locative",
      wordClass: "case marker",
    }),
    affix({
      form: "de",
      role: "case",
      entryKey: "p_nom",
      gloss: "nominative",
      wordClass: "case marker",
    }),
    affix({
      form: "wu",
      role: "tense",
      entryKey: "t_prs",
      gloss: "present",
      wordClass: "tense marker",
    }),
    affix({
      form: "la",
      role: "force",
      entryKey: "f_imp",
      gloss: "imperative",
      wordClass: "force marker",
    }),
  ],
  ...over,
});

const primary = (r: ReturnType<typeof analyze>): Analysis => {
  if (!r.ok) throw new Error(`expected ok, got ${r.reason}`);
  const first = r.analyses[0];
  if (!first) throw new Error("expected at least one analysis");
  return first;
};

const shape = (a: Analysis) => a.morphemes.map((m) => `${m.role}:${m.form}`);

describe("syllabify", () => {
  it("splits at nuclei with a maximal one-consonant-plus-glide onset", () => {
    expect(syllabify("njuhja", RULES)).toEqual(["nju", "hja"]);
  });

  it("keeps a digraph as a single onset segment", () => {
    expect(syllabify("tsinga", RULES)).toEqual(["tsi", "nga"]);
  });

  it("returns the whole word for a monosyllable", () => {
    expect(syllabify("buk", RULES)).toEqual(["buk"]);
    expect(syllabify("hwi", RULES)).toEqual(["hwi"]);
  });
});

describe("reduplicant", () => {
  it("copies the final two syllables", () => {
    expect(reduplicant("njuhja", RULES)).toBe("njuhja");
  });

  it("copies the whole word when monosyllabic", () => {
    expect(reduplicant("hwi", RULES)).toBe("hwi");
  });
});

describe("tokenizeConlang", () => {
  it("covers the whole string with alternating word and gap tokens", () => {
    const text = "bukbi njuhja-njuhja.\n  gawu";
    const tokens = tokenizeConlang(text);
    expect(tokens.map((t) => t.text).join("")).toBe(text);
    expect(tokens.filter((t) => t.kind === "word").map((t) => t.text)).toEqual([
      "bukbi",
      "njuhja",
      "njuhja",
      "gawu",
    ]);
  });

  it("keeps offsets contiguous and monotonic", () => {
    const tokens = tokenizeConlang("a, b");
    let cursor = 0;
    for (const t of tokens) {
      expect(t.start).toBe(cursor);
      expect(t.end).toBeGreaterThan(t.start);
      cursor = t.end;
    }
    expect(cursor).toBe(4);
  });

  it("handles an empty string", () => {
    expect(tokenizeConlang("")).toEqual([]);
  });
});

describe("buildRecognizer", () => {
  it("flags two affixes that share a form under the same role", () => {
    const rec = buildRecognizer(
      spec({
        affixes: [
          affix({ form: "bi", role: "case", entryKey: "p_loc" }),
          affix({ form: "bi", role: "case", entryKey: "p_dat" }),
        ],
      }),
    );
    expect(rec.problems).toHaveLength(1);
    expect(rec.problems[0]).toContain("bi");
  });

  it("groups homograph stems under one lemma", () => {
    const rec = buildRecognizer(
      spec({ stems: [stem({ lemma: "de" }), stem({ lemma: "de", entryKey: "n_animal" })] }),
    );
    expect(rec.stemsByLemma.get("de")).toHaveLength(2);
  });
});

describe("analyze", () => {
  const rec = buildRecognizer(spec());

  it("peels a suffix off a stem", () => {
    expect(shape(primary(analyze("bukbi", rec)))).toEqual(["stem:buk", "case:bi"]);
  });

  it("peels a negation prefix and a tense/force chain off a predicate", () => {
    expect(shape(primary(analyze("hagawula", rec)))).toEqual([
      "negation:ha",
      "stem:ga",
      "tense:wu",
      "force:la",
    ]);
  });

  it("reads a tense and force chain on a predicate", () => {
    expect(shape(primary(analyze("gawula", rec)))).toEqual(["stem:ga", "tense:wu", "force:la"]);
  });

  it("rejects a negation prefix on a nominal stem", () => {
    expect(analyze("habukde", rec)).toEqual({ ok: false, reason: "no valid segmentation" });
  });

  it("recognises reduplication as a single plural reading", () => {
    const r = analyze("njuhjanjuhjade", rec);
    if (!r.ok) throw new Error("expected ok");
    const redup = r.analyses.filter((a) => a.reduplicated);
    expect(redup).toHaveLength(1);
    expect(shape(redup[0]!)).toEqual(["stem:njuhja", "plural:njuhja", "case:de"]);
  });

  it("does not treat reduplication as plural when the flag is off", () => {
    const off = buildRecognizer(
      spec({ rules: { ...RULES, reduplication: { ...RULES.reduplication, enabled: false } } }),
    );
    const r = analyze("njuhjanjuhjade", off);
    if (r.ok) expect(r.analyses.every((a) => !a.reduplicated)).toBe(true);
  });

  it("rejects a slot order the templates do not admit", () => {
    // buk (nominal) + wu (tense) + de (case): tense is not in the nominal template.
    expect(analyze("bukwude", rec)).toEqual({ ok: false, reason: "no valid segmentation" });
  });

  it("returns every homograph reading", () => {
    const two = buildRecognizer(
      spec({
        stems: [
          stem({ lemma: "de", entryKey: "n_wind", gloss: "wind" }),
          stem({ lemma: "de", entryKey: "n_animal", gloss: "animal" }),
        ],
      }),
    );
    const r = analyze("de", two);
    if (!r.ok) throw new Error("expected ok");
    expect(r.analyses).toHaveLength(2);
    expect(r.analyses.every((a) => a.source === "citation")).toBe(true);
  });

  it("fails on a token with no known stem", () => {
    expect(analyze("zzzz", rec)).toEqual({ ok: false, reason: "no known stem" });
  });

  it("caps the number of analyses returned", () => {
    const many = buildRecognizer(
      spec({
        stems: Array.from({ length: 20 }, (_, i) => stem({ lemma: "de", entryKey: `n_${i}` })),
      }),
    );
    const r = analyze("de", many, { maxAnalyses: 3 });
    if (!r.ok) throw new Error("expected ok");
    expect(r.analyses).toHaveLength(3);
  });
});

describe("affixVariants", () => {
  it("returns just the form when no rule is enabled", () => {
    expect(affixVariants("swom", RULES, "suffix")).toEqual(["swom"]);
  });

  it("adds the harmony alternants of a participating vowel", () => {
    const harmonic = { ...RULES, harmony: { ...RULES.harmony, enabled: true } };
    expect(affixVariants("swom", harmonic, "suffix")).toContain("swem");
  });

  it("adds the lowered form after the labiovelar glide", () => {
    const lowering = { ...RULES, lowering: { ...RULES.lowering, enabled: true } };
    expect(affixVariants("kwun", lowering, "suffix")).toContain("kwon");
  });

  it("stays within the cap", () => {
    const both = {
      ...RULES,
      harmony: { enabled: true, pairs: { i: "u", e: "o", a: "o" }, neutral: "" },
      lowering: { ...RULES.lowering, enabled: true },
    };
    expect(affixVariants("wemeko", both, "suffix").length).toBeLessThanOrEqual(8);
  });

  describe("gemination", () => {
    const geminating = { ...RULES, gemination: { ...RULES.gemination, enabled: true } };

    it("adds the geminated form of a suffix whose onset /ŋ/ has its own following vowel", () => {
      expect(affixVariants("ngom", geminating, "suffix")).toContain("nggom");
    });

    it("does not apply to a prefix — its /ŋ/ opens the word, never sits between vowels", () => {
      expect(affixVariants("ngom", geminating, "prefix")).not.toContain("nggom");
    });

    it("does not apply to a bare /ŋ/ with no vowel of its own to confirm the environment", () => {
      // e_rel, the reported evidential: gemination also needs a vowel *before* it, which
      // this function cannot see — but it must not fire on a form with no vowel *after*
      // either, since that's the one half of the environment it can actually confirm.
      expect(affixVariants("ng", geminating, "suffix")).toEqual(["ng"]);
    });

    it("is a no-op when disabled", () => {
      expect(affixVariants("ngom", RULES, "suffix")).toEqual(["ngom"]);
    });
  });
});

describe("analyze with phonological rules", () => {
  it("peels a suffix that surfaced under vowel harmony", () => {
    const rec = buildRecognizer(
      spec({
        rules: { ...RULES, harmony: { ...RULES.harmony, enabled: true } },
        stems: [stem({ lemma: "bi", entryKey: "pn_1sg", wordClass: "pronoun" })],
        affixes: [
          affix({
            form: "swom",
            role: "case",
            entryKey: "p_nom",
            gloss: "nominative",
            wordClass: "case marker",
          }),
        ],
      }),
    );
    // Stored -swom, surfaced -swem after the front vowel of `bi`.
    const r = analyze("biswem", rec);
    if (!r.ok) throw new Error("expected ok");
    expect(r.analyses[0]!.morphemes.map((m) => `${m.role}:${m.form}`)).toEqual([
      "stem:bi",
      "case:swem",
    ]);
    expect(r.analyses[0]!.morphemes[1]!.entryKey).toBe("p_nom");
  });

  it("peels -nggom as the topic suffix -ngom, geminated intervocalically", () => {
    const rec = buildRecognizer(
      spec({
        rules: { ...RULES, gemination: { ...RULES.gemination, enabled: true } },
        stems: [stem({ lemma: "po", entryKey: "pn_1sg", wordClass: "pronoun" })],
        affixes: [
          affix({
            form: "ngom",
            role: "case",
            entryKey: "p_top",
            gloss: "topic",
            wordClass: "case marker",
          }),
        ],
      }),
    );
    const r = analyze("ponggom", rec);
    if (!r.ok) throw new Error("expected ok");
    expect(r.analyses[0]!.morphemes.map((m) => `${m.role}:${m.form}`)).toEqual([
      "stem:po",
      "case:nggom",
    ]);
    expect(r.analyses[0]!.morphemes[1]!.entryKey).toBe("p_top");
  });
});

describe("purity", () => {
  // The reuse claim rests entirely on this module having no framework or I/O dependency;
  // a doc comment saying so does not hold it. A consumer imports it as-is, and the moment
  // it reaches for the Supabase client it stops being reusable.
  it("imports nothing from vue, pinia, or supabase", () => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.filter((i) => i !== undefined && !i.startsWith("."))).toEqual([]);
  });
});
