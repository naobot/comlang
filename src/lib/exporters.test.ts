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
  corpus: [],
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
        { role: "onset", optional: true, class_symbol: "C", phoneme_ipa: null },
        { role: "nucleus", optional: false, class_symbol: "V", phoneme_ipa: ["a"] },
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
    {
      entry_key: "n_book",
      lemma: "miŋgwem",
      underlying: "/miŋɡɰem/",
      gloss: "book",
      word_class: "noun",
      notes: null,
    },
    {
      entry_key: null,
      lemma: "ʔo",
      underlying: null,
      gloss: "leg",
      word_class: "noun",
      notes: "Compound.",
    },
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
  graphemes: [],
  orthographyRules: [],
  morphology: null,
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

  // YAML 1.1 (PyYAML, which the harness uses) reads these as booleans. `entry_key: no`
  // and `entry_key: yes` are real lexicon keys, so they must round-trip as strings.
  it("quotes the YAML 1.1 boolean words", () => {
    for (const w of ["yes", "no", "on", "off", "Yes", "NO", "Off"]) {
      expect(yamlScalar(w)).toBe(`"${w}"`);
    }
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
    // The prime is not decoration: the nucleus names its own segments rather than taking
    // all of V, and an archive that wrote "(C)V" would describe a different grammar.
    expect(yaml).toContain("notation: (C)V′");
  });

  it("carries a restricted slot's own segments, and only that slot's", () => {
    const doc = parse(yaml) as {
      phonotactics: { syllable_templates: { slots: { phonemes?: string[] }[] }[] };
    };
    const slots = doc.phonotactics.syllable_templates[0]!.slots;
    expect(slots[0]?.phonemes).toBeUndefined();
    expect(slots[1]?.phonemes).toEqual(["a"]);
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

describe("orthography in the export", () => {
  const withOrthography = input({
    graphemes: [
      { phoneme_ipa: "p", grapheme: "p" },
      { phoneme_ipa: "ŋ", grapheme: "ng" },
    ],
    orthographyRules: [{ name: "ng-digraph", effect: 'write /ŋ/ as "ng"', examples: "" }],
  });

  it("drops the section entirely when there is nothing mapped or written", () => {
    expect(toGrammarYaml(input())).not.toContain("orthography:");
  });

  it("emits a block mapping of phoneme to grapheme", () => {
    const doc = parse(toGrammarYaml(withOrthography)) as {
      orthography: { graphemes: Record<string, string> };
    };
    expect(doc.orthography.graphemes).toEqual({ p: "p", ŋ: "ng" });
  });

  it("emits rules the same way grammar rules are emitted", () => {
    const doc = parse(toGrammarYaml(withOrthography)) as {
      orthography: { rules: Record<string, Record<string, string>> };
    };
    expect(doc.orthography.rules["ng-digraph"]?.effect).toBe('write /ŋ/ as "ng"');
  });

  it("is not folded into phonology, since upstream has no such key", () => {
    const yaml = toGrammarYaml(withOrthography);
    const phonologyBlock = yaml.slice(yaml.indexOf("phonology:"), yaml.indexOf("orthography:"));
    expect(phonologyBlock).not.toContain("graphemes");
  });
});

describe("underlying phonology in the export", () => {
  it("carries `underlying` alongside `lemma` when the entry has one", () => {
    const doc = parse(toGrammarYaml(input())) as {
      lexicon: { lemma: string; underlying?: string }[];
    };
    expect(doc.lexicon[0]).toMatchObject({ lemma: "miŋgwem", underlying: "/miŋɡɰem/" });
    expect(doc.lexicon[1]?.underlying).toBeUndefined();
  });
});

describe("morphology in the export", () => {
  const withMorphology = input({
    morphology: {
      version: 1,
      rules: {
        vowels: "aeiou",
        glides: "jw",
        digraphs: ["ng", "ts"],
        reduplication: { enabled: true },
        ngGemination: { enabled: true },
        harmony: { enabled: false },
        elision: { enabled: false },
        lowering: { enabled: false },
      },
      slots: {
        nominal: ["numeral", "classifier", "STEM", "plural", "case", "semanticParticle"],
        predicate: ["negation", "STEM", "tense", "force", "evidential", "conjunction"],
      },
      stems: [{ slotClass: "nominal", wordClass: ["noun", "pronoun"] }],
      affixes: [
        { role: "case", match: { entryKey: ["p_top", "p_nom"] }, position: "suffix" },
        { role: "tense", match: { entryKeyPrefix: "t_" }, position: "suffix" },
        { role: "negation", match: { wordClass: "negation" }, position: "prefix" },
      ],
    },
  });

  it("is absent when the project has no morphology document", () => {
    expect(toGrammarYaml(input())).not.toContain("morphology:");
  });

  it("emits the phonological-word slot order for both templates", () => {
    const doc = parse(toGrammarYaml(withMorphology)) as {
      morphology: { slots: { nominal: string[]; predicate: string[] } };
    };
    expect(doc.morphology.slots.nominal).toEqual([
      "numeral",
      "classifier",
      "STEM",
      "plural",
      "case",
      "semanticParticle",
    ]);
    expect(doc.morphology.slots.predicate[0]).toBe("negation");
  });

  it("records affix bindings by whichever match shape the document used", () => {
    const doc = parse(toGrammarYaml(withMorphology)) as {
      morphology: { affixes: Record<string, unknown>[] };
    };
    expect(doc.morphology.affixes).toEqual([
      { role: "case", position: "suffix", entry_key: ["p_top", "p_nom"] },
      { role: "tense", position: "suffix", entry_key_prefix: "t_" },
      { role: "negation", position: "prefix", word_class: ["negation"] },
    ]);
  });

  it("flattens the phonological toggles to enabled / disabled", () => {
    const yaml = toGrammarYaml(withMorphology);
    expect(yaml).toContain("reduplication: enabled");
    expect(yaml).toContain("ng_gemination: enabled");
    expect(yaml).toContain("harmony: disabled");
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
        lexicon: [
          {
            entry_key: "k",
            lemma: "a,b",
            underlying: null,
            gloss: null,
            word_class: null,
            notes: null,
          },
        ],
      }),
    );
    expect(csv).toBe('k,"a,b"\n');
  });
});

describe("toLexiconCsvFull", () => {
  it("has a header and every column, underlying phonology included", () => {
    const csv = toLexiconCsvFull(input());
    expect(csv.split("\n")[0]).toBe("key,lemma,underlying,pos,gloss,notes");
    expect(csv).toContain("n_book,miŋgwem,/miŋɡɰem/,noun,book,");
    // Absent underlying is an empty column, not a dropped one (this row also has no key).
    expect(csv).toContain(",ʔo,,noun,leg,Compound.");
  });

  it("escapes embedded quotes by doubling them", () => {
    const csv = toLexiconCsvFull(
      input({
        lexicon: [
          {
            entry_key: "k",
            lemma: "x",
            underlying: null,
            gloss: 'a "quoted" word',
            word_class: null,
            notes: null,
          },
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
    expect(lexicon[0]).toEqual({
      key: "n_book",
      lemma: "miŋgwem",
      underlying: "/miŋɡɰem/",
      pos: "noun",
      gloss: "book",
    });
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
            {
              entry_key: "k",
              lemma: "- dash",
              underlying: null,
              gloss: "null",
              word_class: null,
              notes: null,
            },
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
              underlying: null,
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
              underlying: null,
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
