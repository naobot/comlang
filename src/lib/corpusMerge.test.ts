import { describe, expect, it } from "vite-plus/test";

// `?raw` rather than node:fs — this file is type-checked by the DOM tsconfig, which
// deliberately has no Node types, and Vite resolves the raw import in both.
import source from "./corpusMerge.ts?raw";

import { type ParsedCorpusRow, parseCorpusCsv } from "./corpusImport";
import {
  type Decisions,
  type StoredEntry,
  buildMergePlan,
  emptyDecisions,
  resolveImport,
  tally,
  unresolved,
} from "./corpusMerge";

const stored = (over: Partial<StoredEntry> & { id: string }): StoredEntry => ({
  english: "",
  conlang: "",
  kind: "utterance",
  ...over,
});

const row = (over: Partial<ParsedCorpusRow> & { line: number }): ParsedCorpusRow => ({
  english: "",
  conlang: "",
  ...over,
});

describe("buildMergePlan", () => {
  it("reports a changed conlang as a conflict", () => {
    const plan = buildMergePlan(
      [row({ line: 2, english: "I see you", conlang: "mi kan yu." })],
      [stored({ id: "a", english: "I see you", conlang: "mi kan yu" })],
    );

    expect(plan.conflicts).toHaveLength(1);
    expect(plan.identical).toBe(0);
    expect(plan.conflicts[0]).toMatchObject({
      key: "I see you",
      before: "mi kan yu",
      after: "mi kan yu.",
    });
  });

  it("counts a row whose conlang already matches as identical, not a conflict", () => {
    const plan = buildMergePlan(
      [row({ line: 2, english: "I see you", conlang: "mi kan yu" })],
      [stored({ id: "a", english: "I see you", conlang: "mi kan yu" })],
    );
    expect(plan.conflicts).toEqual([]);
    expect(plan.identical).toBe(1);
  });

  it("adds a keyed row with no stored match, carrying its inferred kind", () => {
    const plan = buildMergePlan([row({ line: 1, english: "two\nlines", conlang: "y" })], []);
    expect(plan.additions).toEqual([
      { line: 1, english: "two\nlines", conlang: "y", kind: "passage" },
    ]);
  });

  it("groups an English claimed twice rather than refusing the file", () => {
    const parsed = parseCorpusCsv("english,conlang\nI see you,a\nI see you,b\nI see the book,c\n");
    const plan = buildMergePlan(parsed.rows, []);

    expect(plan.duplicates).toHaveLength(1);
    expect(plan.duplicates[0]?.key).toBe("I see you");
    expect(plan.duplicates[0]?.candidates.map((c) => c.line)).toEqual([2, 3]);
    expect(plan.duplicates[0]?.matchesExisting).toBe(false);
    // And the good row is still there, which refusing the file used to throw away.
    expect(plan.additions.map((a) => a.conlang)).toEqual(["c"]);
  });

  // Nothing in the file can tell a row with no English apart from a fresh one, so it is
  // never matched — even against a stored row sharing the exact same conlang.
  it("treats a row with no English as new, never matched by conlang", () => {
    const plan = buildMergePlan(
      [row({ line: 1, conlang: "mi kan yu" })],
      [stored({ id: "a", english: "I see you", conlang: "mi kan yu" })],
    );
    expect(plan.unkeyed).toHaveLength(1);
    expect(plan.conflicts).toEqual([]);
    expect(plan.absent.map((e) => e.id)).toEqual(["a"]);
  });

  it("lists a stored entry with no English at all as not in the file", () => {
    const plan = buildMergePlan([], [stored({ id: "a", conlang: "mi kan yu" })]);
    expect(plan.absent.map((e) => e.id)).toEqual(["a"]);
  });

  // The cost stated in the module comment: two stored rows sharing an English can only
  // ever both be reached by an import until the first key match claims one of them.
  it("leaves a second stored row sharing an English out of the match, in absent", () => {
    const plan = buildMergePlan(
      [row({ line: 1, english: "I might read a book", conlang: "new phrasing" })],
      [
        stored({ id: "a", english: "I might read a book", conlang: "x" }),
        stored({ id: "b", english: "I might read a book", conlang: "y" }),
      ],
    );
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.existing.id).toBe("a");
    expect(plan.absent.map((e) => e.id)).toEqual(["b"]);
  });
});

