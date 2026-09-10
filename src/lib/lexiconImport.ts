/**
 * Reading the lexicon CSVs back in.
 *
 * Pure, like `exporters.ts` and for the same reason: no `vue`, no `pinia`, no Supabase
 * client. `lexiconImport.test.ts` asserts there is no package import rather than trusting
 * this comment; `./csv`, which holds the parser this shares with the corpus, is relative
 * and so is allowed.
 *
 * The shapes it accepts are the ones `exporters.ts` writes:
 *
 * - `key,lemma,underlying,pos,gloss,notes` with that header — the current full export, and
 *   the only one that round-trips everything.
 * - `key,lemma,pos,gloss,notes` — the full export before `underlying` (0033) was a column.
 *   Still read, so an older file imports without complaint.
 * - two headerless columns, `key,form` — the co-designer's `vocab_beta_1.csv` shape, which
 *   the app also emits.
 *
 * **Only the columns a file actually carries are written.** The two-column form has no
 * gloss, and treating an absent column as "clear it" would silently empty 60 glosses on
 * import. So the result reports which `fields` it found, and the write applies only those.
 *
 * **A column a file omits is filled from the entry key where the key says enough.** The
 * two-column form carries neither meaning nor word class, but a key like `n_book` names
 * both — see `deriveFromKey`. This only fires for columns the file left out entirely; a
 * blank cell in a file that *has* the column is the author's choice and stays blank.
 */

import { parseCsv } from "./csv";

export type ImportRow = {
  entry_key: string | null;
  lemma: string;
  underlying_phonology: string;
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
export type ImportField = "lemma" | "underlying_phonology" | "gloss" | "word_class" | "notes";

export type ParsedImport = {
  rows: ParsedRow[];
  fields: ImportField[];
  /** Blocking: nothing is written while any of these stand. */
  problems: string[];
};

// The current full export, and the one before `underlying` (0033) was a column. Order
// matters: `parseLexiconCsv` reads columns positionally.
const FULL_HEADER = ["key", "lemma", "underlying", "pos", "gloss", "notes"];
const FULL_HEADER_LEGACY = ["key", "lemma", "pos", "gloss", "notes"];

const matchesHeader = (row: string[], header: readonly string[]) =>
  row.length === header.length && row.every((cell, i) => cell.trim().toLowerCase() === header[i]);

/** Part-of-speech prefixes the lexicon actually uses. Everything else is left to the user. */
const KEY_POS: Record<string, string> = { n: "noun", a: "adjective", v: "verb" };

/**
 * A meaning and word class guessed from an entry key, for rows whose file carried neither.
 *
 * The keys in this project read `pos_meaning` — `n_book`, `a_black`, `v_become` — so the
 * part before the first underscore is a part of speech and the rest is the gloss with
 * underscores standing in for spaces. Only the three parts of speech the lexicon uses are
 * mapped; a key whose prefix is not one of them (`top_case`, `num_3`, `dir_evid`) yields
 * nothing rather than a misleading "case" or "3". The gloss is only trusted when the
 * prefix was recognised — otherwise the underscore split is as likely to have cut a word
 * in half. All of it is a starting point the import review shows before anything is saved.
 */
export function deriveFromKey(key: string): { gloss: string; word_class: string } {
  const cut = key.indexOf("_");
  if (cut <= 0) return { gloss: "", word_class: "" };
  const word_class = KEY_POS[key.slice(0, cut)] ?? "";
  const rest = key.slice(cut + 1);
  return { gloss: word_class && rest ? rest.replace(/_/g, " ") : "", word_class };
}

export function parseLexiconCsv(text: string): ParsedImport {
  const rows = parseCsv(text);
  const problems: string[] = [];

  if (rows.length === 0) return { rows: [], fields: [], problems: ["That file has no rows."] };

  const header = rows[0];
  const withUnderlying = header !== undefined && matchesHeader(header, FULL_HEADER);
  const legacy = header !== undefined && matchesHeader(header, FULL_HEADER_LEGACY);
  const full = withUnderlying || legacy;
  const body = full ? rows.slice(1) : rows;

  if (!full && !rows.every((r) => r.length === 2)) {
    return {
      rows: [],
      fields: [],
      problems: [
        "Unrecognised columns. Expected a “key,lemma,underlying,pos,gloss,notes” header " +
          "row (or the older “key,lemma,pos,gloss,notes”), or two headerless columns of " +
          "key and form.",
      ],
    };
  }

  // Column positions by shape: the legacy header has no `underlying`, so `pos`, `gloss`
  // and `notes` each shift left by one.
  const col = withUnderlying
    ? { underlying: 2, pos: 3, gloss: 4, notes: 5 }
    : { underlying: -1, pos: 2, gloss: 3, notes: 4 };

  const fields: ImportField[] = withUnderlying
    ? ["lemma", "underlying_phonology", "gloss", "word_class", "notes"]
    : legacy
      ? ["lemma", "gloss", "word_class", "notes"]
      : ["lemma"];
  const out: ParsedRow[] = [];

  body.forEach((cells, i) => {
    // The line a person would see in a spreadsheet, header included.
    const line = full ? i + 2 : i + 1;
    const at = (index: number) => (index < 0 ? "" : (cells[index] ?? "").trim());

    const key = at(0);
    const lemma = at(1);

    if (!lemma) {
      // Still blocking, unlike a repeated key: a line with no lemma has no second version
      // to choose between, so there is nothing for the review dialog to ask about.
      problems.push(`Line ${line} has no lemma.`);
      return;
    }

    // Fill meaning and word class from the key only where the file left the column out
    // entirely — see `deriveFromKey`. A file that carries the column decides for itself,
    // blank cells included.
    const derived = deriveFromKey(key);

    // Two rows claiming one key used to be refused here. They are not any more: which one
    // wins is a question the user can answer in one click, and refusing the file threw
    // away every good row with it. `buildMergePlan` groups them instead.
    out.push({
      line,
      entry_key: key || null,
      lemma,
      underlying_phonology: at(col.underlying),
      gloss: full ? at(col.gloss) : derived.gloss,
      word_class: full ? at(col.pos) : derived.word_class,
      notes: at(col.notes),
    });
  });

  return { rows: out, fields, problems };
}
