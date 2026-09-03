/**
 * Working out what an import would actually change, so a person can decide before it does.
 *
 * Pure, like `lexiconImport.ts` and `phonotactics.ts` and for the same reason: no `vue`,
 * no `pinia`, no Supabase client. `lexiconMerge.test.ts` asserts there is no package
 * import rather than trusting this comment.
 *
 * The shape of the problem is that a CSV and the stored lexicon disagree in three
 * different ways, and only one of them used to be visible:
 *
 * - **The same key on both sides, with different content.** This was applied blind — the
 *   old confirm said "update 30 entries" and nothing else, so importing `n_book,foo` over
 *   a stored `n_book,miŋgwem` replaced the lemma without a word. Now it is a conflict with
 *   a diff, defaulting to the imported version but flippable per row.
 * - **A key on one side only.** New rows are added (that was already true and needs no
 *   decision); stored entries the file does not carry are listed and may be deleted, but
 *   only by explicit opt-in.
 * - **The same key twice inside one file.** This used to refuse the whole file. Which of
 *   the two wins is a question with an answer, so it is asked rather than refused.
 *
 * Matching is on `entry_key` **only**, never on lemma: the language has homographs — `gwan`
 * is both "meaning" (noun) and "become" (verb) — which is exactly why `lexicon_entries`
 * has no unique constraint on lemma, and matching on one would merge two real words.
 */

import type { ImportField, ImportRow, ParsedRow } from "./lexiconImport";

/** The stored side. Structural rather than `LexiconEntry`, to keep this module import-free. */
export type StoredEntry = {
  id: string;
  entry_key: string | null;
  lemma: string;
  gloss: string | null;
  word_class: string | null;
  notes: string | null;
};

export type FieldDiff = {
  field: ImportField;
  before: string;
  after: string;
  changed: boolean;
};

export type Conflict = {
  key: string;
  line: number;
  existing: StoredEntry;
  incoming: ImportRow;
  /** Every field the file carried, changed or not — the unchanged ones are the context. */
  diffs: FieldDiff[];
};

export type DuplicateGroup = {
  key: string;
  candidates: ParsedRow[];
  /** Whether the winner, whichever it is, would update a stored entry or add a new one. */
  matchesExisting: boolean;
};

export type MergePlan = {
  conflicts: Conflict[];
  /** Matched by key with nothing to change. Counted, and left out of the payload. */
  identical: number;
  /** Keyed rows with no stored match. No decision to make: they are added. */
  additions: ParsedRow[];
  unkeyed: ParsedRow[];
  duplicates: DuplicateGroup[];
  /** Stored entries this file does not carry. Kept unless deletion is opted into. */
  absent: StoredEntry[];
  fields: ImportField[];
};

/** Display order, matching the full export's own columns (key,lemma,pos,gloss,notes). */
export const FIELD_ORDER: ImportField[] = ["lemma", "word_class", "gloss", "notes"];

export const FIELD_LABEL: Record<ImportField, string> = {
  lemma: "Lemma",
  word_class: "Word class",
  gloss: "Meaning",
  notes: "Notes",
};

const storedValue = (entry: StoredEntry, field: ImportField): string =>
  (field === "lemma" ? entry.lemma : (entry[field] ?? "")) || "";

export function buildMergePlan(
  rows: readonly ParsedRow[],
  existing: readonly StoredEntry[],
  fields: readonly ImportField[],
): MergePlan {
  const byKey = new Map<string, StoredEntry>();
  for (const entry of existing) {
    if (entry.entry_key) byKey.set(entry.entry_key, entry);
  }

  // Group first, so a key claimed twice is recognised as such rather than the second row
  // quietly winning on file order — which is what the database would do to it.
  const grouped = new Map<string, ParsedRow[]>();
  const unkeyed: ParsedRow[] = [];
  for (const row of rows) {
    if (!row.entry_key) {
      unkeyed.push(row);
      continue;
    }
    const group = grouped.get(row.entry_key);
    if (group) group.push(row);
    else grouped.set(row.entry_key, [row]);
  }

  const conflicts: Conflict[] = [];
  const additions: ParsedRow[] = [];
  const duplicates: DuplicateGroup[] = [];
  let identical = 0;

  for (const [key, group] of grouped) {
    const stored = byKey.get(key);

    if (group.length > 1) {
      duplicates.push({ key, candidates: group, matchesExisting: stored !== undefined });
      continue;
    }

    const row = group[0]!;
    if (!stored) {
      additions.push(row);
      continue;
    }

    // Only the columns the file actually carried. The two-column export has no gloss, and
    // showing "gloss: meaning → (empty)" would describe a write the RPC will not make:
    // `p_fields` leaves absent columns exactly as they are.
    const diffs = FIELD_ORDER.filter((f) => fields.includes(f)).map((field) => {
      const before = storedValue(stored, field);
      const after = row[field];
      return { field, before, after, changed: before !== after };
    });

    if (diffs.some((d) => d.changed)) {
      conflicts.push({ key, line: row.line, existing: stored, incoming: strip(row), diffs });
    } else {
      identical++;
    }
  }

  const fileKeys = new Set(grouped.keys());
  // An entry with no key at all can never be matched by any file, so it is "not in this
  // file" too. It is listed with the rest rather than hidden: the section defaults to
  // keeping everything, and hiding a row from a list headed "not in this file" would make
  // Delete all mean less than it says.
  const absent = existing.filter((e) => !e.entry_key || !fileKeys.has(e.entry_key));

  return { conflicts, identical, additions, unkeyed, duplicates, absent, fields: [...fields] };
}

