import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { subscribeToProjectTable } from "@/composables/useProjectChannel";
import type { CorpusRow } from "@/lib/corpusImport";
import { supabase } from "@/lib/supabase";
import type { CorpusEntry, CorpusKind } from "@/types/models";

/**
 * The corpus: examples of the language in use, English beside conlang.
 *
 * Two sub-views over one table (0025): **passages** — conversations, paragraphs, anything
 * with more than one sentence in it — and **utterances**, the single-sentence grid. `kind`
 * says which, and it is stored rather than derived from the text: a passage starts empty
 * and is typed into, so a rule reading the text would move the row out of the view it is
 * being written in. Everything else — the draft-per-row model, the realtime handling, the
 * CSV — is common to both, and the export carries the whole corpus as one file either way.
 *
 * Closest in shape to `lexicon.ts` — many independent records, saved one at a time,
 * with realtime patching the list — and different from it in one way that follows from
 * the UI being a spreadsheet rather than a detail pane: **every visible row has a draft**,
 * not just the one that is open. So the protections the lexicon applies to a single entry
 * are applied per row here.
 *
 * The `baseline` lesson from the lexicon holds and is what makes that safe: a draft and
 * the thing it is compared against must never be the same object. Here the baseline for
 * row X is `byId.get(X)` — the row itself, a different type from its draft, so they
 * cannot alias no matter how the maps are assigned.
 */

export type CorpusDraft = { english: string; conlang: string };

/** A new row that has not been inserted yet. It knows which view it was started in. */
export type PendingEntry = CorpusDraft & { kind: CorpusKind };

const draftOf = (row: CorpusEntry): CorpusDraft => ({
  english: row.english,
  conlang: row.conlang,
});

const same = (a: CorpusDraft, b: CorpusDraft) => a.english === b.english && a.conlang === b.conlang;

const blank = (d: CorpusDraft) => d.english.trim() === "" && d.conlang.trim() === "";

