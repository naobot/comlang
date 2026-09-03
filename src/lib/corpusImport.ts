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
 * **The English sentence is the key**, matched exactly the way `lexiconMerge.ts` matches
 * on `entry_key` — see that module (`corpusMerge.ts` here) for what that means for a
 * conflict, a duplicate, or a row a file doesn't carry. This module only parses; it does
 * not decide what an import does with what it parses.
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
 * Which sub-view a **new** row should land in.
 *
 * Only ever applied to a row an import is about to insert — a row matched to something
 * already stored keeps that row's own kind, unchanged. The CSV has no kind column, so
 * something has to decide for a brand new row, and a wrong guess here costs one button
 * press.
 *
 * `import_corpus` applies the same two tests in SQL, for the same new-row-only rows. The
 * duplication is deliberate and is the price of being able to show the split in the review
 * dialog *before* the import runs; keep the two in step.
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
