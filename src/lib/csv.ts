/**
 * CSV, both directions, shared by every section that reads or writes one.
 *
 * Pure — no `vue`, no `pinia`, no Supabase client — and hand-written rather than pulled
 * from a package, for the same reason `exporters.ts` emits YAML by hand: a parser is a
 * dependency in the browser bundle and this is fifty lines.
 *
 * It lived inside `lexiconImport.ts` until the corpus needed it too. Splitting it out
 * rather than importing the lexicon's module from the corpus's keeps the two sections
 * independent: they share a file format, not a domain.
 */

/** Quote only when the value would otherwise be misread. */
export function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * RFC 4180-ish: comma-separated, `"` quoting, `""` for a literal quote inside a quoted
 * field, and newlines allowed inside quotes — which a lexicon `notes` field and a corpus
 * sentence both really do contain.
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