describe("decisions", () => {
  const plan = () =>
    buildMergePlan(
      [
        row({ line: 2, english: "I see you", conlang: "corrected" }),
        row({ line: 3, english: "new one", conlang: "z" }),
        row({ line: 4, conlang: "no key" }),
        row({ line: 5, english: "dup", conlang: "one" }),
        row({ line: 6, english: "dup", conlang: "two" }),
      ],
      [
        stored({ id: "a", english: "I see you", conlang: "mi kan yu" }),
        stored({ id: "b", english: "gone", conlang: "x" }),
      ],
    );

  it("defaults to the imported version, adds unkeyed rows, and deletes nothing", () => {
    const p = plan();
    const d = emptyDecisions();
    const { rows, deleteIds } = resolveImport(p, d);

    expect(rows.map((r) => r.conlang)).toEqual(["corrected", "z", "no key"]);
    expect(deleteIds).toEqual([]);
    // The duplicate is undecided, so it is left out — and Import is blocked meanwhile.
    expect(unresolved(p, d).map((g) => g.key)).toEqual(["dup"]);
    expect(tally(p, d)).toEqual({ created: 2, updated: 1, unchanged: 0, deleted: 0 });
  });

  it("leaves a conflict out of the payload when the stored version is kept", () => {
    const p = plan();
    const d: Decisions = { ...emptyDecisions(), conflicts: { "I see you": "keep" } };
    expect(resolveImport(p, d).rows.map((r) => r.conlang)).toEqual(["z", "no key"]);
    expect(tally(p, d)).toEqual({ created: 2, updated: 0, unchanged: 1, deleted: 0 });
  });

  it("sends only the winning row of a duplicated English, and counts it as an add", () => {
    const p = plan();
    const d: Decisions = { ...emptyDecisions(), duplicates: { dup: 6 } };
    expect(resolveImport(p, d).rows.map((r) => r.conlang)).toEqual([
      "corrected",
      "z",
      "no key",
      "two",
    ]);
    expect(unresolved(p, d)).toEqual([]);
    expect(tally(p, d)).toEqual({ created: 3, updated: 1, unchanged: 0, deleted: 0 });
  });

  it("skips a duplicated English outright when asked to", () => {
    const p = plan();
    const d: Decisions = { ...emptyDecisions(), duplicates: { dup: "skip" } };
    expect(resolveImport(p, d).rows.map((r) => r.conlang)).not.toContain("two");
    expect(unresolved(p, d)).toEqual([]);
  });

  it("skips an unkeyed row without touching anything else", () => {
    const p = plan();
    const d: Decisions = { ...emptyDecisions(), unkeyed: { 4: "skip" } };
    expect(resolveImport(p, d).rows.map((r) => r.conlang)).toEqual(["corrected", "z"]);
  });

  it("deletes only what was ticked, and only from the absent list", () => {
    const p = plan();
    const d: Decisions = { ...emptyDecisions(), absent: { b: "delete" } };
    const { rows, deleteIds } = resolveImport(p, d);

    expect(deleteIds).toEqual(["b"]);
    expect(rows.map((r) => r.conlang)).toEqual(["corrected", "z", "no key"]);
    expect(tally(p, d).deleted).toBe(1);
  });

  it("strips the line and preview kind, neither of which the RPC takes", () => {
    const { rows } = resolveImport(plan(), emptyDecisions());
    expect(rows.every((r) => !("line" in r) && !("kind" in r))).toBe(true);
    expect(rows.every((r) => Object.keys(r).sort().join(",") === "conlang,english")).toBe(true);
  });

  /** The footer's counts and the payload have to be the same claim, or one of them lies. */
  it("tallies exactly what the payload will do", () => {
    const p = plan();
    const d: Decisions = {
      conflicts: { "I see you": "keep" },
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
