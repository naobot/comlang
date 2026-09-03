import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { subscribeToProjectTable } from "@/composables/useProjectChannel";
import type { ImportField, ImportRow } from "@/lib/lexiconImport";
import { supabase } from "@/lib/supabase";
import type { LexiconEntry } from "@/types/models";

/**
 * The lexicon: many independent records rather than one document.
 *
 * That changes both halves of how this store behaves, and the differences from
 * `phonemes.ts` / `phonotactics.ts` are deliberate rather than drift.
 *
 * **Saving is per entry.** Still explicit — nothing autosaves — but the unit is the record
 * being edited, so two people working on different words never collide and a save is not
 * a few hundred rows wide.
 *
 * **Realtime patches the list but never the open draft.** A collaborator adding a word
 * should simply appear; a lexicon you have to reload to see is a worse dictionary. Only
 * the entry open in the editor is held still, and only while it is dirty.
 */

/** The editable subset. `id` is absent while creating. */
export type EntryDraft = {
  lemma: string;
  gloss: string;
  word_class: string;
  entry_key: string;
  notes: string;
};

const emptyDraft = (): EntryDraft => ({
  lemma: "",
  gloss: "",
  word_class: "",
  entry_key: "",
  notes: "",
});

function draftOf(row: LexiconEntry): EntryDraft {
  return {
    lemma: row.lemma,
    gloss: row.gloss ?? "",
    word_class: row.word_class ?? "",
    entry_key: row.entry_key ?? "",
    notes: row.notes ?? "",
  };
}

const same = (a: EntryDraft, b: EntryDraft) =>
  a.lemma === b.lemma &&
  a.gloss === b.gloss &&
  a.word_class === b.word_class &&
  a.entry_key === b.entry_key &&
  a.notes === b.notes;

/** Blank strings are stored as null, so "cleared" and "never set" are the same value. */
const orNull = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

