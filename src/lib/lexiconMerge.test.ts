import { describe, expect, it } from "vite-plus/test";

// `?raw` rather than node:fs — this file is type-checked by the DOM tsconfig, which
// deliberately has no Node types, and Vite resolves the raw import in both.
import source from "./lexiconMerge.ts?raw";

import { type ImportField, type ParsedRow, parseLexiconCsv } from "./lexiconImport";
import {
  type Decisions,
  type StoredEntry,
  buildMergePlan,
  emptyDecisions,
  resolveImport,
  tally,
  unresolved,
} from "./lexiconMerge";

const FULL: ImportField[] = ["lemma", "gloss", "word_class", "notes"];

const stored = (over: Partial<StoredEntry> & { id: string }): StoredEntry => ({
  entry_key: null,
  lemma: "",
  gloss: null,
  word_class: null,
  notes: null,
  ...over,
});

const row = (over: Partial<ParsedRow> & { line: number }): ParsedRow => ({
  entry_key: null,
  lemma: "",
  gloss: "",
  word_class: "",
  notes: "",
  ...over,
});

describe("buildMergePlan", () => {
  it("reports a changed field as a conflict, with the unchanged ones as context", () => {
    const plan = buildMergePlan(
      [row({ line: 2, entry_key: "n_book", lemma: "miŋgwem", gloss: "tome", word_class: "noun" })],
      [
        stored({
          id: "a",
          entry_key: "n_book",
          lemma: "miŋgwem",
          gloss: "book",
          word_class: "noun",
        }),
      ],
      FULL,
    );

    expect(plan.conflicts).toHaveLength(1);
    expect(plan.identical).toBe(0);
    expect(plan.conflicts[0]?.diffs).toEqual([
      { field: "lemma", before: "miŋgwem", after: "miŋgwem", changed: false },
      { field: "word_class", before: "noun", after: "noun", changed: false },
      { field: "gloss", before: "book", after: "tome", changed: true },
      { field: "notes", before: "", after: "", changed: false },
    ]);
  });

  /**
   * The silent overwrite this whole dialog exists for: the old confirm said "update 1
   * entry" and the lemma was replaced without a word about it.
   */
  it("catches a lemma being replaced under an existing key", () => {
    const plan = buildMergePlan(
      [row({ line: 2, entry_key: "n_book", lemma: "foo" })],
      [stored({ id: "a", entry_key: "n_book", lemma: "miŋgwem" })],
      FULL,
    );
    expect(plan.conflicts[0]?.diffs[0]).toEqual({
      field: "lemma",
      before: "miŋgwem",
      after: "foo",
      changed: true,
    });
  });

  /**
   * The two-column export has no gloss column, and the RPC's `p_fields` leaves absent
   * columns exactly as they are — so diffing them would describe a write that never
   * happens, and turn every entry in the project into a conflict.
   */
  it("diffs only the columns the file carried", () => {
    const plan = buildMergePlan(
      [row({ line: 1, entry_key: "n_book", lemma: "renamed" })],
      [stored({ id: "a", entry_key: "n_book", lemma: "miŋgwem", gloss: "book" })],
      ["lemma"],
    );
    expect(plan.conflicts[0]?.diffs.map((d) => d.field)).toEqual(["lemma"]);
  });

  it("counts a row that matches in every carried field as identical, not a conflict", () => {
    const plan = buildMergePlan(
      [row({ line: 2, entry_key: "n_book", lemma: "miŋgwem", gloss: "book" })],
      [stored({ id: "a", entry_key: "n_book", lemma: "miŋgwem", gloss: "book" })],
      FULL,
    );
    expect(plan.conflicts).toEqual([]);
    expect(plan.identical).toBe(1);
  });

  it("groups a key claimed twice rather than refusing the file", () => {
    const parsed = parseLexiconCsv("key,lemma,pos,gloss,notes\nk,a,,,\nk,b,,,\nn_pen,c,,,\n");
    const plan = buildMergePlan(parsed.rows, [], parsed.fields);

    expect(plan.duplicates).toHaveLength(1);
    expect(plan.duplicates[0]?.key).toBe("k");
    expect(plan.duplicates[0]?.candidates.map((c) => c.line)).toEqual([2, 3]);
    expect(plan.duplicates[0]?.matchesExisting).toBe(false);
    // And the good row is still there, which refusing the file used to throw away.
    expect(plan.additions.map((a) => a.lemma)).toEqual(["c"]);
  });

  /**
   * Never matched on lemma: `gwan` is both "meaning" (noun) and "become" (verb) in the real
   * data, which is why lexicon_entries has no unique constraint on lemma.
   */
  it("treats an unkeyed row as new even when its lemma already exists", () => {
    const plan = buildMergePlan(
      [row({ line: 1, lemma: "gwan" })],
      [stored({ id: "a", entry_key: "v_become", lemma: "gwan" })],
      FULL,
    );
    expect(plan.unkeyed).toHaveLength(1);
    expect(plan.conflicts).toEqual([]);
    expect(plan.absent.map((e) => e.id)).toEqual(["a"]);
  });

  it("lists a stored entry with no key at all as not in the file", () => {
    const plan = buildMergePlan([], [stored({ id: "a", lemma: "ʔo" })], FULL);
    expect(plan.absent.map((e) => e.id)).toEqual(["a"]);
  });
});

