/**
 * Reading the lexicon CSVs back in.
 *
 * Pure, like `exporters.ts` and for the same reason: no `vue`, no `pinia`, no Supabase
 * client. `lexiconImport.test.ts` asserts there is no package import rather than trusting
 * this comment; `./csv`, which holds the parser this shares with the corpus, is relative
 * and so is allowed.
 *
 * The two shapes it accepts are exactly the two `exporters.ts` writes:
 *
 * - `key,lemma,pos,gloss,notes` with that header — the full export, and the only one that
 *   round-trips.
 * - two headerless columns, `key,form` — the co-designer's `vocab_beta_1.csv` shape, which
 *   the app also emits.
 *
 * **Only the columns a file actually carries are written.** The two-column form has no
 * gloss, and treating an absent column as "clear it" would silently empty 60 glosses on
 * import. So the result reports which `fields` it found, and the write applies only those.
 */

import { parseCsv } from "./csv";

export type ImportRow = {
  entry_key: string | null;
  lemma: string;
  gloss: string;
  word_class: string;
  notes: string;
};

/**
 * A row with the line it came from, kept so the review dialog can say *which* two lines
 * are fighting over a key. The line is the one a person sees in a spreadsheet, header
 * counted. Stripped again before the payload reaches the RPC.
 */
export type ParsedRow = ImportRow & { line: number };

/** The columns a file supplied, and therefore the only ones an import may overwrite. */
export type ImportField = "lemma" | "gloss" | "word_class" | "notes";

export type ParsedImport = {
  rows: ParsedRow[];
  fields: ImportField[];
  /** Blocking: nothing is written while any of these stand. */
  problems: string[];
};

const FULL_HEADER = ["key", "lemma", "pos", "gloss", "notes"];

const isFullHeader = (row: string[]) =>
  row.length === FULL_HEADER.length &&
  row.every((cell, i) => cell.trim().toLowerCase() === FULL_HEADER[i]);

export function parseLexiconCsv(text: string): ParsedImport {
  const rows = parseCsv(text);
  const problems: string[] = [];

  if (rows.length === 0) return { rows: [], fields: [], problems: ["That file has no rows."] };

  const header = rows[0];
  const full = header !== undefined && isFullHeader(header);
  const body = full ? rows.slice(1) : rows;

  if (!full && !rows.every((r) => r.length === 2)) {
    return {
      rows: [],
      fields: [],
      problems: [
        "Unrecognised columns. Expected either a “key,lemma,pos,gloss,notes” header row, " +
          "or two headerless columns of key and form.",
      ],
    };
  }

  const fields: ImportField[] = full ? ["lemma", "gloss", "word_class", "notes"] : ["lemma"];
  const out: ParsedRow[] = [];

  body.forEach((cells, i) => {
    // The line a person would see in a spreadsheet, header included.
    const line = full ? i + 2 : i + 1;
    const at = (index: number) => (cells[index] ?? "").trim();

    const key = at(0);
    const lemma = at(1);

    if (!lemma) {
      // Still blocking, unlike a repeated key: a line with no lemma has no second version
      // to choose between, so there is nothing for the review dialog to ask about.
      problems.push(`Line ${line} has no lemma.`);
      return;
    }

    // Two rows claiming one key used to be refused here. They are not any more: which one
    // wins is a question the user can answer in one click, and refusing the file threw
    // away every good row with it. `buildMergePlan` groups them instead.
    out.push({
      line,
      entry_key: key || null,
      lemma,
      gloss: full ? at(3) : "",
      word_class: full ? at(2) : "",
      notes: full ? at(4) : "",
    });
  });

  return { rows: out, fields, problems };
}
