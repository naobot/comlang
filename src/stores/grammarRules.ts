import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { subscribeToProjectTable } from "@/composables/useProjectChannel";
import { supabase } from "@/lib/supabase";
import type { GrammarRule } from "@/types/models";

/**
 * Grammar rules: an **ordered** list, free text apart from the name.
 *
 * Whole-page explicit save, like phonotactics rather than like the lexicon. Reordering is
 * inherently multi-row, so a per-rule save could leave the pipeline half-permuted — and
 * the order is the part that carries meaning, since a rule feeds the ones after it.
 */

export type DraftRule = {
  name: string;
  effect: string;
  environment: string;
  examples: string;
  notes: string;
};

const emptyRule = (name = ""): DraftRule => ({
  name,
  effect: "",
  environment: "",
  examples: "",
  notes: "",
});

const draftOf = (row: GrammarRule): DraftRule => ({
  name: row.name,
  effect: row.effect ?? "",
  environment: row.environment ?? "",
  examples: row.examples ?? "",
  notes: row.notes ?? "",
});

/** Position is significant, so this is order-sensitive — unlike the phonotactics one. */
const canonical = (rules: DraftRule[]) => JSON.stringify(rules);

const clone = (rules: DraftRule[]): DraftRule[] => rules.map((r) => ({ ...r }));

export const useGrammarRulesStore = defineStore("grammarRules", () => {
  const persisted = ref<DraftRule[]>([]);
  const draft = ref<DraftRule[]>([]);

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const changedElsewhere = ref(false);
  /** A collaborator's version, held aside so "load theirs" is not a round trip. */
  let incoming: DraftRule[] | null = null;

  const dirty = computed(() => canonical(draft.value) !== canonical(persisted.value));
  const count = computed(() => persisted.value.length);

  function adopt(rules: DraftRule[]) {
    persisted.value = clone(rules);
    draft.value = clone(rules);
    changedElsewhere.value = false;
    incoming = null;
  }

  async function read(projectId: string): Promise<DraftRule[] | null> {
    const { data, error: queryError } = await supabase
      .from("grammar_rules")
      .select("*")
      .eq("project_id", projectId)
      .order("rule_order");

    if (queryError) {
      error.value = queryError.message;
      return null;
    }
    return (data ?? []).map(draftOf);
  }

  async function fetchFor(projectId: string) {
    loading.value = true;
    error.value = null;
    try {
      const rules = await read(projectId);
      if (rules) adopt(rules);
    } finally {
      loading.value = false;
    }
  }

  async function save(projectId: string) {
    const named = draft.value.filter((r) => r.name.trim());
    if (named.length !== draft.value.length) {
      error.value = "Every rule needs a name.";
      return false;
    }
    const names = named.map((r) => r.name.trim());
    if (new Set(names).size !== names.length) {
      // The database would reject this on the unique index, but the message it gives is
      // not one a user can act on.
      error.value = "Two rules have the same name.";
      return false;
    }

    saving.value = true;
    error.value = null;
    try {
      const payload = named.map((r) => ({ ...r, name: r.name.trim() }));
      const { error: rpcError } = await supabase.rpc("save_grammar_rules", {
        p_project_id: projectId,
        p_rules: payload,
      });
      if (rpcError) {
        error.value = rpcError.message;
        return false;
      }
      // Read back rather than assuming: the RPC normalises blanks to null and rewrites
      // rule_order from position.
      const rules = await read(projectId);
      adopt(rules ?? payload);
      return true;
    } finally {
      saving.value = false;
    }
  }

  function discard() {
    draft.value = clone(persisted.value);
    incoming = null;
    changedElsewhere.value = false;
  }

  function acceptIncoming() {
    if (incoming) adopt(incoming);
    else changedElsewhere.value = false;
  }

  // Editing ---------------------------------------------------------------------------

  function add(name = "") {
    draft.value.push(emptyRule(name));
  }

  function removeAt(index: number) {
    draft.value.splice(index, 1);
  }

  /** Order is the pipeline, so moving a rule is a substantive edit, not a view preference. */
  function move(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= draft.value.length) return;
    const [rule] = draft.value.splice(index, 1);
    if (rule) draft.value.splice(target, 0, rule);
  }

  // Realtime: notify, never patch ------------------------------------------------------

  let unsubscribe: (() => void) | null = null;
  let subscribedTo: string | null = null;
  let compareTimer: ReturnType<typeof setTimeout> | null = null;

  /** Re-fetch and compare, as in phonotactics: a whole-page save emits one event per
   *  row, and comparing is provably right where counting them is not. */
  function scheduleCompare(projectId: string) {
    if (compareTimer) clearTimeout(compareTimer);
    compareTimer = setTimeout(() => {
      void (async () => {
        const rules = await read(projectId);
        if (!rules) return;
        if (canonical(rules) === canonical(persisted.value)) return; // our own echo
        incoming = rules;
        changedElsewhere.value = true;
      })();
    }, 400);
  }

  function subscribe(projectId: string) {
    if (subscribedTo === projectId) return;
    unsubscribeAll();
    subscribedTo = projectId;

    unsubscribe = subscribeToProjectTable<GrammarRule>("grammar_rules", projectId, {
      onInsert: () => scheduleCompare(projectId),
      onUpdate: () => scheduleCompare(projectId),
      onDelete: () => scheduleCompare(projectId),
    });
  }

  function unsubscribeAll() {
    if (compareTimer) clearTimeout(compareTimer);
    compareTimer = null;
    unsubscribe?.();
    unsubscribe = null;
    subscribedTo = null;
  }

  function reset() {
    unsubscribeAll();
    persisted.value = [];
    draft.value = [];
    error.value = null;
    changedElsewhere.value = false;
    incoming = null;
  }

  return {
    draft,
    count,
    dirty,
    loading,
    saving,
    error,
    changedElsewhere,
    fetchFor,
    save,
    discard,
    acceptIncoming,
    add,
    removeAt,
    move,
    subscribe,
    unsubscribeAll,
    reset,
  };
});