export const useCorpusStore = defineStore("corpus", () => {
  const byId = ref<Map<string, CorpusEntry>>(new Map());
  /**
   * One edit buffer per stored row, keyed by id.
   *
   * The invariant the view relies on: every id in `byId` has an entry here. `fetchFor` and
   * `upsert` are the only two places a row arrives, and both set the pair together — which
   * is what lets the template read a draft rather than call something that would create
   * one, since creating one during render is a write to the store mid-render.
   */
  const drafts = ref<Map<string, CorpusDraft>>(new Map());
  /** A collaborator's version of a row whose draft is dirty — held, never applied. */
  const incoming = ref<Map<string, CorpusEntry>>(new Map());

  /**
   * The unsaved new row at the top of the grid, or null when there isn't one.
   *
   * Local rather than an immediately-inserted blank row, because the table's check
   * constraint rejects a row that is empty on both sides — which is exactly what a new
   * row starts as.
   */
  const pending = ref<PendingEntry | null>(null);

  const loading = ref(false);
  const savingIds = ref<Set<string>>(new Set());
  const savingNew = ref(false);
  const error = ref<string | null>(null);

  /** Spreadsheet order: as entered, and as an import laid them down. */
  const entries = computed(() =>
    [...byId.value.values()].sort(
      (a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
    ),
  );

  const count = computed(() => byId.value.size);

  /** The two sub-views. Sorted the same way; they are one sequence, filtered. */
  const ofKind = (kind: CorpusKind) => entries.value.filter((e) => e.kind === kind);
  const passages = computed(() => ofKind("passage"));
  const utterances = computed(() => ofKind("utterance"));

  /**
   * One sub-view, searched. Filtered on the client over rows that are already loaded, as
   * in the lexicon: a corpus runs to a few hundred examples and a round trip per keystroke
   * would be strictly worse. Both sides are searched, because you look an example up by
   * whichever one you know.
   *
   * It lives here rather than in the two list components so that the toolbar's count and
   * the list below it cannot disagree about what is showing.
   */
  function matching(kind: CorpusKind, query: string) {
    const q = query.trim().toLowerCase();
    const rows = kind === "passage" ? passages.value : utterances.value;
    if (!q) return rows;
    return rows.filter((e) => `${e.english} ${e.conlang}`.toLowerCase().includes(q));
  }

  function isDirty(id: string): boolean {
    const row = byId.value.get(id);
    const draft = drafts.value.get(id);
    if (!row || !draft) return false;
    return !same(draft, draftOf(row));
  }

  /** Anything unsaved anywhere in the grid, for the navigation guard. */
  const dirty = computed(() => {
    if (pending.value && !blank(pending.value)) return true;
    return [...drafts.value.keys()].some(isDirty);
  });

  function upsert(row: CorpusEntry) {
    // Captured before the map is overwritten: this is the baseline the draft was taken
    // from, and it is what makes "did *this* client change it?" answerable.
    const previous = byId.value.get(row.id);
    byId.value.set(row.id, row);

    const draft = drafts.value.get(row.id);
    if (!draft) {
      drafts.value.set(row.id, draftOf(row));
      return;
    }

    // Already what we hold: our own echo, or someone saving what was already there.
    if (same(draft, draftOf(row))) {
      incoming.value.delete(row.id);
      return;
    }

    // Clean against the version we started from, so there is nothing to lose by taking
    // theirs. Only a genuinely edited cell is held back.
    if (previous && same(draft, draftOf(previous))) {
      drafts.value.set(row.id, draftOf(row));
      incoming.value.delete(row.id);
      return;
    }

    incoming.value.set(row.id, row);
  }

  function dropRow(key: Partial<CorpusEntry>) {
    // Unfiltered, un-RLS-checked, and carrying only the primary key: an id we do not
    // hold must stay a silent no-op. See useProjectChannel.
    if (!key.id) return;
    byId.value.delete(key.id);
    drafts.value.delete(key.id);
    incoming.value.delete(key.id);
  }

  async function fetchFor(projectId: string) {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: queryError } = await supabase
        .from("corpus_entries")
        .select("*")
        .eq("project_id", projectId);

      if (queryError) {
        error.value = queryError.message;
        return;
      }

      const rows = data ?? [];
      byId.value = new Map(rows.map((row) => [row.id, row]));

      // A refetch must not discard an edit in progress. Rows that are clean (or that this
      // client has never touched) take the fetched value; dirty ones keep their draft.
      const next = new Map<string, CorpusDraft>();
      for (const row of rows) {
        const draft = drafts.value.get(row.id);
        next.set(row.id, draft && !same(draft, draftOf(row)) ? draft : draftOf(row));
      }
      drafts.value = next;
      // Held versions that no longer differ are stale.
      for (const [id, row] of incoming.value) {
        const draft = drafts.value.get(id);
        if (!draft || same(draft, draftOf(row))) incoming.value.delete(id);
      }
    } finally {
      loading.value = false;
    }
  }

  function startNew(kind: CorpusKind) {
    pending.value ??= { english: "", conlang: "", kind };
  }

  function cancelNew() {
    pending.value = null;
  }

  function revert(id: string) {
    const row = byId.value.get(id);
    if (row) drafts.value.set(id, draftOf(row));
    incoming.value.delete(id);
  }

  /** Take the collaborator's version of a held row. */
  function acceptIncoming(id: string) {
    const row = incoming.value.get(id);
    if (!row) return;
    drafts.value.set(id, draftOf(row));
    incoming.value.delete(id);
  }

  async function saveNew(projectId: string) {
    const draft = pending.value;
    if (!draft) return false;
    if (blank(draft)) {
      error.value = "An example needs text on at least one side.";
      return false;
    }

    savingNew.value = true;
    error.value = null;
    try {
      // Appended at the end of the grid. Read from what is loaded rather than from the
      // database: an exact value does not matter, only that it sorts last here.
      const next = entries.value.reduce((max, e) => Math.max(max, e.sort_order), -1) + 1;
      const { data, error: insertError } = await supabase
        .from("corpus_entries")
        .insert({
          project_id: projectId,
          english: draft.english.trim(),
          conlang: draft.conlang.trim(),
          sort_order: next,
          kind: draft.kind,
        })
        .select()
        .single();

      if (insertError) {
        error.value = insertError.message;
        return false;
      }
      byId.value.set(data.id, data);
      drafts.value.set(data.id, draftOf(data));
      pending.value = null;
      return true;
    } finally {
      savingNew.value = false;
    }
  }

  async function saveRow(id: string) {
    const draft = drafts.value.get(id);
    if (!draft) return false;
    if (blank(draft)) {
      error.value = "An example needs text on at least one side. Delete the row instead.";
      return false;
    }

    savingIds.value = new Set(savingIds.value).add(id);
    error.value = null;
    try {
      const { data, error: updateError } = await supabase
        .from("corpus_entries")
        .update({ english: draft.english.trim(), conlang: draft.conlang.trim() })
        .eq("id", id)
        .select()
        .maybeSingle();

      if (updateError) {
        error.value = updateError.message;
        return false;
      }
      // RLS filters rows rather than raising, so a blocked update matches nothing and
      // returns null. Without this check a denied save looks exactly like a successful one.
      if (!data) {
        error.value = "That example no longer exists, or you don't have access to it.";
        return false;
      }
      byId.value.set(id, data);
      drafts.value.set(id, draftOf(data));
      incoming.value.delete(id);
      return true;
    } finally {
      const next = new Set(savingIds.value);
      next.delete(id);
      savingIds.value = next;
    }
  }

  /**
   * Move a row to the other sub-view.
   *
   * A separate action rather than something the row editor writes, because it is not an
   * edit to the text: it takes effect at once, with no Save, and it is the correction for
   * an import's guess or for a note that turned out to be a conversation. The draft is
   * left exactly as it is — moving a row must not discard what is being typed into it.
   */
  async function setKind(id: string, kind: CorpusKind) {
    error.value = null;
    const { data, error: updateError } = await supabase
      .from("corpus_entries")
      .update({ kind })
      .eq("id", id)
      .select()
      .maybeSingle();

    if (updateError) {
      error.value = updateError.message;
      return false;
    }
    // RLS filters rather than raising, so a blocked update returns null rather than an
    // error — the same check `saveRow` makes, for the same reason.
    if (!data) {
      error.value = "That example no longer exists, or you don't have access to it.";
      return false;
    }
    byId.value.set(id, data);
    return true;
  }

  async function remove(id: string) {
    error.value = null;
    const { error: deleteError } = await supabase.from("corpus_entries").delete().eq("id", id);
    if (deleteError) {
      error.value = deleteError.message;
      return false;
    }
    dropRow({ id });
    return true;
  }

  /**
   * Apply a parsed CSV.
   *
   * Through `import_corpus` rather than a loop of inserts, for the reason `import_lexicon`
   * exists: an import is one act over many rows, and a file half-applied is worse than one
   * refused. The RPC only ever inserts — there is no key column in this format, so nothing
   * in a file can identify a row to change — and it reports counts rather than rows, which
   * is why the refetch afterwards is not optional.
   */
  async function importRows(projectId: string, rows: CorpusRow[]) {
    savingNew.value = true;
    error.value = null;
    try {
      const { data, error: rpcError } = await supabase.rpc("import_corpus", {
        p_project_id: projectId,
        p_rows: rows,
      });
      if (rpcError) {
        error.value = rpcError.message;
        return null;
      }
      await fetchFor(projectId);
      // `passages` is what the RPC inferred from the shape of each row; the client's own
      // `planCorpusImport` predicts the same split, and this is the count that actually
      // landed.
      const result = (data ?? {}) as { created?: number; skipped?: number; passages?: number };
      return {
        created: result.created ?? 0,
        skipped: result.skipped ?? 0,
        passages: result.passages ?? 0,
      };
    } finally {
      savingNew.value = false;
    }
  }

  let unsubscribe: (() => void) | null = null;
  let subscribedTo: string | null = null;

  function subscribe(projectId: string) {
    if (subscribedTo === projectId) return;
    unsubscribeAll();
    subscribedTo = projectId;

    unsubscribe = subscribeToProjectTable<CorpusEntry>("corpus_entries", projectId, {
      onInsert: upsert,
      onUpdate: upsert,
      onDelete: dropRow,
    });
  }

  function unsubscribeAll() {
    unsubscribe?.();
    unsubscribe = null;
    subscribedTo = null;
  }

  function reset() {
    unsubscribeAll();
    byId.value = new Map();
    drafts.value = new Map();
    incoming.value = new Map();
    pending.value = null;
    error.value = null;
  }

  return {
    entries,
    passages,
    utterances,
    matching,
    count,
    drafts,
    incoming,
    pending,
    loading,
    savingIds,
    savingNew,
    error,
    dirty,
    isDirty,
    fetchFor,
    startNew,
    cancelNew,
    revert,
    acceptIncoming,
    saveNew,
    saveRow,
    setKind,
    remove,
    importRows,
    subscribe,
    unsubscribeAll,
    reset,
  };
});
