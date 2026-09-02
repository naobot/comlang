<script setup lang="ts">
import { computed, ref, watch } from "vue";

import ConstraintTermDialog from "@/components/phonotactics/ConstraintTermDialog.vue";
import type { DraftConstraint, DraftTerm } from "@/stores/phonotactics";
import type { ConstraintKind, SequencePosition, SlotRole } from "@/types/models";

/**
 * The widgets for one constraint, used in two places: the add row at the bottom of the
 * list, and in place of a row being edited.
 *
 * It never writes to the draft. The parent commits on `submit`, which is what keeps an
 * incomplete rule out of the draft entirely — the database's `kind_shape` check would
 * refuse one, and this page saves whole rather than per rule, so a half-filled constraint
 * would block every other edit on the page from being saved.
 */
const props = defineProps<{ initial: DraftConstraint | null; submitLabel: string }>();
const emit = defineEmits<{ submit: [constraint: DraftConstraint]; cancel: [] }>();

const blank = (): DraftConstraint => ({
  kind: "forbid_in_role",
  role: "onset",
  seq_position: "anywhere",
  a_class_symbol: null,
  a_phoneme_ipa: null,
  b_class_symbol: null,
  b_phoneme_ipa: null,
  note: null,
});

const kind = ref<ConstraintKind>("forbid_in_role");
const role = ref<SlotRole>("onset");
const seqPosition = ref<SequencePosition>("anywhere");
const a = ref<DraftTerm>({ class_symbol: null, phoneme_ipa: null });
const b = ref<DraftTerm>({ class_symbol: null, phoneme_ipa: null });
const note = ref("");

/** Which term the dialog is editing, or null when it is closed. */
const picking = ref<"a" | "b" | null>(null);

watch(
  () => props.initial,
  (initial) => {
    const c = initial ?? blank();
    kind.value = c.kind;
    role.value = c.role ?? "onset";
    seqPosition.value = c.seq_position ?? "anywhere";
    a.value = { class_symbol: c.a_class_symbol, phoneme_ipa: c.a_phoneme_ipa };
    b.value = { class_symbol: c.b_class_symbol, phoneme_ipa: c.b_phoneme_ipa };
    note.value = c.note ?? "";
  },
  { immediate: true },
);

const label = (term: DraftTerm) =>
  term.class_symbol ?? (term.phoneme_ipa ? `/${term.phoneme_ipa}/` : "choose…");

const canSubmit = computed(() => {
  if (kind.value === "no_identical_adjacent") return true;
  const hasA = Boolean(a.value.class_symbol || a.value.phoneme_ipa);
  if (kind.value === "forbid_in_role") return hasA;
  return hasA && Boolean(b.value.class_symbol || b.value.phoneme_ipa);
});

function onPick(term: DraftTerm) {
  if (picking.value === "a") a.value = term;
  if (picking.value === "b") b.value = term;
}

function submit() {
  if (!canSubmit.value) return;
  // The fields a kind does not use are nulled rather than left over, mirroring the
  // database's `kind_shape` check. Sending a stale term would be rejected on save with an
  // error naming a field the user never filled in.
  emit("submit", {
    kind: kind.value,
    role: kind.value === "forbid_in_role" ? role.value : null,
    seq_position: kind.value === "forbid_sequence" ? seqPosition.value : null,
    a_class_symbol: kind.value === "no_identical_adjacent" ? null : a.value.class_symbol,
    a_phoneme_ipa: kind.value === "no_identical_adjacent" ? null : a.value.phoneme_ipa,
    b_class_symbol: kind.value === "forbid_sequence" ? b.value.class_symbol : null,
    b_phoneme_ipa: kind.value === "forbid_sequence" ? b.value.phoneme_ipa : null,
    note: note.value.trim() || null,
  });
}
</script>

<template>
  <form class="form" @submit.prevent="submit">
    <select v-model="kind" aria-label="Constraint kind">
      <option value="forbid_in_role">forbid in role</option>
      <option value="forbid_sequence">forbid sequence</option>
      <option value="no_identical_adjacent">no identical adjacent</option>
    </select>

    <button
      v-if="kind !== 'no_identical_adjacent'"
      type="button"
      class="term"
      :class="{ unset: !a.class_symbol && !a.phoneme_ipa }"
      aria-label="First term"
      @click="picking = 'a'"
    >
      {{ label(a) }}
    </button>

    <select v-if="kind === 'forbid_in_role'" v-model="role" aria-label="Role">
      <option value="onset">onset</option>
      <option value="nucleus">nucleus</option>
      <option value="coda">coda</option>
    </select>

    <template v-if="kind === 'forbid_sequence'">
      <button
        type="button"
        class="term"
        :class="{ unset: !b.class_symbol && !b.phoneme_ipa }"
        aria-label="Second term"
        @click="picking = 'b'"
      >
        {{ label(b) }}
      </button>
      <select v-model="seqPosition" aria-label="Position">
        <option value="anywhere">anywhere</option>
        <option value="word_initial">word-initial</option>
        <option value="word_final">word-final</option>
      </select>
    </template>

    <input v-model="note" class="note" placeholder="note (optional)" aria-label="Note" />

    <button type="submit" :disabled="!canSubmit">{{ submitLabel }}</button>
    <button type="button" @click="emit('cancel')">Cancel</button>
  </form>

  <!-- Outside the form on purpose: the dialog's own Done is a submit button, and nested
       inside this form it would submit the constraint instead of closing the picker. -->
  <ConstraintTermDialog
    v-if="picking"
    :open="true"
    :title="picking === 'a' ? 'First term' : 'Second term'"
    :term="picking === 'a' ? a : b"
    @pick="onPick"
    @close="picking = null"
  />
</template>

<style scoped>
.form {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-2);
}

select {
  font: inherit;
  padding: var(--sp-1) var(--sp-2);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  color: var(--c-text);
}

/* A term is a value, not a command: it keeps the symbol's own case and spacing. */
.term {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  min-width: 4rem;
  justify-content: center;
}

.term.unset {
  font-family: var(--font-ui);
  font-size: 0.75rem;
  color: var(--c-muted);
}

.note {
  flex: 1;
  min-width: 8rem;
  width: auto;
  padding: var(--sp-1) var(--sp-2);
  font-size: 0.8125rem;
}
</style>
