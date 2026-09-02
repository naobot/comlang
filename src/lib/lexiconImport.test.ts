import { describe, expect, it } from "vite-plus/test";

// `?raw` rather than node:fs — this file is type-checked by the DOM tsconfig, which
// deliberately has no Node types, and Vite resolves the raw import in both.
import source from "./lexiconImport.ts?raw";

import { type ExportInput, toLexiconCsv, toLexiconCsvFull } from "./exporters";
import { parseLexiconCsv, planImport } from "./lexiconImport";

describe("parseLexiconCsv", () => {
  it("reads the full export, header and all", () => {
    const parsed = parseLexiconCsv("key,lemma,pos,gloss,notes\nn_book,miŋgwem,noun,book,\n");
    expect(parsed.problems).toEqual([]);
    expect(parsed.fields).toEqual(["lemma", "gloss", "word_class", "notes"]);
    expect(parsed.rows).toEqual([
      { entry_key: "n_book", lemma: "miŋgwem", gloss: "book", word_class: "noun", notes: "" },
    ]);
  });

  /**
   * The two-column export has no gloss column at all. Reporting `fields: ["lemma"]` is what
   * stops the write treating an absent column as an instruction to clear it — otherwise
   * importing the file the app itself produces would empty every gloss in the project.
   */
  it("reads the headerless two-column export without claiming the missing columns", () => {
    const parsed = parseLexiconCsv("n_book,miŋgwem\nʔo,ʔo\n");
    expect(parsed.problems).toEqual([]);
    expect(parsed.fields).toEqual(["lemma"]);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0]?.lemma).toBe("miŋgwem");
  });

  it("refuses columns it does not recognise", () => {
    const parsed = parseLexiconCsv("one,two,three\n");
    expect(parsed.rows).toEqual([]);
    expect(parsed.problems[0]).toContain("Unrecognised columns");
  });

  it("refuses an empty file", () => {
    expect(parseLexiconCsv("").problems).toEqual(["That file has no rows."]);
  });

  it("names the spreadsheet line of a row with no lemma", () => {
    const parsed = parseLexiconCsv("key,lemma,pos,gloss,notes\nn_book,,noun,book,\n");
    expect(parsed.problems).toEqual(["Line 2 has no lemma."]);
  });

  // Which row won would otherwise depend on file order.
  it("refuses two rows claiming the same key", () => {
    const parsed = parseLexiconCsv("key,lemma,pos,gloss,notes\nk,a,,,\nk,b,,,\n");
    expect(parsed.problems).toEqual(["Line 3 repeats the key “k” from line 2."]);
  });

  it("allows several rows with no key at all", () => {
    const parsed = parseLexiconCsv("key,lemma,pos,gloss,notes\n,a,,,\n,b,,,\n");
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
  });
});

describe("planImport", () => {
  const existing = [{ entry_key: "n_book" }, { entry_key: null }];

  it("updates a matching key and creates a new one", () => {
    const plan = planImport(
      [
        { entry_key: "n_book", lemma: "x", gloss: "", word_class: "", notes: "" },
        { entry_key: "n_pen", lemma: "y", gloss: "", word_class: "", notes: "" },
      ],
      existing,
    );
    expect(plan).toEqual({ create: 1, update: 1, unkeyed: 0 });
  });

  /**
   * Never matched on lemma: `gwan` is both "meaning" (noun) and "become" (verb) in the real
   * data, which is why lexicon_entries has no unique constraint on lemma. Matching on it
   * would merge two different words.
   */
  it("counts an unkeyed row as new even when its lemma already exists", () => {
    const plan = planImport(
      [{ entry_key: null, lemma: "gwan", gloss: "", word_class: "", notes: "" }],
      [{ entry_key: "v_become" }],
    );
    expect(plan).toEqual({ create: 1, update: 0, unkeyed: 1 });
  });
});

describe("round trip", () => {
  const input = (): ExportInput => ({
    corpus: [],
    projectName: "xenic",
    generatedAt: new Date("2026-09-02T00:00:00Z"),
    phonemes: [],
    classes: [],
    templates: [],
    constraints: [],
    wordClasses: [],
    categories: [],
    rules: [],
    lexicon: [
      {
        entry_key: "v_exist",
        lemma: "ga",
        gloss: "exist, there is",
        word_class: "predicate",
        notes: null,
      },
      {
        entry_key: "n_neck",
        lemma: "pamŋwathoŋ",
        gloss: "neck",
        word_class: "noun",
        notes: 'Compound of pam + ŋwathoŋ. Says "frozen".',
      },
      { entry_key: null, lemma: "ʔo", gloss: "leg", word_class: "noun", notes: null },
    ],
  });

  // The real check: what the app writes, the app reads back unchanged. The comma in
  // "exist, there is" is the case that broke the YAML exporter, and the quotes and the
  // glottal stop are the ones that would break a naive split(",").
  it("reads back exactly what toLexiconCsvFull wrote", () => {
    const parsed = parseLexiconCsv(toLexiconCsvFull(input()));
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toEqual([
      {
        entry_key: "v_exist",
        lemma: "ga",
        gloss: "exist, there is",
        word_class: "predicate",
        notes: "",
      },
      {
        entry_key: "n_neck",
        lemma: "pamŋwathoŋ",
        gloss: "neck",
        word_class: "noun",
        notes: 'Compound of pam + ŋwathoŋ. Says "frozen".',
      },
      { entry_key: null, lemma: "ʔo", gloss: "leg", word_class: "noun", notes: "" },
    ]);
  });

  /**
   * Worth knowing rather than fixing: the two-column format cannot represent "no key", so
   * `toLexiconCsv` writes the lemma in the key column. Re-importing it therefore gives a
   * previously unkeyed entry a key, and creates a second row rather than matching the
   * first. That is inherent to the format being lossy, which is why the confirmation
   * shows the create/update split before anything is written.
   */
  it("reads back the two-column export, which substitutes the lemma for a missing key", () => {
    const parsed = parseLexiconCsv(toLexiconCsv(input()));
    expect(parsed.problems).toEqual([]);
    expect(parsed.fields).toEqual(["lemma"]);
    expect(parsed.rows.map((r) => r.entry_key)).toEqual(["v_exist", "n_neck", "ʔo"]);
  });
});

describe("purity", () => {
  it("imports nothing from vue, pinia, or supabase", () => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.filter((i) => i !== undefined && !i.startsWith("."))).toEqual([]);
  });
});
