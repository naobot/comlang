/**
 * Reading the lexicon CSVs back in.
 *
 * Pure, like `exporters.ts` and for the same reason: no `vue`, no `pinia`, no Supabase
 * client. `lexiconImport.test.ts` asserts the import list is empty rather than trusting
 * this comment.
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

export type ImportRow = {
  entry_key: string | null;
  lemma: string;
  gloss: string;
  word_class: string;
  notes: string;
};

/** The columns a file supplied, and therefore the only ones an import may overwrite. */
export type ImportField = "lemma" | "gloss" | "word_class" | "notes";

export type ParsedImport = {
  rows: ImportRow[];
  fields: ImportField[];
  /** Blocking: nothing is written while any of these stand. */
  problems: string[];
};

/**
 * RFC 4180-ish CSV, to the extent `csvField` in `exporters.ts` emits it: comma-separated,
 * `"` quoting, `""` for a literal quote inside a quoted field, and newlines allowed inside
 * quotes — which a lexicon `notes` field really does contain.
 *
 * Hand-written for the same reason the YAML emitter is: a parser is a dependency in the
 * browser bundle, and this is thirty lines.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // Strip a BOM: Excel writes one, and it would otherwise become part of the first header
  // cell and stop the header being recognised.
  const src = text.replace(/^﻿/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      // Treat CRLF as one break rather than an empty row.
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }

  // A file not ending in a newline still has a last row.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // A trailing newline produces one empty row; so does a blank line in the middle.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

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
  const out: ImportRow[] = [];
  const seen = new Map<string, number>();

  body.forEach((cells, i) => {
    // The line a person would see in a spreadsheet, header included.
    const line = full ? i + 2 : i + 1;
    const at = (index: number) => (cells[index] ?? "").trim();

    const key = at(0);
    const lemma = full ? at(1) : at(1);

    if (!lemma) {
      problems.push(`Line ${line} has no lemma.`);
      return;
    }

    if (key) {
      const first = seen.get(key);
      if (first !== undefined) {
        // Two rows claiming one key would fight over the same entry, and which one won
        // would depend on file order — worth refusing rather than resolving.
        problems.push(`Line ${line} repeats the key “${key}” from line ${first}.`);
        return;
      }
      seen.set(key, line);
    }

    out.push({
      entry_key: key || null,
      lemma,
      gloss: full ? at(3) : "",
      word_class: full ? at(2) : "",
      notes: full ? at(4) : "",
    });
  });

  return { rows: out, fields, problems };
}

/**
 * What applying this file would do, given what is already stored.
 *
 * Matching is on `entry_key` **only**. Not on lemma: the language has homographs — `gwan`
 * is both "meaning" (noun) and "become" (verb) — which is exactly why `lexicon_entries`
 * has no unique constraint on lemma, and matching on one would merge two real words.
 * A row with no key is therefore always new.
 */
export type ImportPlan = { create: number; update: number; unkeyed: number };

export function planImport(
  rows: readonly ImportRow[],
  existing: readonly { entry_key: string | null }[],
): ImportPlan {
  const keys = new Set(existing.map((e) => e.entry_key).filter((k): k is string => !!k));
  let create = 0;
  let update = 0;
  let unkeyed = 0;

  for (const row of rows) {
    if (!row.entry_key) {
      unkeyed++;
      create++;
    } else if (keys.has(row.entry_key)) {
      update++;
    } else {
      create++;
    }
  }

  return { create, update, unkeyed };
}
