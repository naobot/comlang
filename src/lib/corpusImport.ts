/**
 * Reading the corpus CSV back in.
 *
 * Pure, like `exporters.ts` and `lexiconImport.ts`: no `vue`, no `pinia`, no Supabase
 * client, and `corpusImport.test.ts` asserts there is no package import rather than
 * trusting this comment.
 *
 * One shape, `english,conlang`, which is what `toCorpusCsv` writes. The header row is
 * optional on the way in — a file typed by hand or pasted out of a spreadsheet may not
 * have one, and refusing it would be pedantry — so it is skipped when present and treated
 * as data when not.
 *
 * **There is no key column, and that is the whole character of this format.** Nothing in
 * a file can say "this is the row you already have, changed": the only candidate is the
 * text, and the text is what an edit changes. So an import adds and never updates, and
 * `buildCorpusImportPlan` exists to say so, row by row, before anything is written — the
 * lexicon's review dialog by the same logic, minus the machinery that logic has no use
 * for here. There are no conflicts (nothing to match a change against), no duplicated
 * keys (there is no key), and no deletes (a file that omits a row says nothing about it,
 * the same as the lexicon's own "absent" rows default to keep — except here that default
 * cannot be overridden, because there is nothing to identify the row *by*). What is left
 * to show is exactly the two things this format can actually tell you: which rows are
 * new, and which are already there.
 */

import { parseCsv } from "./csv";

export type CorpusRow = { english: string; conlang: string };

export type CorpusKind = "utterance" | "passage";

/**
 * A row with the line it came from, kept for the same reason `lexiconImport.ts`'s
 * `ParsedRow` keeps one: so the review dialog can say *which* line a row is, not just
 * list its text. The line is what a person sees in a spreadsheet, header counted.
 */
export type ParsedCorpusRow = CorpusRow & { line: number };

/**
 * Longer than this on either side and a row is treated as a passage on import.
 *
 * Roughly forty words — well past any single example sentence, and about where a pasted
 * paragraph starts. It catches the passage that has no line breaks in it, which a newline
 * test alone would file as an utterance.
 */
export const CORPUS_PASSAGE_MIN_LENGTH = 240;

/**
 * Which sub-view a row from a **file** should land in.
 *
 * Only ever applied to imported rows. Inside the app the kind is stored, because a passage
 * starts empty and is typed into — deriving it there would move the row out of the view it
 * is being written in. The CSV has no kind column, though, so something has to decide, and
 * a wrong guess here costs one button press.
 *
 * `import_corpus` (0025) applies the same two tests in SQL. The duplication is deliberate
 * and is the price of being able to state the split in the confirmation dialog *before*
 * the import runs; keep the two in step.
 */
export function inferKind(row: CorpusRow): CorpusKind {
  const sides = [row.english, row.conlang];
  if (sides.some((text) => text.includes("\n"))) return "passage";
  if (sides.some((text) => text.trim().length > CORPUS_PASSAGE_MIN_LENGTH)) return "passage";
  return "utterance";
}

export type ParsedCorpusImport = {
  rows: ParsedCorpusRow[];
  /** Whether a header row was found and skipped — it changes which line a problem cites. */
  header: boolean;
  /** Blocking: nothing is written while any of these stand. */
  problems: string[];
};

const isHeader = (row: string[]) =>
  row.length === 2 &&
  row[0]?.trim().toLowerCase() === "english" &&
  row[1]?.trim().toLowerCase() === "conlang";

export function parseCorpusCsv(text: string): ParsedCorpusImport {
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { rows: [], header: false, problems: ["That file has no rows."] };
  }

  const first = rows[0];
  const header = first !== undefined && isHeader(first);
  const body = header ? rows.slice(1) : rows;

  // Refused as a whole rather than per row: a file with the wrong number of columns is a
  // file someone exported from the wrong place, and importing the salvageable half of it
  // would be worse than saying so.
  const wide = body.filter((r) => r.length !== 2);
  if (wide.length > 0) {
    return {
      rows: [],
      header,
      problems: [
        `Expected two columns, English then conlang. ${wide.length} ` +
          `${wide.length === 1 ? "row has" : "rows have"} a different number — if a ` +
          "sentence contains a comma it needs to be quoted.",
      ],
    };
  }

  const problems: string[] = [];
  const out: ParsedCorpusRow[] = [];

  body.forEach((cells, i) => {
    // The line a person would see in a spreadsheet, header included.
    const line = header ? i + 2 : i + 1;
    const english = (cells[0] ?? "").trim();
    const conlang = (cells[1] ?? "").trim();

    // One side alone is fine — a sentence waiting to be translated is a real working
    // state, and the table allows it. Neither side is not a row.
    if (!english && !conlang) {
      problems.push(`Line ${line} is empty on both sides.`);
      return;
    }
    out.push({ line, english, conlang });
  });

  return { rows: out, header, problems };
}

/** A row this import would add, carrying the kind `inferKind` gives it. */
export type CorpusImportRow = ParsedCorpusRow & { kind: CorpusKind };

export type CorpusImportPlan = {
  /** New rows this file would add, in file order. No decision to make — nothing here can
   *  conflict with anything, since there is no key to conflict *on*. */
  additions: CorpusImportRow[];
  /** Rows already present verbatim, in the project or earlier in this same file, and so
   *  left alone. Also nothing to decide: the row is already there. */
  skipped: ParsedCorpusRow[];
};

/**
 * What applying this file would do, row by row, so a review dialog can show it before
 * anything is written — the counts `planCorpusImport` returns, unpacked into the rows
 * that make them up.
 *
 * A row already present **verbatim** on both sides is skipped, which is what makes
 * re-importing the same file a no-op rather than a doubling. Anything else is added —
 * including a row that differs only in a typo fix, because with no key there is no way to
 * tell a correction from a new example, and guessing wrong overwrites someone's sentence.
 *
 * Duplicates inside the file land in `skipped` after their first occurrence, so the two
 * lists partition the file exactly once each and any count drawn from them cannot drift
 * from what actually lands.
 */
export function buildCorpusImportPlan(
  rows: readonly ParsedCorpusRow[],
  existing: readonly CorpusRow[],
): CorpusImportPlan {
  // Joined on a character prose cannot contain, so "a b" + "c" and "a" + "b c" stay
  // distinct pairs rather than colliding on one key.
  const pairOf = (r: CorpusRow) => `${r.english.trim()}\u0000${r.conlang.trim()}`;
  const seen = new Set(existing.map(pairOf));
  const additions: CorpusImportRow[] = [];
  const skipped: ParsedCorpusRow[] = [];

  for (const row of rows) {
    const pair = pairOf(row);
    if (seen.has(pair)) {
      skipped.push(row);
      continue;
    }
    seen.add(pair);
    additions.push({ ...row, kind: inferKind(row) });
  }

  return { additions, skipped };
}

export type CorpusImportSummary = { add: number; skip: number; passages: number };

/**
 * The counts alone, for a caller with no use for the row list. Built on
 * `buildCorpusImportPlan` rather than its own pass over the rows, so the two cannot
 * silently disagree about what "added" and "skipped" mean.
 */
export function planCorpusImport(
  rows: readonly CorpusRow[],
  existing: readonly CorpusRow[],
): CorpusImportSummary {
  const plan = buildCorpusImportPlan(
    rows.map((row, i) => ({ ...row, line: i + 1 })),
    existing,
  );
  return {
    add: plan.additions.length,
    skip: plan.skipped.length,
    passages: plan.additions.filter((r) => r.kind === "passage").length,
  };
}
