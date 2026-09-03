/**
 * Working out what a corpus import would actually change, so a person can decide before it
 * does.
 *
 * Pure, like `lexiconMerge.ts` and for the same reason: no `vue`, no `pinia`, no Supabase
 * client. `corpusMerge.test.ts` asserts there is no package import rather than trusting
 * this comment.
 *
 * **The English sentence is the key**, matched the way the lexicon matches on `entry_key`
 * — trimmed, exact, and case-sensitive. That is a real change from how this format used to
 * behave: 0022 and 0025 matched on the *pair*, both sides identical or the row was new, and
 * `CLAUDE.md` called the absence of a key "the whole character of this format." Keying on
 * English is what lets a typo in the conlang half be corrected by re-importing rather than
 * arriving as a second row beside the original — the thing the old format could not do.
 *
 * **What this costs**: two examples that legitimately share an English translation — this
 * project has six such pairs, alternate phrasings of the same gloss — can no longer both be
 * reached by a keyed import. The first one `import_corpus` finds is the one a conflict or a
 * duplicate group refers to; the other falls out of the file's keys entirely and shows up
 * in `absent`, defaulting to kept exactly like any other row a file doesn't mention. Nothing
 * is deleted by this on its own — the review dialog still asks — but a full-corpus
 * re-export and re-import of a project with such pairs will flag them every time, the same
 * way a lexicon homograph pair would if lexicon entries were keyed on lemma instead of
 * `entry_key`. There is no `entry_key`-equivalent column here to fall back on; English is
 * what was asked for.
 *
 * A row whose English is blank cannot be a key at all — a translation waiting for its
 * sentence is a real working state, and there is nothing in it to match on. It is treated
 * exactly as the lexicon treats a row with no `entry_key`: always an addition, decided
 * individually rather than defaulted away, because with no key nothing can *tell* it apart
 * from a fresh row that was meant to be new.
 */

import type { CorpusKind, CorpusRow, ParsedCorpusRow } from "./corpusImport";
import { inferKind } from "./corpusImport";

/** The stored side. Structural rather than `CorpusEntry`, to keep this module import-free. */
export type StoredEntry = { id: string; english: string; conlang: string; kind: CorpusKind };

export type Conflict = {
  key: string;
  line: number;
  existing: StoredEntry;
  incoming: CorpusRow;
  before: string;
  after: string;
};

export type DuplicateGroup = {
  key: string;
  candidates: ParsedCorpusRow[];
  /** Whether the winner, whichever it is, would update a stored entry or add a new one. */
  matchesExisting: boolean;
};

export type MergePlan = {
  conflicts: Conflict[];
  /** Matched by key with an identical conlang. Counted, and left out of the payload. */
  identical: number;
  /** Keyed rows with no stored match. No decision to make: they are added. */
  additions: (ParsedCorpusRow & { kind: CorpusKind })[];
  /** Rows with no English at all — nothing to match them by, so each is its own decision. */
  unkeyed: ParsedCorpusRow[];
  duplicates: DuplicateGroup[];
  /** Stored entries this file does not carry a key for. Kept unless deletion is opted into. */
  absent: StoredEntry[];
};

const keyOf = (english: string) => english.trim();

export function buildMergePlan(
  rows: readonly ParsedCorpusRow[],
  existing: readonly StoredEntry[],
): MergePlan {
  const byKey = new Map<string, StoredEntry>();
  for (const entry of existing) {
    const key = keyOf(entry.english);
    // First one wins, deterministically by iteration order, the same way the RPC's
    // `order by created_at` does — see the module comment on what a duplicated English
    // costs. Never overwritten: a later entry sharing the key falls out to `absent`.
    if (key && !byKey.has(key)) byKey.set(key, entry);
  }

  // Group first, so a key claimed twice is recognised as such rather than the second row
  // quietly winning on file order — which is what the database would do to it.
  const grouped = new Map<string, ParsedCorpusRow[]>();
  const unkeyed: ParsedCorpusRow[] = [];
  for (const row of rows) {
    const key = keyOf(row.english);
    if (!key) {
      unkeyed.push(row);
      continue;
    }
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }

  const conflicts: Conflict[] = [];
  const additions: (ParsedCorpusRow & { kind: CorpusKind })[] = [];
  const duplicates: DuplicateGroup[] = [];
  let identical = 0;
  // Which stored entry, by id, a key in the file actually resolved to — unlike the
  // lexicon's `entry_key`, English carries no uniqueness constraint, so `byKey.has(key)`
  // is not enough to say a stored row was "in the file": a second row sharing that same
  // English was never looked up at all (`byKey` keeps only the first), and without this
  // set it would silently vanish from the plan — neither matched nor listed as absent.
  const claimed = new Set<string>();

  for (const [key, group] of grouped) {
    const stored = byKey.get(key);
    if (stored) claimed.add(stored.id);

    if (group.length > 1) {
      duplicates.push({ key, candidates: group, matchesExisting: stored !== undefined });
      continue;
    }

    const row = group[0]!;
    if (!stored) {
      additions.push({ ...row, kind: inferKind(row) });
      continue;
    }

    const before = stored.conlang.trim();
    const after = row.conlang.trim();
    if (before === after) {
      identical++;
    } else {
      conflicts.push({
        key,
        line: row.line,
        existing: stored,
        incoming: strip(row),
        before,
        after,
      });
    }
  }

  // Not in the file: never claimed by a key match, which covers both a genuinely absent
  // English and a stored row a duplicated English left unreachable. An entry whose English
  // is blank can never be claimed either, for the same reason the lexicon lists a stored
  // entry with no key here.
  const absent = existing.filter((e) => !claimed.has(e.id));

  return { conflicts, identical, additions, unkeyed, duplicates, absent };
}

/**
 * The RPC takes exactly `{ english, conlang }`. Built rather than spread-and-omit: a spread
 * copies whatever properties the value actually carries at runtime, not just the ones its
 * declared type names, and both `line` and (on an addition) the preview `kind` would
 * otherwise leak into the payload — harmless to the RPC, which reads only these two keys,
 * but not what this function is for.
 */
function strip(row: CorpusRow): CorpusRow {
  return { english: row.english, conlang: row.conlang };
}

/**
 * What the user decided, keyed so a default can be left absent rather than pre-filled.
 *
 * Defaults are stated once, here, and every reader goes through `decide*` — a default
 * spelled out again in the component would be a second place for it to drift.
 */
export type Decisions = {
  /** By English. Default `take`: the imported file is what the user just chose. */
  conflicts: Record<string, "take" | "keep">;
  /** By line. Default `add`, which is what a keyless row has always done. */
  unkeyed: Record<number, "add" | "skip">;
  /** By English → the winning line, or `skip`. **No default**: this one has to be answered. */
  duplicates: Record<string, number | "skip">;
  /** By stored id. Default `keep`, because an import has never deleted anything by itself. */
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

export type ResolvedImport = { rows: CorpusRow[]; deleteIds: string[] };

/**
 * The payload. A conflict resolved as `keep` is simply left out — row-level resolution
 * needs nothing from the RPC, which matches every row it is handed by English and either
 * updates or inserts, deciding that for itself.
 */
export function resolveImport(plan: MergePlan, d: Decisions): ResolvedImport {
  const rows: CorpusRow[] = [];

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
