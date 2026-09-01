import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { subscribeToProjectTable } from "@/composables/useProjectChannel";
import { PHONE_BY_IPA, PHONE_ORDER } from "@/data/ipa";
import { supabase } from "@/lib/supabase";
import type { Phoneme, PhonemeKind } from "@/types/models";

/**
 * The project's phoneme inventory.
 *
 * Unlike every other store here, this one **does not apply realtime events to its
 * state**. The inventory page saves explicitly, so a collaborator's insert landing in
 * the draft would silently rewrite an edit in progress — and then get written back on
 * Save as though the user had chosen it. Events set a flag; the user decides.
 */
export const usePhonemesStore = defineStore("phonemes", () => {
  /** What the database holds, keyed by symbol. */
  const persisted = ref<Map<string, Phoneme>>(new Map());
  /** What the user has toggled. Diverges from `persisted` until Save or Discard. */
  const draft = ref<Set<string>>(new Set());

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  /** Someone else wrote to this project's inventory since we last loaded it. */
  const changedElsewhere = ref(false);

  const selected = computed(() =>
    [...draft.value].sort((a, b) => (PHONE_ORDER.get(a) ?? 0) - (PHONE_ORDER.get(b) ?? 0)),
  );
  const consonants = computed(() =>
    selected.value.filter((ipa) => PHONE_BY_IPA.get(ipa)?.kind !== "vowel"),
  );
  const vowels = computed(() =>
    selected.value.filter((ipa) => PHONE_BY_IPA.get(ipa)?.kind === "vowel"),
  );

  /** Non-empty once the inventory has been saved — what downstream pages gate on. */
  const count = computed(() => persisted.value.size);

  const dirty = computed(() => {
    if (draft.value.size !== persisted.value.size) return true;
    for (const ipa of draft.value) if (!persisted.value.has(ipa)) return true;
    return false;
  });

  function has(ipa: string) {
    return draft.value.has(ipa);
  }

  function toggle(ipa: string) {
    // Reassign rather than mutate: a Set inside a ref is not deeply reactive, so
    // add/delete alone would not re-render the chart.
    const next = new Set(draft.value);
    if (!next.delete(ipa)) next.add(ipa);
    draft.value = next;
  }

  function discard() {
    draft.value = new Set(persisted.value.keys());
  }

  function adopt(rows: Phoneme[]) {
    persisted.value = new Map(rows.map((row) => [row.ipa, row]));
    draft.value = new Set(persisted.value.keys());
    changedElsewhere.value = false;
  }

  async function fetchFor(projectId: string) {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: queryError } = await supabase
        .from("phonemes")
        .select("*")
        .eq("project_id", projectId);

      if (queryError) {
        error.value = queryError.message;
        return;
      }
      adopt(data ?? []);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Ids this client just wrote, consumed as their echoes arrive.
   *
   * Without this, saving would raise the "changed by someone else" banner against your
   * own save — the writer receives events for its own writes like anyone else.
   */
  const ownWrites = new Set<string>();

  async function save(projectId: string) {
    saving.value = true;
    error.value = null;
    try {
      const payload: { ipa: string; kind: PhonemeKind }[] = [...draft.value].map((ipa) => ({
        ipa,
        kind: PHONE_BY_IPA.get(ipa)?.kind ?? "consonant",
      }));

      // Rows about to disappear: recorded before the RPC, because afterwards they are
      // gone from `persisted` and their delete events would look like someone else's.
      const before = new Set(persisted.value.keys());
      for (const [ipa, row] of persisted.value) {
        if (!draft.value.has(ipa)) ownWrites.add(row.id);
      }

      const { data, error: rpcError } = await supabase.rpc("save_phoneme_inventory", {
        p_project_id: projectId,
        p_phonemes: payload,
      });

      if (rpcError) {
        error.value = rpcError.message;
        return false;
      }

      const rows = data ?? [];
      // Only rows this save actually created. The RPC returns the whole inventory, but
      // an unchanged row emits no event, so recording its id would leave an entry that
      // never gets consumed — and would then swallow a collaborator's later delete of
      // that very row, hiding the change instead of announcing it.
      for (const row of rows) {
        if (!before.has(row.ipa)) ownWrites.add(row.id);
      }
      adopt(rows);
      return true;
    } finally {
      saving.value = false;
    }
  }

  function noteRemoteChange(id: string | undefined) {
    if (id && ownWrites.delete(id)) return; // our own echo
    changedElsewhere.value = true;
  }

  let unsubscribe: (() => void) | null = null;
  let subscribedTo: string | null = null;

  function subscribe(projectId: string) {
    if (subscribedTo === projectId) return;
    unsubscribeAll();
    subscribedTo = projectId;

    unsubscribe = subscribeToProjectTable<Phoneme>("phonemes", projectId, {
      // Note all three only flag. Nothing here touches `persisted` or `draft`.
      onInsert: (row) => noteRemoteChange(row.id),
      onUpdate: (row) => noteRemoteChange(row.id),
      // Deletes arrive unfiltered and carry only the primary key, so an id we have
      // never seen is normal — it may belong to another project entirely. Only ids we
      // recognise, or our own pending writes, say anything about this inventory.
      onDelete: (key) => {
        if (!key.id) return;
        if (ownWrites.delete(key.id)) return;
        for (const row of persisted.value.values()) {
          if (row.id === key.id) {
            changedElsewhere.value = true;
            return;
          }
        }
      },
    });
  }

  function unsubscribeAll() {
    unsubscribe?.();
    unsubscribe = null;
    subscribedTo = null;
  }

  function reset() {
    unsubscribeAll();
    persisted.value = new Map();
    draft.value = new Set();
    error.value = null;
    changedElsewhere.value = false;
    ownWrites.clear();
  }

  return {
    selected,
    consonants,
    vowels,
    count,
    dirty,
    loading,
    saving,
    error,
    changedElsewhere,
    has,
    toggle,
    discard,
    fetchFor,
    save,
    subscribe,
    unsubscribeAll,
    reset,
  };
});
