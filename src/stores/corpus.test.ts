import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type { CorpusEntry } from "@/types/models";

/**
 * The store, not the layers either side of it.
 *
 * `corpusMerge.ts` decides what an import *should* do and `import_corpus` does it; what
 * is pinned here is the step between them — a refetch has to leave the grid showing what
 * was just written. The bug this exists for: a clean draft holds the row's old text, so
 * judging it against the row just fetched read the user's own import as an edit worth
 * protecting, left the pre-import text on screen, and then raised "changed by someone
 * else" when the realtime echo of that same import arrived.
 */

const rows: CorpusEntry[] = [];

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: rows.map((r) => ({ ...r })), error: null }),
      }),
    }),
  },
}));

/** Captured so a test can deliver a realtime event the way the channel would. */
let handlers: { onUpdate?: (row: CorpusEntry) => void } = {};

vi.mock("@/composables/useProjectChannel", () => ({
  subscribeToProjectTable: (_table: string, _id: string, hooks: typeof handlers) => {
    handlers = hooks;
    return () => {};
  },
}));

const { useCorpusStore } = await import("./corpus");

const entry = (over: Partial<CorpusEntry> & { id: string }): CorpusEntry => ({
  project_id: "p1",
  english: "",
  conlang: "",
  kind: "utterance",
  sort_order: 0,
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  ...over,
});

const setStored = (next: CorpusEntry[]) => rows.splice(0, rows.length, ...next);

describe("corpus store refetch", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("shows the imported text on a row the client had only read", async () => {
    setStored([entry({ id: "a", english: "the dog runs", conlang: "old" })]);
    const store = useCorpusStore();
    await store.fetchFor("p1");
    expect(store.drafts.get("a")?.conlang).toBe("old");

    // What an import's update looks like from here: the stored conlang changed, and this
    // client's draft still holds the version it was shown before.
    setStored([entry({ id: "a", english: "the dog runs", conlang: "imported" })]);
    await store.fetchFor("p1");

    expect(store.drafts.get("a")?.conlang).toBe("imported");
    expect(store.isDirty("a")).toBe(false);
    expect(store.incoming.has("a")).toBe(false);
  });

  it("does not banner when the realtime echo of that import arrives", async () => {
    setStored([entry({ id: "a", english: "the dog runs", conlang: "old" })]);
    const store = useCorpusStore();
    await store.fetchFor("p1");

    store.subscribe("p1");

    setStored([entry({ id: "a", english: "the dog runs", conlang: "imported" })]);
    await store.fetchFor("p1");
    handlers.onUpdate?.(entry({ id: "a", english: "the dog runs", conlang: "imported" }));

    expect(store.incoming.has("a")).toBe(false);
    expect(store.drafts.get("a")?.conlang).toBe("imported");
  });

  it("still keeps an edit in progress across a refetch", async () => {
    setStored([entry({ id: "a", english: "the dog runs", conlang: "old" })]);
    const store = useCorpusStore();
    await store.fetchFor("p1");
    store.drafts.get("a")!.conlang = "half-typed";

    setStored([entry({ id: "a", english: "the dog runs", conlang: "imported" })]);
    await store.fetchFor("p1");

    expect(store.drafts.get("a")?.conlang).toBe("half-typed");
    expect(store.isDirty("a")).toBe(true);
  });
});
