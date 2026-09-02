import { describe, expect, it } from "vite-plus/test";

// `?raw` rather than node:fs — this file is type-checked by the DOM tsconfig, which
// deliberately has no Node types, and Vite resolves the raw import in both.
import source from "./corpusImport.ts?raw";

import {
  CORPUS_PASSAGE_MIN_LENGTH,
  inferKind,
  parseCorpusCsv,
  planCorpusImport,
} from "./corpusImport";
import { type ExportInput, toCorpusCsv } from "./exporters";

const parse = parseCorpusCsv;

describe("parseCorpusCsv", () => {
  it("skips the header the exporter writes", () => {
    const result = parse("english,conlang\nI see you,mi kan yu\n");
    expect(result.header).toBe(true);
    expect(result.rows).toEqual([{ english: "I see you", conlang: "mi kan yu" }]);
    expect(result.problems).toEqual([]);
  });

  // A file typed by hand or pasted out of a spreadsheet may not have one, and refusing it
  // would be pedantry.
  it("accepts a headerless file", () => {
    const result = parse("I see you,mi kan yu\n");
    expect(result.header).toBe(false);
    expect(result.rows).toHaveLength(1);
  });

  it("only treats a first row as a header when both cells match", () => {
    const result = parse("english,mi kan yu\n");
    expect(result.header).toBe(false);
    expect(result.rows[0]?.english).toBe("english");
  });

  // The comma is the separator and both columns are prose, so this is the mistake people
  // will actually make.
  it("keeps a comma inside a quoted sentence", () => {
    const result = parse('english,conlang\n"Yes, I see you",mi kan yu\n');
    expect(result.rows).toEqual([{ english: "Yes, I see you", conlang: "mi kan yu" }]);
  });

  it("refuses a file whose rows are not two columns, and says why", () => {
    const result = parse("english,conlang\nYes, I see you,mi kan yu\n");
    expect(result.rows).toEqual([]);
    expect(result.problems[0]).toContain("quoted");
  });

  // One side alone is a real working state — a sentence waiting to be translated, or a
  // translation waiting for a sentence — and the table allows it too.
  it("accepts a row with only one side filled in", () => {
    const result = parse("english,conlang\nI see you,\n,mi kan yu\n");
    expect(result.rows).toEqual([
      { english: "I see you", conlang: "" },
      { english: "", conlang: "mi kan yu" },
    ]);
    expect(result.problems).toEqual([]);
  });

  it("reports an empty file rather than importing nothing silently", () => {
    expect(parse("").problems).toEqual(["That file has no rows."]);
  });
});

describe("planCorpusImport", () => {
  const rows = [
    { english: "I see you", conlang: "mi kan yu" },
    { english: "I see the book", conlang: "mi kan miŋgwem" },
  ];

  it("adds what is not already there", () => {
    expect(planCorpusImport(rows, [])).toEqual({ add: 2, skip: 0, passages: 0 });
  });

  // The property that makes re-importing your own export safe.
  it("skips a row already present verbatim", () => {
    expect(planCorpusImport(rows, rows)).toEqual({ add: 0, skip: 2, passages: 0 });
  });

  // Inherent to a keyless format: nothing in the file can say "the row you have, changed".
  it("treats a corrected sentence as a new row rather than an update", () => {
    const fixed = [{ english: "I see you", conlang: "mi kan yu." }];
    expect(planCorpusImport(fixed, rows)).toEqual({ add: 1, skip: 0, passages: 0 });
  });

  it("counts a duplicate inside the file once", () => {
    expect(planCorpusImport([...rows, rows[0]!], [])).toEqual({ add: 2, skip: 1, passages: 0 });
  });

  // "a b" + "c" and "a" + "b c" are different examples and must not collide on one key.
  it("does not conflate rows that differ only in where the split falls", () => {
    const a = [{ english: "a b", conlang: "c" }];
    const b = [{ english: "a", conlang: "b c" }];
    expect(planCorpusImport(b, a)).toEqual({ add: 1, skip: 0, passages: 0 });
  });
});

describe("the corpus CSV round-trip", () => {
  const input = {
    projectName: "xenic",
    generatedAt: new Date(0),
    phonemes: [],
    classes: [],
    templates: [],
    constraints: [],
    lexicon: [],
    rules: [],
    wordClasses: [],
    categories: [],
    corpus: [
      { english: "Yes, I see you", conlang: "mi kan yu" },
      { english: 'She said "no"', conlang: "ta se ŋat" },
      { english: "one line\nand another", conlang: "gwan" },
    ],
  } satisfies ExportInput;

  // Through the real parser rather than asserting on substrings: a quoting bug that
  // produces a plausible-looking string is exactly what a substring assertion misses.
  it("survives being exported and read back", () => {
    const parsed = parse(toCorpusCsv(input));
    expect(parsed.header).toBe(true);
    expect(parsed.rows).toEqual(input.corpus);
  });

  it("adds nothing when its own export is re-imported", () => {
    const parsed = parse(toCorpusCsv(input));
    expect(planCorpusImport(parsed.rows, input.corpus)).toEqual({ add: 0, skip: 3, passages: 0 });
  });
});

describe("inferKind", () => {
  // The reliable signal: a conversation or a stanza has line breaks, an example does not.
  it("calls anything with a line break a passage", () => {
    expect(inferKind({ english: "Hello.\nGoodbye.", conlang: "" })).toBe("passage");
    expect(inferKind({ english: "", conlang: "mi kan\nyu kan" })).toBe("passage");
  });

  it("calls a single sentence an utterance", () => {
    expect(inferKind({ english: "I see you.", conlang: "mi kan yu" })).toBe("utterance");
  });

  // The paragraph with no line break in it, which the newline test alone would miss.
  it("calls a long unbroken text a passage", () => {
    const long = "word ".repeat(CORPUS_PASSAGE_MIN_LENGTH);
    expect(inferKind({ english: long, conlang: "" })).toBe("passage");
  });

  it("judges each side, since one may be translated and the other not yet", () => {
    expect(inferKind({ english: "", conlang: "a\nb" })).toBe("passage");
  });
});

describe("the import plan's split", () => {
  it("counts how many added rows would open as passages", () => {
    const plan = planCorpusImport(
      [
        { english: "one line", conlang: "x" },
        { english: "two\nlines", conlang: "y" },
      ],
      [],
    );
    expect(plan).toEqual({ add: 2, skip: 0, passages: 1 });
  });

  // A skipped row is already stored; it is not landing anywhere, so it cannot be counted
  // in the split without the numbers ceasing to add up.
  it("does not count a skipped row", () => {
    const existing = [{ english: "two\nlines", conlang: "y" }];
    expect(planCorpusImport(existing, existing)).toEqual({ add: 0, skip: 1, passages: 0 });
  });
});

// The point of the module being pure: a future batch job or a round-trip test imports it
// unchanged. Asserted rather than left to a comment, and checked to actually fail when
// violated.
it("imports nothing outside this directory", () => {
  const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  expect(imports.filter((i) => i !== undefined && !i.startsWith("."))).toEqual([]);
});
