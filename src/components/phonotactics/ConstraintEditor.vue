<script setup lang="ts">
import { computed, ref } from "vue";

import { usePhonemesStore } from "@/stores/phonemes";
import { usePhonotacticsStore } from "@/stores/phonotactics";
import type { DraftConstraint } from "@/stores/phonotactics";
import type { ConstraintKind, SequencePosition, SlotRole } from "@/types/models";

const phonemes = usePhonemesStore();
const phonotactics = usePhonotacticsStore();

const kind = ref<ConstraintKind>("forbid_in_role");
const role = ref<SlotRole>("onset");
const seqPosition = ref<SequencePosition>("anywhere");
// One string per term, prefixed so a class named "a" and the phoneme /a/ stay distinct.
const a = ref("");
const b = ref("");

const options = computed(() => [
  ...phonotactics.draft.classes.map((c) => ({
    value: `class:${c.symbol}`,
    label: `${c.symbol} (class)`,
  })),
  ...phonemes.inventory.map((p) => ({ value: `phoneme:${p.ipa}`, label: `/${p.ipa}/` })),
]);

function split(token: string) {
  const [type, ...rest] = token.split(":");
  const value = rest.join(":");
  return type === "class"
    ? { class_symbol: value, phoneme_ipa: null }
    : { class_symbol: null, phoneme_ipa: value };
}

const canAdd = computed(() => {
  if (kind.value === "no_identical_adjacent") return true;
  if (kind.value === "forbid_in_role") return Boolean(a.value);
  return Boolean(a.value && b.value);
});

function add() {
  if (!canAdd.value) return;
  const termA = a.value ? split(a.value) : { class_symbol: null, phoneme_ipa: null };
  const termB = b.value ? split(b.value) : { class_symbol: null, phoneme_ipa: null };

  const constraint: DraftConstraint = {
    kind: kind.value,
    role: kind.value === "forbid_in_role" ? role.value : null,
    seq_position: kind.value === "forbid_sequence" ? seqPosition.value : null,
    a_class_symbol: kind.value === "no_identical_adjacent" ? null : termA.class_symbol,
    a_phoneme_ipa: kind.value === "no_identical_adjacent" ? null : termA.phoneme_ipa,
    b_class_symbol: kind.value === "forbid_sequence" ? termB.class_symbol : null,
    b_phoneme_ipa: kind.value === "forbid_sequence" ? termB.phoneme_ipa : null,
    note: null,
  };
  phonotactics.addConstraint(constraint);
  a.value = "";
  b.value = "";
}

function describe(c: DraftConstraint) {
  const term = (cls: string | null, ipa: string | null) => cls ?? (ipa ? `/${ipa}/` : "?");
  if (c.kind === "no_identical_adjacent") return "no identical adjacent segments";
  if (c.kind === "forbid_in_role") {
    return `${term(c.a_class_symbol, c.a_phoneme_ipa)} cannot be a ${c.role}`;
  }
  const where = c.seq_position === "anywhere" ? "" : ` ${c.seq_position?.replace("_", "-")}`;
  return `${term(c.a_class_symbol, c.a_phoneme_ipa)}${term(c.b_class_symbol, c.b_phoneme_ipa)} not allowed${where}`;
}
</script>

<template>
  <section>
    <h2>Constraints</h2>
    <p class="hint">
      Checked against every generated word. A sequence constraint is the one thing a template cannot
      express: a template sees one syllable, this sees across the boundary.
    </p>

    <ul v-if="phonotactics.draft.constraints.length" class="list">
      <li v-for="(c, i) in phonotactics.draft.constraints" :key="i">
        <span>{{ describe(c) }}</span>
        <button type="button" @click="phonotactics.removeConstraint(i)">Remove</button>
      </li>
    </ul>
    <p v-else class="hint">None yet.</p>

    <form class="add" @submit.prevent="add">
      <select v-model="kind" aria-label="Constraint kind">
        <option value="forbid_in_role">forbid in role</option>
        <option value="forbid_sequence">forbid sequence</option>
        <option value="no_identical_adjacent">no identical adjacent</option>
      </select>

      <template v-if="kind !== 'no_identical_adjacent'">
        <select v-model="a" aria-label="First term">
          <option value="">choose…</option>
          <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
      </template>

      <template v-if="kind === 'forbid_in_role'">
        <select v-model="role" aria-label="Role">
          <option value="onset">onset</option>
          <option value="nucleus">nucleus</option>
          <option value="coda">coda</option>
        </select>
      </template>

      <template v-if="kind === 'forbid_sequence'">
        <select v-model="b" aria-label="Second term">
          <option value="">choose…</option>
          <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
        </select>
        <select v-model="seqPosition" aria-label="Position">
          <option value="anywhere">anywhere</option>
          <option value="word_initial">word-initial</option>
          <option value="word_final">word-final</option>
        </select>
      </template>

      <button type="submit" :disabled="!canAdd">Add</button>
    </form>
  </section>
</template>

<style scoped>
h2 {
  margin: var(--sp-8) 0 var(--sp-1);
  font-size: 0.875rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.hint {
  margin: 0 0 var(--sp-4);
  color: var(--c-muted);
  font-size: 0.8125rem;
}

.list {
  list-style: none;
  margin: 0 0 var(--sp-4);
  padding: 0;
  display: grid;
  gap: var(--sp-1);
}

.list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  font-size: 0.875rem;
}

.add {
  display: flex;
  flex-wrap: wrap;
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
</style>
