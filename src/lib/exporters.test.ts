import { describe, expect, it } from "vite-plus/test";
// A devDependency, and test-only: the exporter must not pull a YAML library into the
// browser bundle, which is exactly why hand-emitted output needs a parser to check it.
import { parse } from "yaml";

import {
  type ExportInput,
  slugify,
  toGrammarYaml,
  toLexiconCsv,
  toLexiconCsvFull,
  yamlScalar,
} from "./exporters";

const input = (over: Partial<ExportInput> = {}): ExportInput => ({
  projectName: "xenic",
  generatedAt: new Date("2026-09-01T14:00:00Z"),
  phonemes: [
    { ipa: "p", kind: "consonant" },
    { ipa: "ŋ", kind: "consonant" },
    { ipa: "a", kind: "vowel" },
  ],
  classes: [{ symbol: "C", label: "consonant", phoneme_ipa: ["p", "ŋ"] }],
  templates: [
    {
      name: "basic",
      weight: 1,
      slots: [
        { role: "onset", optional: true, class_symbol: "C" },
        { role: "nucleus", optional: false, class_symbol: "V" },
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
    },
  ],
  lexicon: [
    { entry_key: "n_book", lemma: "miŋgwem", gloss: "book", word_class: "noun", notes: null },
    { entry_key: null, lemma: "ʔo", gloss: "leg", word_class: "noun", notes: "Compound." },
  ],
  wordClasses: [
    { name: "noun", kind: "open", description: "", categories: ["number"] },
    { name: "case marker", kind: "closed", description: "Takes the case slot.", categories: [] },
  ],
  categories: [
    {
      name: "number",
      description: "",
      values: [
        { value: "singular", notes: "" },
        { value: "paucal", notes: "reduplication without numeral+counter" },
      ],
    },
  ],
  rules: [
    {
      name: "vowel_harmony",
      effect: "non-low vowels agree in [front]",
      environment: "",
      examples: "bi + -swom -> biswem",
      notes: "",
    },
  ],
  ...over,
});

describe("yamlScalar", () => {
  it("leaves ordinary words and IPA bare", () => {
    expect(yamlScalar("miŋgwem")).toBe("miŋgwem");
    expect(yamlScalar("noun")).toBe("noun");
  });

  // The source document quotes these too. A leading glottal stop reads as punctuation to
  // some parsers, which would silently corrupt a lemma.
  it("quotes a leading glottal stop", () => {
    expect(yamlScalar("ʔo")).toBe('"ʔo"');
  });

  it("quotes values YAML would otherwise coerce", () => {
    expect(yamlScalar("true")).toBe('"true"');
    expect(yamlScalar("null")).toBe('"null"');
    expect(yamlScalar("")).toBe('""');
    expect(yamlScalar("- dash")).toBe('"- dash"');
  });

  it("escapes a newline, which a plain scalar cannot carry", () => {
    expect(yamlScalar("a\nb")).toBe('"a\\nb"');
  });
});

describe("toGrammarYaml", () => {
  const yaml = toGrammarYaml(input());

  it("splits the inventory by kind", () => {
    expect(yaml).toContain("consonants: [p, ŋ]");
    expect(yaml).toContain("vowels: [a]");
  });

  it("renders the template notation alongside its slots", () => {
    expect(yaml).toContain("notation: (C)V");
  });

  it("emits rule_order as an explicit list, since order is the pipeline", () => {
    expect(yaml).toContain("rule_order: [vowel_harmony]");
  });

  it("omits empty rule fields rather than writing blanks", () => {
    expect(yaml).toContain("effect: non-low vowels agree in [front]");
    expect(yaml).not.toContain("environment:");
  });

  it("quotes a lemma that would otherwise be misread", () => {
    expect(yaml).toContain('lemma: "ʔo"');
  });

  it("says what it does not contain, rather than emitting empty sections", () => {
    expect(yaml).toContain("Absent by");
    expect(yaml).not.toContain("closed_class:");
    expect(yaml).not.toContain("morpheme_order:");
  });

  it("drops sections with no data instead of writing empty keys", () => {
    const bare = toGrammarYaml(
      input({
        templates: [],
        constraints: [],
        rules: [],
        lexicon: [],
        wordClasses: [],
        categories: [],
      }),
    );
    expect(bare).not.toContain("phonotactics:");
    expect(bare).not.toContain("lexicon:");
    expect(bare).not.toContain("word_classes:");
    expect(bare).toContain("phonology:");
  });

  it("never leaves a triple blank line", () => {
    expect(yaml).not.toMatch(/\n\n\n/);
  });
});

describe("word classes in the export", () => {
  const yaml = toGrammarYaml(input());

  it("emits each class with its kind and what it inflects for", () => {
    const doc = parse(yaml) as { word_classes: Record<string, Record<string, unknown>> };
    expect(doc.word_classes.noun).toEqual({ kind: "open", inflects_for: ["number"] });
    expect(doc.word_classes["case marker"]).toEqual({
      kind: "closed",
      description: "Takes the case slot.",
    });
  });

  // Shaped like the source's own `categories:` block, so a consumer reads it without a
  // special case.
  it("emits categories the way grammar.yaml does", () => {
    const doc = parse(yaml) as { categories: Record<string, { values: string[] }> };
    expect(doc.categories.number?.values).toEqual(["singular", "paucal"]);
  });

  it("keeps a value note as a comment rather than inventing a key for it", () => {
    expect(yaml).toContain("# paucal: reduplication without numeral+counter");
    const doc = parse(yaml) as { categories: Record<string, Record<string, unknown>> };
    expect(Object.keys(doc.categories.number ?? {})).toEqual(["values"]);
  });
});

describe("toLexiconCsv", () => {
  it("is two headerless columns, matching the co-designer's files", () => {
    expect(toLexiconCsv(input())).toBe("n_book,miŋgwem\nʔo,ʔo\n");
  });

  // A blank first column would break a naive reader of the original format.
  it("falls back to the lemma when an entry has no key", () => {
    expect(toLexiconCsv(input())).toContain("ʔo,ʔo");
  });

  it("quotes a field containing a comma", () => {
    const csv = toLexiconCsv(
      input({
        lexicon: [{ entry_key: "k", lemma: "a,b", gloss: null, word_class: null, notes: null }],
      }),
    );
    expect(csv).toBe('k,"a,b"\n');
  });
});

describe("toLexiconCsvFull", () => {
  it("has a header and every column", () => {
    const csv = toLexiconCsvFull(input());
    expect(csv.split("\n")[0]).toBe("key,lemma,pos,gloss,notes");
    expect(csv).toContain("n_book,miŋgwem,noun,book,");
  });

  it("escapes embedded quotes by doubling them", () => {
    const csv = toLexiconCsvFull(
      input({
        lexicon: [
          { entry_key: "k", lemma: "x", gloss: 'a "quoted" word', word_class: null, notes: null },
        ],
      }),
    );
    expect(csv).toContain('"a ""quoted"" word"');
  });
});

describe("slugify", () => {
  it("makes a filename-safe stem", () => {
    expect(slugify("Xenic Language!")).toBe("xenic-language");
  });

  it("falls back rather than producing an empty filename", () => {
    expect(slugify("ŋŋŋ")).toBe("conlang");
    expect(slugify("")).toBe("conlang");
  });
});

describe("the emitted YAML actually parses", () => {
  // The real check. Asserting on substrings tests the formatting choices; parsing tests
  // whether the document is valid at all — which is the risk of hand-emitting YAML.
  it("round-trips through a parser with its values intact", () => {
    const doc = parse(toGrammarYaml(input())) as Record<string, unknown>;
    const phonology = doc.phonology as Record<string, unknown>;

    expect(doc.rule_order).toEqual(["vowel_harmony"]);
    expect(phonology.consonants).toEqual(["p", "ŋ"]);
    expect(phonology.vowels).toEqual(["a"]);
    expect((doc.rules as Record<string, Record<string, string>>).vowel_harmony?.effect).toBe(
      "non-low vowels agree in [front]",
    );

    const lexicon = doc.lexicon as { key?: string; lemma: string; pos?: string }[];
    expect(lexicon).toHaveLength(2);
    // The glottal stop survives the trip, which is the whole reason it is quoted.
    expect(lexicon[1]?.lemma).toBe("ʔo");
    expect(lexicon[0]).toEqual({ key: "n_book", lemma: "miŋgwem", pos: "noun", gloss: "book" });
  });

  it("survives values that would otherwise break the document", () => {
    const doc = parse(
      toGrammarYaml(
        input({
          projectName: "true",
          rules: [
            {
              name: "odd",
              effect: 'has: a colon, a # hash and "quotes"',
              environment: "line one\nline two",
              examples: "",
              notes: "",
            },
          ],
          lexicon: [
            { entry_key: "k", lemma: "- dash", gloss: "null", word_class: null, notes: null },
          ],
        }),
      ),
    ) as Record<string, Record<string, Record<string, string>>>;

    expect((doc.meta as unknown as Record<string, string>).name).toBe("true");
    expect(doc.rules?.odd?.effect).toBe('has: a colon, a # hash and "quotes"');
    expect(doc.rules?.odd?.environment).toBe("line one\nline two");
    expect((doc.lexicon as unknown as { lemma: string }[])[0]?.lemma).toBe("- dash");
  });

  it("parses an empty project without inventing sections", () => {
    const doc = parse(
      toGrammarYaml(
        input({
          phonemes: [],
          classes: [],
          templates: [],
          constraints: [],
          lexicon: [],
          rules: [],
          wordClasses: [],
          categories: [],
        }),
      ),
    ) as Record<string, unknown>;
    expect(doc.phonotactics).toBeUndefined();
    expect(doc.lexicon).toBeUndefined();
    expect((doc.phonology as Record<string, unknown>).consonants).toEqual([]);
  });
});

describe("flow context", () => {
  // Caught by exporting the real project, not by the fixtures above: a lexicon entry is a
  // flow mapping, and "exist, there is" is a real gloss. Emitted bare it parses *without
  // error* into a mapping with a spurious `there is:` key — silent corruption.
  it("quotes a gloss containing a comma", () => {
    const doc = parse(
      toGrammarYaml(
        input({
          lexicon: [
            {
              entry_key: "v_exist",
              lemma: "ga",
              gloss: "exist, there is",
              word_class: "predicate",
              notes: null,
            },
          ],
        }),
      ),
    ) as { lexicon: Record<string, string>[] };

    expect(doc.lexicon).toHaveLength(1);
    expect(doc.lexicon[0]?.gloss).toBe("exist, there is");
    // The corruption this guards against would show up as an extra key, not a bad value.
    expect(Object.keys(doc.lexicon[0] ?? {})).toEqual(["key", "lemma", "pos", "gloss"]);
  });

  it("quotes brackets and braces in flow, which would also break the structure", () => {
    const doc = parse(
      toGrammarYaml(
        input({
          lexicon: [
            {
              entry_key: "k",
              lemma: "x",
              gloss: "a [bracket] and {brace}",
              word_class: null,
              notes: null,
            },
          ],
        }),
      ),
    ) as { lexicon: Record<string, string>[] };
    expect(doc.lexicon[0]?.gloss).toBe("a [bracket] and {brace}");
  });

  it("still leaves a comma alone in block context, where it is just text", () => {
    const yaml = toGrammarYaml(
      input({
        rules: [{ name: "r", effect: "one, two, three", environment: "", examples: "", notes: "" }],
      }),
    );
    expect(yaml).toContain("effect: one, two, three");
    const doc = parse(yaml) as { rules: Record<string, Record<string, string>> };
    expect(doc.rules.r?.effect).toBe("one, two, three");
  });
});
