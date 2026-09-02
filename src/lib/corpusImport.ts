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
 * `planCorpusImport` exists to say so in numbers before anything is written.
 */

import { parseCsv } from "./csv";

export type CorpusRow = { english: string; conlang: string };

export type ParsedCorpusImport = {
  rows: CorpusRow[];
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
  const out: CorpusRow[] = [];

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
    out.push({ english, conlang });
  });

  return { rows: out, header, problems };
}

export type CorpusImportPlan = { add: number; skip: number };

/**
 * What applying this file would do, given what is already stored.
 *
 * A row already present **verbatim** on both sides is skipped, which is what makes
 * re-importing the same file a no-op rather than a doubling. Anything else is added —
 * including a row that differs only in a typo fix, because with no key there is no way to
 * tell a correction from a new example, and guessing wrong overwrites someone's sentence.
 *
 * Duplicates inside the file count once, so the numbers shown match what actually lands.
 */
export function planCorpusImport(
  rows: readonly CorpusRow[],
  existing: readonly CorpusRow[],
): CorpusImportPlan {
  // Joined on a character prose cannot contain, so "a b" + "c" and "a" + "b c" stay
  // distinct pairs rather than colliding on one key.
  const pairOf = (r: CorpusRow) => `${r.english.trim()}\u0000${r.conlang.trim()}`;
  const seen = new Set(existing.map(pairOf));
  let add = 0;
  let skip = 0;

  for (const row of rows) {
    const pair = pairOf(row);
    if (seen.has(pair)) {
      skip++;
      continue;
    }
    seen.add(pair);
    add++;
  }

  return { add, skip };
}
