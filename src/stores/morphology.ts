import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { subscribeToProjectTable } from "@/composables/useProjectChannel";
import { supabase } from "@/lib/supabase";
import { type MorphologySpecDoc, parseSpec } from "@/lib/morphologySpec";
import type { Json } from "@/types/database";
import type { ProjectMorphology } from "@/types/models";

/**
 * The per-project morphology plugin — one JSON document the owner authors, read by the
 * corpus word-hover recogniser (`useMorphology`).
 *
 * A single document rather than a list, so the store is simpler than word classes': the
 * edit buffer is the raw text of the editor, `persisted` is the last saved text, and
 * `dirty` compares the two after a normalising round-trip. Realtime notifies, never
 * patches — same discipline every other section follows. Owner-only writes live in RLS
 * (0029); a collaborator opening this sees the text but `save` will be refused 42501.
 */

const EMPTY = "";

/** Stable pretty form for comparison; the raw string when it will not parse. */
function normalize(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const useMorphologyStore = defineStore("morphology", () => {
  const persistedText = ref(EMPTY);
  const draftText = ref(EMPTY);

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const changedElsewhere = ref(false);
  let incomingText: string | null = null;

  const dirty = computed(() => normalize(draftText.value) !== normalize(persistedText.value));
  const isEmpty = computed(() => persistedText.value.trim() === "");

  /** The parsed, saved document — `null` when there is none or it does not parse. This is
   *  what the recogniser consumes. */
  const specDoc = computed<MorphologySpecDoc | null>(() => {
    if (persistedText.value.trim() === "") return null;
    return parseSpec(safeParse(persistedText.value)).doc;
  });

  /**
   * The two project conventions the document declares for pages other than this one: what
   * a typed `g` means in `underlying_phonology` (the lexicon editor's phonotactics check)
   * and what an `n_` entry-key prefix means (a two-column lexicon import). Both default to
   * empty, so a project that has declared nothing gets no substitution and no guessing —
   * rather than inheriting whichever conlang happened to be built first.
   */
  const inputVariants = computed(() => specDoc.value?.inputVariants ?? {});
  const entryKeyPos = computed(() => specDoc.value?.entryKeyPos ?? {});

  function adopt(text: string) {
    persistedText.value = text;
    draftText.value = text;
    changedElsewhere.value = false;
    incomingText = null;
  }

  async function read(projectId: string): Promise<string | null> {
    const { data, error: queryError } = await supabase
      .from("project_morphology")
      .select("spec")
      .eq("project_id", projectId)
      .maybeSingle();

    if (queryError) {
      error.value = queryError.message;
      return null;
    }
    if (!data || data.spec == null) return EMPTY;
    return JSON.stringify(data.spec, null, 2);
  }

  async function fetchFor(projectId: string) {
    loading.value = true;
    error.value = null;
    try {
      const text = await read(projectId);
      if (text !== null) adopt(text);
    } finally {
      loading.value = false;
    }
  }

  async function save(projectId: string) {
    error.value = null;

    let parsed: Json;
    try {
      parsed = draftText.value.trim() === "" ? {} : (JSON.parse(draftText.value) as Json);
    } catch (e) {
      error.value = `Not valid JSON: ${e instanceof Error ? e.message : String(e)}`;
      return false;
    }

    const { problems } = parseSpec(parsed);
    if (problems.length > 0) {
      error.value = problems.join(" ");
      return false;
    }

    saving.value = true;
    try {
      const { error: rpcError } = await supabase.rpc("save_morphology", {
        p_project_id: projectId,
        // A blank editor means "no plugin" — store an empty object.
        p_spec: parsed,
      });
      if (rpcError) {
        error.value = rpcError.message;
        return false;
      }
      const text = await read(projectId);
      adopt(text ?? normalize(draftText.value));
      return true;
    } finally {
      saving.value = false;
    }
  }

  function discard() {
    draftText.value = persistedText.value;
    incomingText = null;
    changedElsewhere.value = false;
  }

  function acceptIncoming() {
    if (incomingText !== null) adopt(incomingText);
    else changedElsewhere.value = false;
  }

  // Realtime: notify, never patch ----------------------------------------------------

  let unsubscribe: (() => void) | null = null;
  let subscribedTo: string | null = null;
  let compareTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleCompare(projectId: string) {
    if (compareTimer) clearTimeout(compareTimer);
    compareTimer = setTimeout(() => {
      void (async () => {
        const text = await read(projectId);
        if (text === null) return;
        if (normalize(text) === normalize(persistedText.value)) return; // our own echo
        incomingText = text;
        changedElsewhere.value = true;
      })();
    }, 400);
  }

  function subscribe(projectId: string) {
    if (subscribedTo === projectId) return;
    unsubscribeAll();
    subscribedTo = projectId;
    unsubscribe = subscribeToProjectTable<ProjectMorphology>("project_morphology", projectId, {
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
    persistedText.value = EMPTY;
    draftText.value = EMPTY;
    error.value = null;
    changedElsewhere.value = false;
    incomingText = null;
  }

  return {
    persistedText,
    draftText,
    specDoc,
    inputVariants,
    entryKeyPos,
    dirty,
    isEmpty,
    loading,
    saving,
    error,
    changedElsewhere,
    fetchFor,
    save,
    discard,
    acceptIncoming,
    subscribe,
    unsubscribeAll,
    reset,
  };
});