/** The RPC takes `ImportRow`s; `line` is ours. */
function strip(row: ParsedRow): ImportRow {
  const { line: _line, ...rest } = row;
  return rest;
}

/**
 * What the user decided, keyed so a default can be left absent rather than pre-filled.
 *
 * Defaults are stated once, here, and every reader goes through `decide*` — a default
 * spelled out again in the component would be a second place for it to drift.
 */
export type Decisions = {
  /** By entry key. Default `take`: the imported file is what the user just chose. */
  conflicts: Record<string, "take" | "keep">;
  /** By line. Default `add`, which is what an unkeyed row has always done. */
  unkeyed: Record<number, "add" | "skip">;
  /** By key → the winning line, or `skip`. **No default**: this one has to be answered. */
  duplicates: Record<string, number | "skip">;
  /** By stored id. Default `keep`, because an import has never deleted anything. */
  absent: Record<string, "keep" | "delete">;
};

export const emptyDecisions = (): Decisions => ({
  conflicts: {},
  unkeyed: {},
  duplicates: {},
  absent: {},
});

export const decideConflict = (d: Decisions, key: string) => d.conflicts[key] ?? "take";
export const decideUnkeyed = (d: Decisions, line: number) => d.unkeyed[line] ?? "add";
export const decideAbsent = (d: Decisions, id: string) => d.absent[id] ?? "keep";
export const decideDuplicate = (d: Decisions, key: string) => d.duplicates[key];

/** True while some duplicate group has no answer — the one thing that blocks Import. */
export const unresolved = (plan: MergePlan, d: Decisions) =>
  plan.duplicates.filter((g) => decideDuplicate(d, g.key) === undefined);

export type ResolvedImport = { rows: ImportRow[]; deleteIds: string[] };

/**
 * The payload. A conflict resolved as `keep` is simply left out — row-level resolution
 * needs nothing from the RPC, which only ever touches the rows it is handed.
 */
export function resolveImport(plan: MergePlan, d: Decisions): ResolvedImport {
  const rows: ImportRow[] = [];

  for (const conflict of plan.conflicts) {
    if (decideConflict(d, conflict.key) === "take") rows.push(conflict.incoming);
  }
  for (const row of plan.additions) rows.push(strip(row));
  for (const row of plan.unkeyed) {
    if (decideUnkeyed(d, row.line) === "add") rows.push(strip(row));
  }
  for (const group of plan.duplicates) {
    const chosen = decideDuplicate(d, group.key);
    if (chosen === undefined || chosen === "skip") continue;
    const row = group.candidates.find((c) => c.line === chosen);
    if (row) rows.push(strip(row));
  }

  const deleteIds = plan.absent.filter((e) => decideAbsent(d, e.id) === "delete").map((e) => e.id);

  return { rows, deleteIds };
}

export type Tally = { created: number; updated: number; unchanged: number; deleted: number };

/** What `resolveImport`'s payload will do, counted the same way the RPC counts it. */
export function tally(plan: MergePlan, d: Decisions): Tally {
  let created = plan.additions.length;
  let updated = 0;
  let unchanged = plan.identical;

  for (const conflict of plan.conflicts) {
    if (decideConflict(d, conflict.key) === "take") updated++;
    else unchanged++;
  }
  for (const row of plan.unkeyed) {
    if (decideUnkeyed(d, row.line) === "add") created++;
  }
  for (const group of plan.duplicates) {
    const chosen = decideDuplicate(d, group.key);
    if (chosen === undefined || chosen === "skip") continue;
    if (group.matchesExisting) updated++;
    else created++;
  }

  const deleted = plan.absent.filter((e) => decideAbsent(d, e.id) === "delete").length;

  return { created, updated, unchanged, deleted };
}