describe("decisions", () => {
  const plan = () =>
    buildMergePlan(
      [
        row({ line: 2, entry_key: "n_book", lemma: "tome" }),
        row({ line: 3, entry_key: "n_pen", lemma: "new" }),
        row({ line: 4, lemma: "unkeyed" }),
        row({ line: 5, entry_key: "dup", lemma: "one" }),
        row({ line: 6, entry_key: "dup", lemma: "two" }),
      ],
      [
        stored({ id: "a", entry_key: "n_book", lemma: "miŋgwem" }),
        stored({ id: "b", entry_key: "n_gone", lemma: "gone" }),
      ],
      FULL,
    );

  it("defaults to the imported version, adds unkeyed rows, and deletes nothing", () => {
    const p = plan();
    const d = emptyDecisions();
    const { rows, deleteIds } = resolveImport(p, d);

    expect(rows.map((r) => r.lemma)).toEqual(["tome", "new", "unkeyed"]);
    expect(deleteIds).toEqual([]);
    // The duplicate is undecided, so it is left out — and Import is blocked meanwhile.
    expect(unresolved(p, d).map((g) => g.key)).toEqual(["dup"]);
    expect(tally(p, d)).toEqual({ created: 2, updated: 1, unchanged: 0, deleted: 0 });
  });

  it("leaves a conflict out of the payload when the stored version is kept", () => {
    const p = plan();
    const d: Decisions = { ...emptyDecisions(), conflicts: { n_book: "keep" } };
    expect(resolveImport(p, d).rows.map((r) => r.lemma)).toEqual(["new", "unkeyed"]);
    expect(tally(p, d)).toEqual({ created: 2, updated: 0, unchanged: 1, deleted: 0 });
  });

  it("sends only the winning row of a duplicated key, and counts it as an add", () => {
    const p = plan();
    const d: Decisions = { ...emptyDecisions(), duplicates: { dup: 6 } };
    expect(resolveImport(p, d).rows.map((r) => r.lemma)).toEqual(["tome", "new", "unkeyed", "two"]);
    expect(unresolved(p, d)).toEqual([]);
    expect(tally(p, d)).toEqual({ created: 3, updated: 1, unchanged: 0, deleted: 0 });
  });

  it("skips a duplicated key outright when asked to", () => {
    const p = plan();
    const d: Decisions = { ...emptyDecisions(), duplicates: { dup: "skip" } };
    expect(resolveImport(p, d).rows.map((r) => r.lemma)).not.toContain("two");
    expect(unresolved(p, d)).toEqual([]);
  });

  it("skips an unkeyed row without touching anything else", () => {
    const p = plan();
    const d: Decisions = { ...emptyDecisions(), unkeyed: { 4: "skip" } };
    expect(resolveImport(p, d).rows.map((r) => r.lemma)).toEqual(["tome", "new"]);
  });

  it("deletes only what was ticked, and only from the absent list", () => {
    const p = plan();
    const d: Decisions = { ...emptyDecisions(), absent: { b: "delete" } };
    const { rows, deleteIds } = resolveImport(p, d);

    expect(deleteIds).toEqual(["b"]);
    expect(rows.map((r) => r.lemma)).toEqual(["tome", "new", "unkeyed"]);
    expect(tally(p, d).deleted).toBe(1);
  });

  it("strips the line number, which is ours and not the RPC's", () => {
    const { rows } = resolveImport(plan(), emptyDecisions());
    expect(rows.every((r) => !("line" in r))).toBe(true);
  });

  /** The footer's counts and the payload have to be the same claim, or one of them lies. */
  it("tallies exactly what the payload will do", () => {
    const p = plan();
    const d: Decisions = {
      conflicts: { n_book: "keep" },
      unkeyed: {},
      duplicates: { dup: 5 },
      absent: { b: "delete" },
    };
    const { rows, deleteIds } = resolveImport(p, d);
    const counts = tally(p, d);

    expect(counts.created + counts.updated).toBe(rows.length);
    expect(counts.deleted).toBe(deleteIds.length);
  });
});

describe("purity", () => {
  it("imports nothing from vue, pinia, or supabase", () => {
    const imports = [...source.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
    expect(imports.filter((i) => i !== undefined && !i.startsWith("."))).toEqual([]);
  });
});
