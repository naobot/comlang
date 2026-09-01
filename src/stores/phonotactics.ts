import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { subscribeToProjectTable } from "@/composables/useProjectChannel";
import type { ConstraintKind, SequencePosition, SlotRole } from "@/types/models";
import type {
  Grammar,
  ResolvedClass,
  ResolvedConstraint,
  ResolvedTemplate,
  Term,
} from "@/lib/phonotactics";
import { supabase } from "@/lib/supabase";

/**
 * Phonotactics: phoneme classes, syllable templates and constraints.
 *
 * Like the phoneme inventory this page saves explicitly, so realtime **notifies but
 * never patches** — a collaborator's write landing in the draft would rewrite an edit in
 * progress and then be saved back as if the user had chosen it.
 *
 * Where this differs from `stores/phonemes.ts`: one save writes across five tables at
 * once, so identifying our own echoes by tracking row ids would be fragile. Instead any
 * event triggers a debounced re-fetch, and the result is *compared* with what we hold.
 * Different means someone else wrote; identical means it was our own echo. That is
 * provably right rather than approximately right, at the cost of one small query.
 */

// The draft shape, which is also the RPC payload. Classes and phonemes are referenced by
// `symbol` and `ipa` rather than by id, so the client never has to invent ids for rows
// it has only just created; the RPC resolves them.
export type DraftClass = {
  symbol: string;
  label: string | null;
  sort_order: number;
  phoneme_ipa: string[];
};
export type DraftSlot = {
  slot_index: number;
  role: SlotRole;
  optional: boolean;
  class_symbol: string;
};
export type DraftTemplate = {
  name: string;
  weight: number;
  sort_order: number;
  notes: string | null;
  slots: DraftSlot[];
};
export type DraftConstraint = {
  kind: ConstraintKind;
  role: SlotRole | null;
  seq_position: SequencePosition | null;
  a_class_symbol: string | null;
  a_phoneme_ipa: string | null;
  b_class_symbol: string | null;
  b_phoneme_ipa: string | null;
  note: string | null;
};
export type Draft = {
  classes: DraftClass[];
  templates: DraftTemplate[];
  constraints: DraftConstraint[];
};

const emptyDraft = (): Draft => ({ classes: [], templates: [], constraints: [] });

/** Order-insensitive within a list, so a reorder that changes nothing does not read as
 *  a change, but any real difference does. */
