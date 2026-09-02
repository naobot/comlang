import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { subscribeToProjectTable } from "@/composables/useProjectChannel";
import { usePhonemesStore } from "@/stores/phonemes";
import { canonicalDraft, cloneDraft, draftProblems, resolveGrammar } from "@/lib/phonotactics";
import type { Draft, DraftConstraint, DraftTemplate, Grammar, SlotRole } from "@/lib/phonotactics";
import { supabase } from "@/lib/supabase";

// The draft shapes live in the pure module, beside `impactOfRemoving`, which has to
// reason over them. Re-exported here because this is where callers expect them.
export type {
  Draft,
  DraftClass,
  DraftConstraint,
  DraftSlot,
  DraftTerm,
  DraftTemplate,
} from "@/lib/phonotactics";

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

const emptyDraft = (): Draft => ({ classes: [], templates: [], constraints: [] });

// Both live in the pure module so they can be tested without this file's Supabase
// import — which is how `structuredClone` sat here throwing on every save unnoticed.
const canonical = canonicalDraft;
const clone = cloneDraft;

export const usePhonotacticsStore = defineStore("phonotactics", () => {
  const phonemes = usePhonemesStore();

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

    // Only classes still need resolving from an id; membership and rule terms are stored
    // as IPA text precisely so they can outlive the phoneme row.
    const classById = new Map((classes.data ?? []).map((c) => [c.id, c]));

    const ipaFor = (classId: string) =>
      (members.data ?? []).filter((m) => m.class_id === classId).map((m) => m.ipa);

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
              // Read straight through, like a rule's terms: a slot may name a segment the
              // inventory no longer has, and that is the state the editor renders in red.
              phoneme_ipa: s.phoneme_ipa,
            })),
        })),
      constraints: (constraints.data ?? []).map((c) => ({
        kind: c.kind,
        role: c.role,
        seq_position: c.seq_position,
        a_class_symbol: c.a_class_id ? (classById.get(c.a_class_id)?.symbol ?? null) : null,
        // Read straight through: a rule may name a segment the inventory no longer has,
        // and that is the state the editor renders in red rather than an error.
        a_phoneme_ipa: c.a_phoneme_ipa,
        b_class_symbol: c.b_class_id ? (classById.get(c.b_class_id)?.symbol ?? null) : null,
        b_phoneme_ipa: c.b_phoneme_ipa,
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
    // Names are the one thing the database will not catch: templates upsert on their
    // name, so two rows called the same thing become one without raising anything.
    const found = draftProblems(draft.value);
    if (found.length) {
      error.value = found.join(" ");
      return false;
    }

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

  /**
   * Templates are addressed by **index**, not by name.
   *
   * They were name-keyed until the name became editable, and a name is not an identity
   * once someone can type in it: a rename that passes through a name another template
   * already has — backspacing "CVC" to "CV" — would silently land the next edit on the
   * wrong template. The index is what the list renders from, so it cannot disagree with
   * what the user is pointing at.
   */
  function templateAt(index: number) {
    return draft.value.templates[index] ?? null;
  }

  /**
   * `sort_order` is renumbered from position on every structural change, because
   * `canonicalDraft` sorts templates by name — array order alone is invisible to it, so
   * without this a drag that reordered the list would not even register as dirty.
   */
  function renumberTemplates() {
    draft.value.templates.forEach((t, i) => {
      t.sort_order = i;
    });
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

  function removeTemplateAt(index: number) {
    draft.value.templates.splice(index, 1);
    renumberTemplates();
  }

  function moveTemplate(from: number, to: number) {
    if (to < 0 || to >= draft.value.templates.length) return;
    const [template] = draft.value.templates.splice(from, 1);
    if (template) draft.value.templates.splice(to, 0, template);
    renumberTemplates();
  }

  function reindex(template: DraftTemplate) {
    template.slots = template.slots.map((s, i) => ({ ...s, slot_index: i }));
  }

  function addSlot(templateIndex: number, classSymbol: string, role: SlotRole) {
    const template = templateAt(templateIndex);
    if (!template) return;
    template.slots.push({
      slot_index: template.slots.length,
      role,
      optional: false,
      class_symbol: classSymbol,
      phoneme_ipa: null,
    });
  }

  function slotAt(templateIndex: number, index: number) {
    return templateAt(templateIndex)?.slots[index] ?? null;
  }

  /** `null` puts the slot back to following its class. */
  function setSlotPhonemes(templateIndex: number, index: number, ipa: string[] | null) {
    const slot = slotAt(templateIndex, index);
    if (!slot) return;
    // Empty is not a state the database will hold, and a slot nothing can fill is a
    // mistake rather than a choice — collapse it to "follow the class".
    slot.phoneme_ipa = ipa === null || ipa.length === 0 ? null : [...new Set(ipa)];
  }

  /**
   * An action rather than a `v-model`, because changing the class has to **drop the
   * override**. A set that was drawn from the old class has nothing to do with the new
   * one, and leaving it behind would give the slot a label that describes none of its
   * contents.
   */
  function setSlotClass(templateIndex: number, index: number, classSymbol: string) {
    const slot = slotAt(templateIndex, index);
    if (!slot || slot.class_symbol === classSymbol) return;
    slot.class_symbol = classSymbol;
    slot.phoneme_ipa = null;
  }

  function removeSlot(templateIndex: number, index: number) {
    const template = templateAt(templateIndex);
    if (!template) return;
    template.slots.splice(index, 1);
    reindex(template);
  }

  function moveSlot(templateIndex: number, index: number, delta: number) {
    const template = templateAt(templateIndex);
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

  function updateConstraint(index: number, constraint: DraftConstraint) {
    if (index < 0 || index >= draft.value.constraints.length) return;
    draft.value.constraints.splice(index, 1, constraint);
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
   * Built from the draft rather than from what is saved, so the sample output reflects an
   * edit before it is committed. The inventory is passed in because `resolveGrammar`
   * filters class members against it — a class may name a segment the language no longer
   * has, and generating it anyway would make removing a phoneme meaningless.
   *
   * This is the only place the two representations meet: everything past it is pure, and
   * a future word generator enters at exactly this shape.
   */
  const grammar = computed<Grammar>(() =>
    resolveGrammar(draft.value, new Set(phonemes.inventory.map((p) => p.ipa))),
  );

  return {
    draft,
    persisted,
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
    removeTemplateAt,
    moveTemplate,
    addSlot,
    removeSlot,
    moveSlot,
    setSlotClass,
    setSlotPhonemes,
    addConstraint,
    updateConstraint,
    removeConstraint,
    subscribe,
    unsubscribeAll,
    reset,
  };
});
