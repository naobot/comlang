import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { subscribeToProjectTable } from "@/composables/useProjectChannel";
import type { CorpusRow } from "@/lib/corpusImport";
import { supabase } from "@/lib/supabase";
import type { CorpusEntry } from "@/types/models";

/**
 * The corpus: example utterances, English beside conlang, edited as a grid.
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
  const pending = ref<CorpusDraft | null>(null);

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

  function startNew() {
    pending.value ??= { english: "", conlang: "" };
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
      const result = (data ?? {}) as { created?: number; skipped?: number };
      return { created: result.created ?? 0, skipped: result.skipped ?? 0 };
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
    remove,
    importRows,
    subscribe,
    unsubscribeAll,
    reset,
  };
});
