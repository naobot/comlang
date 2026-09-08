import { describe, expect, it } from "vite-plus/test";

import { analyze, buildRecognizer } from "./morphology";
import source from "./morphologySpec.ts?raw";
import { type LexiconRow, type MorphologySpecDoc, assembleSpec, parseSpec } from "./morphologySpec";

const row = (over: Partial<LexiconRow> & { lemma: string }): LexiconRow => ({
  entry_key: null,
  gloss: null,
  word_class: null,
  ...over,
});

const validDoc = () => ({
  version: 1,
  rules: { vowels: "aeiou", glides: "jw", digraphs: ["ng"], reduplication: { enabled: true } },
  slots: {
    nominal: ["STEM", "case"],
    predicate: ["negation", "STEM", "tense"],
  },
  affixes: [
    { match: { entryKeyPrefix: "p_neg" }, role: "negation", position: "prefix" },
    { match: { wordClass: "case marker" }, role: "case", position: "suffix" },
    { match: { entryKey: ["t_prs", "t_pst"] }, role: "tense", position: "suffix" },
  ],
  stems: [
    { wordClass: ["noun", "pronoun"], slotClass: "nominal" },
    { wordClass: ["verb"], slotClass: "predicate" },
  ],
});

describe("parseSpec", () => {
  it("accepts a well-formed document", () => {
    const { doc, problems } = parseSpec(validDoc());
    expect(problems).toEqual([]);
    expect(doc?.slots.predicate).toEqual(["negation", "STEM", "tense"]);
    expect(doc?.affixes).toHaveLength(3);
  });

  it("rejects a non-object", () => {
    expect(parseSpec("nope")).toEqual({
      doc: null,
      problems: ["the plugin must be a JSON object"],
    });
    expect(parseSpec(null).doc).toBeNull();
  });

  it("reports a template without exactly one STEM", () => {
    const bad = { ...validDoc(), slots: { nominal: ["case"], predicate: ["STEM", "STEM"] } };
    const { problems } = parseSpec(bad);
    expect(problems.some((p) => p.includes("slots.nominal") && p.includes("STEM"))).toBe(true);
    expect(problems.some((p) => p.includes("slots.predicate") && p.includes("found 2"))).toBe(true);
  });

  it("reports an affix role that no template uses", () => {
    const bad = validDoc();
    bad.affixes.push({
      match: { wordClass: "evidential" },
      role: "evidential",
      position: "suffix",
    });
    const { problems } = parseSpec(bad);
    expect(problems.some((p) => p.includes('"evidential"') && p.includes("no slot template"))).toBe(
      true,
    );
  });

  it("reports every fault at once", () => {
    const bad = {
      slots: { nominal: ["STEM"], predicate: ["STEM"] },
      affixes: [
        { role: "x", position: "sideways" },
        { match: {}, role: "case", position: "suffix" },
      ],
      stems: [{ wordClass: 3, slotClass: "verbish" }],
    };
    const { problems } = parseSpec(bad);
    expect(problems.length).toBeGreaterThanOrEqual(4);
  });

  it("still returns a doc when only soft problems are present", () => {
    const bad = validDoc();
    bad.affixes.push({
      match: { wordClass: "evidential" },
      role: "evidential",
      position: "suffix",
    });
    const { doc } = parseSpec(bad);
    expect(doc).not.toBeNull();
  });
});

describe("assembleSpec", () => {
  const lexicon: LexiconRow[] = [
    row({ lemma: "buk", entry_key: "n_exterior", word_class: "noun", gloss: "exterior" }),
    row({ lemma: "bi", entry_key: "p_loc", word_class: "case marker", gloss: "locative" }),
    row({ lemma: "ha", entry_key: "p_neg1", word_class: "negation", gloss: "not" }),
    row({ lemma: "wu", entry_key: "t_prs", word_class: "tense marker", gloss: "present" }),
    row({ lemma: "ga", entry_key: "v_exist", word_class: "verb", gloss: "exist" }),
    row({ lemma: "  ", entry_key: "blank" }),
  ];

  it("citation-only when there is no document", () => {
    const { spec } = assembleSpec(lexicon, null);
    expect(spec.affixes).toEqual([]);
    expect(spec.stems.map((s) => s.lemma).sort()).toEqual(["bi", "buk", "ga", "ha", "wu"]);
    const rec = buildRecognizer(spec);
    expect(analyze("buk", rec).ok).toBe(true);
    expect(analyze("bukbi", rec)).toEqual({ ok: false, reason: "no known stem" });
  });

  it("classifies affixes and stems from a document", () => {
    const { doc } = parseSpec(validDoc());
    const { spec } = assembleSpec(lexicon, doc as MorphologySpecDoc);
    expect(spec.affixes.map((a) => `${a.role}:${a.form}`).sort()).toEqual([
      "case:bi",
      "negation:ha",
      "tense:wu",
    ]);
    const rec = buildRecognizer(spec);
    const r = analyze("bukbi", rec);
    if (!r.ok) throw new Error("expected ok");
    expect(r.analyses[0]!.morphemes.map((m) => `${m.role}:${m.form}`)).toEqual([
      "stem:buk",
      "case:bi",
    ]);
  });

  it("reports a word class no rule mentions", () => {
    const { doc } = parseSpec(validDoc());
    const { problems } = assembleSpec(
      [...lexicon, row({ lemma: "wob", word_class: "ideophone" })],
      doc as MorphologySpecDoc,
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("ideophone");
  });
});

describe("purity", () => {
  it("imports nothing from vue, pinia, or supabase", () => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.filter((i) => i !== undefined && !i.startsWith("."))).toEqual([]);
  });
});
