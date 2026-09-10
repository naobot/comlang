import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { subscribeToProjectTable } from "@/composables/useProjectChannel";
import { canonicalDraft, cloneDraft, draftProblems, type Draft } from "@/lib/orthography";
import { supabase } from "@/lib/supabase";
import type { OrthographyGrapheme, OrthographyRule } from "@/types/models";

/**
 * Orthography: a mapping from phoneme to written character, plus an ordered list of
 * free-text spelling rules. Whole-page explicit save, like phonotactics and grammar
 * rules — re-exports the Draft* types from the pure module because this is where callers
 * expect them.
 */
export type { Draft, DraftGrapheme, DraftRule } from "@/lib/orthography";

const emptyDraft = (): Draft => ({ graphemes: [], rules: [] });

const emptyRule = (name = "") => ({
  name,
  summary: "",
  effect: "",
  examples: "",
});

export const useOrthographyStore = defineStore("orthography", () => {
  const persisted = ref<Draft>(emptyDraft());
  const draft = ref<Draft>(emptyDraft());

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const changedElsewhere = ref(false);
  /** A collaborator's version, held aside so "load theirs" is not a round trip. */
  let incoming: Draft | null = null;

  const dirty = computed(() => canonicalDraft(draft.value) !== canonicalDraft(persisted.value));

  function adopt(next: Draft) {
    persisted.value = cloneDraft(next);
    draft.value = cloneDraft(next);
    changedElsewhere.value = false;
    incoming = null;
  }

  async function readAll(projectId: string): Promise<Draft | null> {
    const [graphemesRes, rulesRes] = await Promise.all([
      supabase.from("orthography_graphemes").select("*").eq("project_id", projectId),
      supabase
        .from("orthography_rules")
        .select("*")
        .eq("project_id", projectId)
        .order("rule_order"),
    ]);

    if (graphemesRes.error) {
      error.value = graphemesRes.error.message;
      return null;
    }
    if (rulesRes.error) {
      error.value = rulesRes.error.message;
      return null;
    }

    return {
      graphemes: (graphemesRes.data as OrthographyGrapheme[]).map((g) => ({
        phoneme_ipa: g.phoneme_ipa,
        grapheme: g.grapheme,
      })),
      rules: (rulesRes.data as OrthographyRule[]).map((r) => ({
        name: r.name,
        summary: r.summary ?? "",
        effect: r.effect ?? "",
        examples: r.examples ?? "",
      })),
    };
  }

  async function fetchFor(projectId: string) {
    loading.value = true;
    error.value = null;
    try {
      const next = await readAll(projectId);
      if (next) adopt(next);
    } finally {
      loading.value = false;
    }
  }

  async function save(projectId: string) {
    const problems = draftProblems(draft.value);
    if (problems.length) {
      error.value = problems.join(" ");
      return false;
    }

    saving.value = true;
    error.value = null;
    try {
      const payload = cloneDraft(draft.value);
      const { error: rpcError } = await supabase.rpc("save_orthography", {
        p_project_id: projectId,
        p_graphemes: payload.graphemes,
        p_rules: payload.rules.map((r) => ({ ...r, name: r.name.trim() })),
      });
      if (rpcError) {
        error.value = rpcError.message;
        return false;
      }
      // Read back rather than trusting the payload: the RPC normalises blanks to null and
      // rewrites rule_order from position.
      const next = await readAll(projectId);
      adopt(next ?? payload);
      return true;
    } finally {
      saving.value = false;
    }
  }

  function discard() {
    draft.value = cloneDraft(persisted.value);
    incoming = null;
    changedElsewhere.value = false;
  }

  function acceptIncoming() {
    if (incoming) adopt(incoming);
    else changedElsewhere.value = false;
  }

  // Editing -----------------------------------------------------------------------------

  /** Sets or clears a phoneme's grapheme. A blank value drops the row on save. */
  function setGrapheme(phonemeIpa: string, grapheme: string) {
    const existing = draft.value.graphemes.find((g) => g.phoneme_ipa === phonemeIpa);
    if (existing) existing.grapheme = grapheme;
    else draft.value.graphemes.push({ phoneme_ipa: phonemeIpa, grapheme });
  }

  function graphemeFor(phonemeIpa: string): string {
    return draft.value.graphemes.find((g) => g.phoneme_ipa === phonemeIpa)?.grapheme ?? "";
  }

  function addRule(name = "") {
    draft.value.rules.push(emptyRule(name));
  }

  function removeRuleAt(index: number) {
    draft.value.rules.splice(index, 1);
  }

  /** Order may carry meaning, so moving a rule is a substantive edit, not a view preference. */
  function moveRule(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= draft.value.rules.length) return;
    const [rule] = draft.value.rules.splice(index, 1);
    if (rule) draft.value.rules.splice(target, 0, rule);
  }

  // Realtime: notify, never patch ------------------------------------------------------

  const WATCHED = ["orthography_graphemes", "orthography_rules"] as const;

  let unsubscribes: (() => void)[] = [];
  let subscribedTo: string | null = null;
  let compareTimer: ReturnType<typeof setTimeout> | null = null;

  /** Re-fetch and compare, as phonotactics and grammar rules do: a whole-page save emits
   *  one event per row across two tables, and comparing is provably right where counting
   *  them is not. */
  function scheduleCompare(projectId: string) {
    if (compareTimer) clearTimeout(compareTimer);
    compareTimer = setTimeout(() => {
      void (async () => {
        const next = await readAll(projectId);
        if (!next) return;
        if (canonicalDraft(next) === canonicalDraft(persisted.value)) return; // our own echo
        incoming = next;
        changedElsewhere.value = true;
      })();
    }, 400);
  }

  function subscribe(projectId: string) {
    if (subscribedTo === projectId) return;
    unsubscribeAll();
    subscribedTo = projectId;

    unsubscribes = WATCHED.map((table) =>
      subscribeToProjectTable<OrthographyGrapheme | OrthographyRule>(table, projectId, {
        onInsert: () => scheduleCompare(projectId),
        onUpdate: () => scheduleCompare(projectId),
        onDelete: () => scheduleCompare(projectId),
      }),
    );
  }

  function unsubscribeAll() {
    if (compareTimer) clearTimeout(compareTimer);
    compareTimer = null;
    for (const unsubscribe of unsubscribes) unsubscribe();
    unsubscribes = [];
    subscribedTo = null;
  }

  function reset() {
    unsubscribeAll();
    persisted.value = emptyDraft();
    draft.value = emptyDraft();
    error.value = null;
    changedElsewhere.value = false;
    incoming = null;
  }

  return {
    persisted,
    draft,
    dirty,
    loading,
    saving,
    error,
    changedElsewhere,
    fetchFor,
    save,
    discard,
    acceptIncoming,
    setGrapheme,
    graphemeFor,
    addRule,
    removeRuleAt,
    moveRule,
    subscribe,
    unsubscribeAll,
    reset,
  };
});