export const useLexiconStore = defineStore("lexicon", () => {
  // Patched live, exactly like stores/projects.ts. Keyed by id so an echo converges on
  // the same row rather than appending a duplicate.
  const byId = ref<Map<string, LexiconEntry>>(new Map());

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  /** The open entry: null when nothing is selected, "new" while creating. */
  const openId = ref<string | null>(null);
  const creating = ref(false);
  const draft = ref<EntryDraft>(emptyDraft());
  /**
   * The row the draft was opened from — what `dirty` and echo detection compare against.
   *
   * Deliberately the **row**, not a second `EntryDraft`. Holding two drafts invited
   * assigning the same object to both, which made every subsequent edit mutate the
   * baseline too and pinned `dirty` to false — the open entry then silently accepted a
   * collaborator's overwrite. Different types cannot alias.
   */
  const baseline = ref<LexiconEntry | null>(null);

  /** A collaborator's version of the open entry, held aside rather than applied. */
  const incoming = ref<LexiconEntry | null>(null);
  /** Set when someone else deletes the entry we have open. */
  const openDeletedElsewhere = ref(false);

  const entries = computed(() =>
    [...byId.value.values()].sort(
      (a, b) => a.lemma.localeCompare(b.lemma) || (a.gloss ?? "").localeCompare(b.gloss ?? ""),
    ),
  );

  const count = computed(() => byId.value.size);

  const dirty = computed(() => {
    // A brand-new pane is only dirty once something is in it, so leaving an untouched
    // "New entry" does not prompt.
    if (creating.value) return !same(draft.value, emptyDraft());
    if (!baseline.value) return false;
    return !same(draft.value, draftOf(baseline.value));
  });
  const open = computed(() => (openId.value ? (byId.value.get(openId.value) ?? null) : null));

  /** Every word class in use, for the editor's suggestion list. */
  const wordClasses = computed(() =>
    [...new Set([...byId.value.values()].map((e) => e.word_class).filter(Boolean))].sort(),
  );

  function upsert(row: LexiconEntry) {
    byId.value.set(row.id, row);

    if (row.id !== openId.value) return;

    // The open entry changed. If it matches what we opened, it is our own echo or a
    // no-op. If the draft is clean there is nothing to lose by taking theirs. Only a
    // dirty draft gets held back, because only then is there work to protect.
    if (baseline.value && same(draftOf(row), draftOf(baseline.value))) return;

    if (!dirty.value) {
      draft.value = draftOf(row);
      baseline.value = row;
      return;
    }
    incoming.value = row;
  }

  function removeRow(key: Partial<LexiconEntry>) {
    if (!key.id) return;
    byId.value.delete(key.id);
    // Deliberately not clearing the pane: whatever is typed there is still work, and it
    // can be saved again as a new entry. Say what happened instead.
    if (key.id === openId.value) openDeletedElsewhere.value = true;
  }

  async function fetchFor(projectId: string) {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: queryError } = await supabase
        .from("lexicon_entries")
        .select("*")
        .eq("project_id", projectId);

      if (queryError) {
        error.value = queryError.message;
        return;
      }
      byId.value = new Map((data ?? []).map((row) => [row.id, row]));

      // Re-seed the open entry only when it is clean; a fetch must not overwrite an edit.
      const current = openId.value ? byId.value.get(openId.value) : null;
      if (current && !dirty.value) {
        draft.value = draftOf(current);
        baseline.value = current;
      }
    } finally {
      loading.value = false;
    }
  }

  function select(id: string) {
    const row = byId.value.get(id);
    if (!row) return;
    openId.value = id;
    creating.value = false;
    incoming.value = null;
    openDeletedElsewhere.value = false;
    draft.value = draftOf(row);
    baseline.value = row;
    error.value = null;
  }

  function startNew(lemma = "") {
    openId.value = null;
    creating.value = true;
    incoming.value = null;
    openDeletedElsewhere.value = false;
    draft.value = { ...emptyDraft(), lemma };
    baseline.value = null;
    error.value = null;
  }

  function close() {
    openId.value = null;
    creating.value = false;
    incoming.value = null;
    openDeletedElsewhere.value = false;
    draft.value = emptyDraft();
    baseline.value = null;
  }

  function discard() {
    if (creating.value) return close();
    const row = openId.value ? byId.value.get(openId.value) : null;
    if (row) {
      draft.value = draftOf(row);
      baseline.value = row;
    }
    incoming.value = null;
  }

  /** Replace the draft with the collaborator's version. */
  function acceptIncoming() {
    if (!incoming.value) return;
    draft.value = draftOf(incoming.value);
    baseline.value = incoming.value;
    incoming.value = null;
  }

  const payload = () => ({
    lemma: draft.value.lemma.trim(),
    gloss: orNull(draft.value.gloss),
    word_class: orNull(draft.value.word_class),
    entry_key: orNull(draft.value.entry_key),
    notes: orNull(draft.value.notes),
  });

  async function saveOpen(projectId: string) {
    if (!draft.value.lemma.trim()) {
      error.value = "A lemma is required.";
      return false;
    }
    saving.value = true;
    error.value = null;
    try {
      if (creating.value || openId.value === null) {
        const { data, error: insertError } = await supabase
          .from("lexicon_entries")
          .insert({ project_id: projectId, ...payload() })
          .select()
          .single();

        if (insertError) {
          error.value = describe(insertError.message, draft.value.entry_key);
          return false;
        }
        byId.value.set(data.id, data);
        select(data.id);
        return true;
      }

      const { data, error: updateError } = await supabase
        .from("lexicon_entries")
        .update(payload())
        .eq("id", openId.value)
        .select()
        .maybeSingle();

      if (updateError) {
        error.value = describe(updateError.message, draft.value.entry_key);
        return false;
      }
      // RLS filters rows rather than raising, so a blocked update matches nothing and
      // returns null. Without this check it would look like a success.
      if (!data) {
        error.value = "That entry no longer exists, or you don't have access to it.";
        return false;
      }
      byId.value.set(data.id, data);
      draft.value = draftOf(data);
      baseline.value = data;
      incoming.value = null;
      return true;
    } finally {
      saving.value = false;
    }
  }

  async function remove(id: string) {
    error.value = null;
    const { error: deleteError } = await supabase.from("lexicon_entries").delete().eq("id", id);
    if (deleteError) {
      error.value = deleteError.message;
      return false;
    }
    byId.value.delete(id);
    if (openId.value === id) close();
    return true;
  }

  /** The partial unique index is the one error a user can actually act on. */
  function describe(message: string, key: string) {
    if (message.includes("lexicon_entries_key_idx")) {
      return `Another entry already uses the key "${key.trim()}".`;
    }
    return message;
  }

  /** The same translation where there is no one key to name — an import is many rows. */
  function describeKeyClash(message: string) {
    if (message.includes("lexicon_entries_key_idx")) {
      return "Two entries would end up sharing a key. Nothing was imported.";
    }
    return message;
  }

  /**
   * Insert one entry **without opening it**, for callers outside the lexicon page.
   *
   * The phonotactics page's sample output adds a generated word this way. It cannot go
   * through `startCreating` + `saveOpen`: those move the editor's single open draft, so
   * adding a word from another tab would silently discard an unsaved entry someone left
   * open on the lexicon page.
   *
   * For the same reason it does not touch `error` — that ref is rendered by the lexicon's
   * own pane, and a failure here belongs to the dialog that asked for the write. The new
   * row is put into `byId` so the list is right immediately; realtime would deliver it
   * anyway, but not before the caller wants to say what happened.
   */
  async function createEntry(projectId: string, entry: EntryDraft) {
    const lemma = entry.lemma.trim();
    if (!lemma) return { ok: false as const, error: "A lemma is required." };

    const { data, error: insertError } = await supabase
      .from("lexicon_entries")
      .insert({
        project_id: projectId,
        lemma,
        gloss: orNull(entry.gloss),
        word_class: orNull(entry.word_class),
        entry_key: orNull(entry.entry_key),
        notes: orNull(entry.notes),
      })
      .select()
      .single();

    if (insertError) {
      return { ok: false as const, error: describe(insertError.message, entry.entry_key) };
    }
    byId.value.set(data.id, data);
    return { ok: true as const, entry: data };
  }

  /**
   * Apply a parsed CSV.
   *
   * Goes through `import_lexicon` rather than looping inserts here: it is one act over many
   * rows, and a file half-applied is worse than one refused. `fields` is which columns the
   * file carried, and the RPC writes only those — the two-column export has no gloss
   * column, and treating its absence as "clear it" would empty every gloss in the project.
   *
   * `deleteIds` are entries the user ticked in the review dialog, one at a time, having
   * been shown each of them. The RPC still infers nothing from absence — an import that is
   * simply a partial file goes on deleting nothing at all.
   *
   * The re-fetch afterwards is not optional. This is the one write the store cannot patch
   * from its own return value: the RPC reports counts, not rows.
   */
  async function importRows(
    projectId: string,
    rows: ImportRow[],
    fields: ImportField[],
    deleteIds: string[] = [],
  ) {
    saving.value = true;
    error.value = null;
    try {
      const { data, error: rpcError } = await supabase.rpc("import_lexicon", {
        p_project_id: projectId,
        p_rows: rows,
        p_fields: fields,
        p_delete_ids: deleteIds,
      });
      if (rpcError) {
        // The same translation the single-entry saves get: the partial unique index is the
        // one failure here a user can actually act on, and its raw message names an index.
        error.value = describeKeyClash(rpcError.message);
        return null;
      }
      await fetchFor(projectId);
      const result = (data ?? {}) as { created?: number; updated?: number; deleted?: number };
      return {
        created: result.created ?? 0,
        updated: result.updated ?? 0,
        deleted: result.deleted ?? 0,
      };
    } finally {
      saving.value = false;
    }
  }

  let unsubscribe: (() => void) | null = null;
  let subscribedTo: string | null = null;

  function subscribe(projectId: string) {
    if (subscribedTo === projectId) return;
    unsubscribeAll();
    subscribedTo = projectId;

    unsubscribe = subscribeToProjectTable<LexiconEntry>("lexicon_entries", projectId, {
      onInsert: upsert,
      onUpdate: upsert,
      onDelete: removeRow,
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
    close();
    error.value = null;
  }

  return {
    entries,
    count,
    wordClasses,
    loading,
    saving,
    error,
    openId,
    creating,
    draft,
    dirty,
    open,
    incoming,
    openDeletedElsewhere,
    fetchFor,
    select,
    startNew,
    close,
    discard,
    acceptIncoming,
    saveOpen,
    createEntry,
    remove,
    importRows,
    subscribe,
    unsubscribeAll,
    reset,
  };
});
