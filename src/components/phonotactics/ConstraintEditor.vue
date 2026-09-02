<script setup lang="ts">
import { computed, ref } from "vue";

import ConstraintForm from "@/components/phonotactics/ConstraintForm.vue";
import { orphanedTerms } from "@/lib/phonotactics";
import { usePhonemesStore } from "@/stores/phonemes";
import { usePhonotacticsStore } from "@/stores/phonotactics";
import type { DraftConstraint } from "@/stores/phonotactics";

const phonemes = usePhonemesStore();
const phonotactics = usePhonotacticsStore();

/**
 * Which row is being edited, or `"new"` for the add form. One at a time.
 *
 * Editing happens in a form beside the draft rather than on the constraint itself,
 * because a constraint is only saveable once its kind and its terms agree — the database
 * checks that with `kind_shape`, and this page saves whole, so one half-filled rule would
 * block every other edit on it.
 */
const editing = ref<number | "new" | null>(null);

// Against the saved inventory, because that is what the rule will be measured by; the
// unsaved chart selection has not happened yet.
const inventoryIpa = computed(() => new Set(phonemes.inventory.map((p) => p.ipa)));

const missingFor = (c: DraftConstraint) => orphanedTerms(c, inventoryIpa.value);

function commit(constraint: DraftConstraint) {
  if (editing.value === "new") phonotactics.addConstraint(constraint);
  else if (typeof editing.value === "number")
    phonotactics.updateConstraint(editing.value, constraint);
  editing.value = null;
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
      <li
        v-for="(c, i) in phonotactics.draft.constraints"
        :key="i"
        :class="{ broken: missingFor(c).length, editing: editing === i }"
      >
        <ConstraintForm
          v-if="editing === i"
          :initial="c"
          submit-label="Save rule"
          @submit="commit"
          @cancel="editing = null"
        />

        <template v-else>
          <span class="what">
            {{ describe(c) }}
            <em v-if="c.note" class="note">— {{ c.note }}</em>
            <em v-if="missingFor(c).length">
              — not applied:
              {{
                missingFor(c)
                  .map((ipa) => `/${ipa}/`)
                  .join(" and ")
              }}
              {{ missingFor(c).length === 1 ? "is" : "are" }} no longer in the inventory
            </em>
          </span>
          <span class="actions">
            <button type="button" @click="editing = i">Edit</button>
            <button type="button" @click="phonotactics.removeConstraint(i)">Remove</button>
          </span>
        </template>
      </li>
    </ul>
    <p v-else class="hint">None yet.</p>

    <ConstraintForm
      v-if="editing === 'new'"
      :initial="null"
      submit-label="Add"
      @submit="commit"
      @cancel="editing = null"
    />
    <button v-else type="button" @click="editing = 'new'">Add constraint</button>
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

/* Kept, not enforced. The rule is still someone's decision, so it stays legible rather
   than being greyed out — it is broken, not disabled. */
.list li.broken {
  border-color: var(--c-danger);
  border-left-width: 3px;
}

.what {
  min-width: 0;
}

.actions {
  display: flex;
  gap: var(--sp-2);
  flex: none;
}

.note {
  font-style: normal;
  color: var(--c-muted);
}

/* The form needs the whole row: the space-between that separates a rule from its buttons
   would otherwise push its widgets to both ends. */
.list li.editing {
  display: block;
}

/* :not(.note) so a broken rule's own note does not read as part of the warning. */
.list li.broken em:not(.note) {
  font-style: normal;
  color: var(--c-danger);
}
</style>
