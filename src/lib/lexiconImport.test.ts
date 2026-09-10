import { describe, expect, it } from "vite-plus/test";

// `?raw` rather than node:fs — this file is type-checked by the DOM tsconfig, which
// deliberately has no Node types, and Vite resolves the raw import in both.
import source from "./lexiconImport.ts?raw";

import { type ExportInput, toLexiconCsv, toLexiconCsvFull } from "./exporters";
import { deriveFromKey, parseLexiconCsv } from "./lexiconImport";

describe("parseLexiconCsv", () => {
  it("reads the full export, header and all", () => {
    const parsed = parseLexiconCsv(
      "key,lemma,underlying,pos,gloss,notes\nn_book,miŋgwem,/miŋɡɰem/,noun,book,\n",
    );
    expect(parsed.problems).toEqual([]);
    expect(parsed.fields).toEqual([
      "lemma",
      "underlying_phonology",
      "gloss",
      "word_class",
      "notes",
    ]);
    expect(parsed.rows).toEqual([
      {
        line: 2,
        entry_key: "n_book",
        lemma: "miŋgwem",
        underlying_phonology: "/miŋɡɰem/",
        gloss: "book",
        word_class: "noun",
        notes: "",
      },
    ]);
  });

  // Files written before `underlying` (0033) was a column still import — their `pos`,
  // `gloss` and `notes` sit one column to the left.
  it("reads the older five-column full export without an underlying column", () => {
    const parsed = parseLexiconCsv("key,lemma,pos,gloss,notes\nn_book,miŋgwem,noun,book,\n");
    expect(parsed.problems).toEqual([]);
    expect(parsed.fields).toEqual(["lemma", "gloss", "word_class", "notes"]);
    expect(parsed.rows).toEqual([
      {
        line: 2,
        entry_key: "n_book",
        lemma: "miŋgwem",
        underlying_phonology: "",
        gloss: "book",
        word_class: "noun",
        notes: "",
      },
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

  // The two-column file carries no meaning or word class, but `n_book` names both. This
  // only fills what the file left out — see the round-trip tests for a file that keeps its
  // own blank cells.
  it("fills meaning and word class from the key on a two-column import", () => {
    const parsed = parseLexiconCsv("n_book,miŋgwem\na_black,ljaŋ\ntop_case,zwem\nʔo,ʔo\n", {
      n: "noun",
      a: "adjective",
      v: "verb",
    });
    expect(parsed.rows.map((r) => [r.entry_key, r.word_class, r.gloss])).toEqual([
      ["n_book", "noun", "book"],
      ["a_black", "adjective", "black"],
      // Prefix is not one the project declared, so nothing is guessed.
      ["top_case", "", ""],
      // No underscore to split on.
      ["ʔo", "", ""],
    ]);
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

  // This used to refuse the whole file — and every good row in it — over a question with
  // an answer. `buildMergePlan` groups the two and the review dialog asks which wins.
  it("keeps both rows when two claim the same key", () => {
    const parsed = parseLexiconCsv("key,lemma,pos,gloss,notes\nk,a,,,\nk,b,,,\n");
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows.map((r) => [r.line, r.lemma])).toEqual([
      [2, "a"],
      [3, "b"],
    ]);
  });

  it("allows several rows with no key at all", () => {
    const parsed = parseLexiconCsv("key,lemma,pos,gloss,notes\n,a,,,\n,b,,,\n");
    expect(parsed.problems).toEqual([]);
    expect(parsed.rows).toHaveLength(2);
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
    graphemes: [],
    orthographyRules: [],
    morphology: null,
    lexicon: [
      {
        entry_key: "v_exist",
        lemma: "ga",
        underlying: "/ɡa/",
        gloss: "exist, there is",
        word_class: "predicate",
        notes: null,
      },
      {
        entry_key: "n_neck",
        lemma: "pamŋwathoŋ",
        underlying: null,
        gloss: "neck",
        word_class: "noun",
        notes: 'Compound of pam + ŋwathoŋ. Says "frozen".',
      },
      {
        entry_key: null,
        lemma: "ʔo",
        underlying: null,
        gloss: "leg",
        word_class: "noun",
        notes: null,
      },
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
        line: 2,
        entry_key: "v_exist",
        lemma: "ga",
        underlying_phonology: "/ɡa/",
        gloss: "exist, there is",
        word_class: "predicate",
        notes: "",
      },
      {
        line: 3,
        entry_key: "n_neck",
        lemma: "pamŋwathoŋ",
        underlying_phonology: "",
        gloss: "neck",
        word_class: "noun",
        notes: 'Compound of pam + ŋwathoŋ. Says "frozen".',
      },
      {
        line: 4,
        entry_key: null,
        lemma: "ʔo",
        underlying_phonology: "",
        gloss: "leg",
        word_class: "noun",
        notes: "",
      },
    ]);
  });

  // A full file's own blank cells are kept blank: `n_neck` and `ʔo` carry no underlying
  // phonology and no meaning is invented for them from the key.
  it("does not fill from the key when the file carries the column", () => {
    const csv = "key,lemma,underlying,pos,gloss,notes\nn_book,miŋgwem,,,,\n";
    const parsed = parseLexiconCsv(csv);
    expect(parsed.rows[0]).toMatchObject({ gloss: "", word_class: "", underlying_phonology: "" });
  });

  /**
   * Worth knowing rather than fixing: the two-column format cannot represent "no key", so
   * `toLexiconCsv` writes the lemma in the key column. Re-importing it therefore gives a
   * previously unkeyed entry a key, and creates a second row rather than matching the
   * first. That is inherent to the format being lossy, which is why the review dialog
   * lists what is about to be added before anything is written.
   */
  it("reads back the two-column export, which substitutes the lemma for a missing key", () => {
    const parsed = parseLexiconCsv(toLexiconCsv(input()));
    expect(parsed.problems).toEqual([]);
    expect(parsed.fields).toEqual(["lemma"]);
    expect(parsed.rows.map((r) => r.entry_key)).toEqual(["v_exist", "n_neck", "ʔo"]);
  });
});

describe("deriveFromKey", () => {
  /** The prefixes a project might declare; nothing here is built in. */
  const KEY_POS = { n: "noun", a: "adjective", v: "verb" };

  it("maps the part-of-speech prefix and reads the rest as the gloss", () => {
    expect(deriveFromKey("n_book", KEY_POS)).toEqual({ word_class: "noun", gloss: "book" });
    expect(deriveFromKey("a_black", KEY_POS)).toEqual({ word_class: "adjective", gloss: "black" });
    expect(deriveFromKey("v_become", KEY_POS)).toEqual({ word_class: "verb", gloss: "become" });
    expect(deriveFromKey("n_student_a", KEY_POS)).toEqual({
      word_class: "noun",
      gloss: "student a",
    });
  });

  it("guesses nothing from a prefix that is not a part of speech, or a key with no split", () => {
    expect(deriveFromKey("top_case", KEY_POS)).toEqual({ word_class: "", gloss: "" });
    expect(deriveFromKey("num_3", KEY_POS)).toEqual({ word_class: "", gloss: "" });
    expect(deriveFromKey("interrog", KEY_POS)).toEqual({ word_class: "", gloss: "" });
    expect(deriveFromKey("_leading", KEY_POS)).toEqual({ word_class: "", gloss: "" });
    expect(deriveFromKey("", KEY_POS)).toEqual({ word_class: "", gloss: "" });
  });

  /**
   * The convention belongs to the project, not to this module. A project that declares
   * none gets no guessing at all, rather than inheriting another conlang's prefixes.
   */
  it("guesses nothing at all when the project declares no prefixes", () => {
    expect(deriveFromKey("n_book", {})).toEqual({ word_class: "", gloss: "" });
    expect(parseLexiconCsv("n_book,miŋgwem\n").rows[0]).toMatchObject({
      entry_key: "n_book",
      gloss: "",
      word_class: "",
    });
  });

  it("honours the prefixes the caller passes in", () => {
    expect(parseLexiconCsv("n_book,miŋgwem\n", KEY_POS).rows[0]).toMatchObject({
      gloss: "book",
      word_class: "noun",
    });
  });
});

describe("purity", () => {
  it("imports nothing from vue, pinia, or supabase", () => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.filter((i) => i !== undefined && !i.startsWith("."))).toEqual([]);
  });
});