function canonical(draft: Draft): string {
  return JSON.stringify({
    classes: [...draft.classes]
      .map((c) => ({ ...c, phoneme_ipa: [...c.phoneme_ipa].sort() }))
      .sort((a, b) => a.symbol.localeCompare(b.symbol)),
    templates: [...draft.templates]
      .map((t) => ({ ...t, slots: [...t.slots].sort((a, b) => a.slot_index - b.slot_index) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    constraints: [...draft.constraints].map((c) => JSON.stringify(c)).sort(),
  });
}

const clone = (draft: Draft): Draft => structuredClone(draft);

export const usePhonotacticsStore = defineStore("phonotactics", () => {
  const persisted = ref<Draft>(emptyDraft());
  const draft = ref<Draft>(emptyDraft());

  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);
  const changedElsewhere = ref(false);
  /** What the collaborator's version looks like, so "Load theirs" is not a round trip. */
  let incoming: Draft | null = null;

  const dirty = computed(() => canonical(draft.value) !== canonical(persisted.value));
  const isConfigured = computed(
    () => persisted.value.classes.length > 0 || persisted.value.templates.length > 0,
  );

  function adopt(next: Draft) {
    persisted.value = clone(next);
    draft.value = clone(next);
    changedElsewhere.value = false;
    incoming = null;
  }

  async function readAll(projectId: string): Promise<Draft | null> {
    const [classes, members, templates, slots, constraints] = await Promise.all([
      supabase.from("phoneme_classes").select("*").eq("project_id", projectId),
      supabase.from("phoneme_class_members").select("*").eq("project_id", projectId),
      supabase.from("syllable_templates").select("*").eq("project_id", projectId),
      supabase.from("syllable_slots").select("*").eq("project_id", projectId),
      supabase.from("phonotactic_constraints").select("*").eq("project_id", projectId),
      // The phonemes themselves come from the phonemes store, which the workspace
      // already loads; joining them again here would be a second source of truth.
    ]);

    const failure = [classes, members, templates, slots, constraints].find((r) => r.error);
    if (failure?.error) {
      error.value = failure.error.message;
      return null;
    }

    // Resolve ids back to the symbol/ipa references the draft is written in.
    const classById = new Map((classes.data ?? []).map((c) => [c.id, c]));
    const phonemeById = new Map<string, string>();
    const { data: phonemeRows } = await supabase
      .from("phonemes")
      .select("id, ipa")
      .eq("project_id", projectId);
    for (const row of phonemeRows ?? []) phonemeById.set(row.id, row.ipa);

    const ipaFor = (classId: string) =>
      (members.data ?? [])
        .filter((m) => m.class_id === classId)
        .map((m) => phonemeById.get(m.phoneme_id))
        .filter((ipa): ipa is string => Boolean(ipa));

    return {
      classes: (classes.data ?? [])
        .sort((a, b) => a.sort_order - b.sort_order || a.symbol.localeCompare(b.symbol))
        .map((c) => ({
          symbol: c.symbol,
          label: c.label,
          sort_order: c.sort_order,
          phoneme_ipa: ipaFor(c.id),
        })),
      templates: (templates.data ?? [])
        .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
        .map((t) => ({
          name: t.name,
          weight: t.weight,
          sort_order: t.sort_order,
          notes: t.notes,
          slots: (slots.data ?? [])
            .filter((s) => s.template_id === t.id)
            .sort((a, b) => a.slot_index - b.slot_index)
            .map((s, i) => ({
              slot_index: i,
              role: s.role,
              optional: s.optional,
              class_symbol: classById.get(s.class_id)?.symbol ?? "",
            })),
        })),
      constraints: (constraints.data ?? []).map((c) => ({
        kind: c.kind,
        role: c.role,
        seq_position: c.seq_position,
        a_class_symbol: c.a_class_id ? (classById.get(c.a_class_id)?.symbol ?? null) : null,
        a_phoneme_ipa: c.a_phoneme_id ? (phonemeById.get(c.a_phoneme_id) ?? null) : null,
        b_class_symbol: c.b_class_id ? (classById.get(c.b_class_id)?.symbol ?? null) : null,
        b_phoneme_ipa: c.b_phoneme_id ? (phonemeById.get(c.b_phoneme_id) ?? null) : null,
        note: c.note,
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

  /** Replace the draft with what the collaborator saved. */
  function acceptIncoming() {
    if (incoming) adopt(incoming);
    else changedElsewhere.value = false;
  }

  async function save(projectId: string) {
    saving.value = true;
    error.value = null;
    try {
      const payload = clone(draft.value);
      const { error: rpcError } = await supabase.rpc("save_phonotactics", {
        p_project_id: projectId,
        p_payload: payload,
      });
      if (rpcError) {
        error.value = rpcError.message;
        return false;
      }
      // Read back rather than assuming: the RPC normalises (slot re-indexing, dropped
      // blank labels), and adopting the payload we sent would hide that.
      const next = await readAll(projectId);
      adopt(next ?? payload);
      return true;
    } finally {
      saving.value = false;
    }
  }

  // Realtime -------------------------------------------------------------------------

  let unsubscribers: (() => void)[] = [];
  let subscribedTo: string | null = null;
  let compareTimer: ReturnType<typeof setTimeout> | null = null;

  const WATCHED = [
    "phoneme_classes",
    "phoneme_class_members",
    "syllable_templates",
    "syllable_slots",
    "phonotactic_constraints",
  ] as const;

  /**
   * A save fires events across all five tables, so this debounces hard: one comparison
   * per burst, not one per row.
   */
  function scheduleCompare(projectId: string) {
    if (compareTimer) clearTimeout(compareTimer);
    compareTimer = setTimeout(() => {
      void (async () => {
        const next = await readAll(projectId);
        if (!next) return;
        if (canonical(next) === canonical(persisted.value)) return; // our own echo
        incoming = next;
        changedElsewhere.value = true;
      })();
    }, 400);
  }

  function subscribe(projectId: string) {
    if (subscribedTo === projectId) return;
    unsubscribeAll();
    subscribedTo = projectId;

    unsubscribers = WATCHED.map((table) =>
      subscribeToProjectTable(table, projectId, {
        // Every handler does the same thing, and none of them touches the draft.
        // Deletes arrive unfiltered and carry only a primary key, which is why the
        // response is "go and look" rather than anything derived from the payload.
        onInsert: () => scheduleCompare(projectId),
        onUpdate: () => scheduleCompare(projectId),
        onDelete: () => scheduleCompare(projectId),
      }),
    );
  }

  function unsubscribeAll() {
    if (compareTimer) clearTimeout(compareTimer);
    compareTimer = null;
    for (const off of unsubscribers) off();
    unsubscribers = [];
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

  // Draft editing --------------------------------------------------------------------

  function addClass(symbol: string) {
    const trimmed = symbol.trim();
    if (!trimmed || draft.value.classes.some((c) => c.symbol === trimmed)) return false;
    draft.value.classes.push({
      symbol: trimmed,
      label: null,
      sort_order: draft.value.classes.length,
      phoneme_ipa: [],
    });
    return true;
  }

  function removeClass(symbol: string) {
    draft.value.classes = draft.value.classes.filter((c) => c.symbol !== symbol);
    // Slots and constraints referencing it would be rejected by the RPC, so drop them
    // here rather than letting Save fail with a foreign-key error the user cannot act on.
    for (const template of draft.value.templates) {
      template.slots = template.slots
        .filter((s) => s.class_symbol !== symbol)
        .map((s, i) => ({ ...s, slot_index: i }));
    }
    draft.value.constraints = draft.value.constraints.filter(
      (c) => c.a_class_symbol !== symbol && c.b_class_symbol !== symbol,
    );
  }

  function toggleMember(symbol: string, ipa: string) {
    const cls = draft.value.classes.find((c) => c.symbol === symbol);
    if (!cls) return;
    cls.phoneme_ipa = cls.phoneme_ipa.includes(ipa)
      ? cls.phoneme_ipa.filter((x) => x !== ipa)
      : [...cls.phoneme_ipa, ipa];
  }

  function setMembers(symbol: string, ipa: string[]) {
    const cls = draft.value.classes.find((c) => c.symbol === symbol);
    if (cls) cls.phoneme_ipa = [...new Set(ipa)];
  }

  function addTemplate(name: string) {
    const trimmed = name.trim();
    if (!trimmed || draft.value.templates.some((t) => t.name === trimmed)) return false;
    draft.value.templates.push({
      name: trimmed,
      weight: 1,
      sort_order: draft.value.templates.length,
      notes: null,
      slots: [],
    });
    return true;
  }

  function removeTemplate(name: string) {
    draft.value.templates = draft.value.templates.filter((t) => t.name !== name);
  }

  function reindex(template: DraftTemplate) {
    template.slots = template.slots.map((s, i) => ({ ...s, slot_index: i }));
  }

  function addSlot(templateName: string, classSymbol: string, role: SlotRole) {
    const template = draft.value.templates.find((t) => t.name === templateName);
    if (!template) return;
    template.slots.push({
      slot_index: template.slots.length,
      role,
      optional: false,
      class_symbol: classSymbol,
    });
  }

  function removeSlot(templateName: string, index: number) {
    const template = draft.value.templates.find((t) => t.name === templateName);
    if (!template) return;
    template.slots.splice(index, 1);
    reindex(template);
  }

  function moveSlot(templateName: string, index: number, delta: number) {
    const template = draft.value.templates.find((t) => t.name === templateName);
    if (!template) return;
    const target = index + delta;
    if (target < 0 || target >= template.slots.length) return;
    const [slot] = template.slots.splice(index, 1);
    if (slot) template.slots.splice(target, 0, slot);
    reindex(template);
  }

  function addConstraint(constraint: DraftConstraint) {
    draft.value.constraints.push(constraint);
  }

  function removeConstraint(index: number) {
    draft.value.constraints.splice(index, 1);
  }

  function discard() {
    draft.value = clone(persisted.value);
  }

  // The bridge to the pure module ----------------------------------------------------

  /**
   * The draft, resolved into what `src/lib/phonotactics.ts` consumes.
   *
   * Built from the draft rather than from what is saved, so the sample output reflects
   * an edit before it is committed. This is the only place the two representations meet:
   * everything past it is pure, and a future word generator enters at exactly this shape.
   */
  const grammar = computed<Grammar>(() => {
    const classes: ResolvedClass[] = draft.value.classes.map((c) => ({
      id: c.symbol, // the symbol is the natural key, and is stable within a draft
      symbol: c.symbol,
      label: c.label,
      ipa: [...c.phoneme_ipa],
    }));
    const bySymbol = new Map(classes.map((c) => [c.symbol, c]));

    const templates: ResolvedTemplate[] = draft.value.templates.map((t) => ({
      id: t.name,
      name: t.name,
      weight: t.weight,
      slots: t.slots
        .map((s) => {
          const cls = bySymbol.get(s.class_symbol);
          return cls ? { role: s.role, optional: s.optional, cls } : null;
        })
        .filter((s): s is NonNullable<typeof s> => s !== null),
    }));

    return {
      classes,
      templates,
      // Annotated, or flatMap infers the whole result from whichever branch it sees
      // first. A half-specified constraint is dropped rather than guessed at: the
      // database's kind_shape check would reject it on save anyway, so the generator
      // should not act on something that cannot be persisted.
      constraints: draft.value.constraints.flatMap((c): ResolvedConstraint[] => {
        const term = (classSymbol: string | null, ipa: string | null): Term | null => {
          if (classSymbol !== null) return { kind: "class", classId: classSymbol };
          if (ipa !== null) return { kind: "phoneme", ipa };
          return null;
        };

        if (c.kind === "no_identical_adjacent") return [{ kind: "no_identical_adjacent" }];

        const a = term(c.a_class_symbol, c.a_phoneme_ipa);
        if (!a) return [];

        if (c.kind === "forbid_in_role") {
          return c.role ? [{ kind: "forbid_in_role", role: c.role, a }] : [];
        }

        const b = term(c.b_class_symbol, c.b_phoneme_ipa);
        if (!b || !c.seq_position) return [];
        return [{ kind: "forbid_sequence", position: c.seq_position, a, b }];
      }),
    };
  });

  return {
    draft,
    loading,
    saving,
    error,
    changedElsewhere,
    dirty,
    isConfigured,
    grammar,
    fetchFor,
    save,
    discard,
    acceptIncoming,
    addClass,
    removeClass,
    toggleMember,
    setMembers,
    addTemplate,
    removeTemplate,
    addSlot,
    removeSlot,
    moveSlot,
    addConstraint,
    removeConstraint,
    subscribe,
    unsubscribeAll,
    reset,
  };
});
