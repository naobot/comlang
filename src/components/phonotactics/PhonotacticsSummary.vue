<script setup lang="ts">
import { computed } from "vue";

import { describeConstraint, templateNotation } from "@/lib/phonotactics";
import { usePhonotacticsStore } from "@/stores/phonotactics";

/**
 * What a visitor to a published conlang sees in place of the three editors.
 *
 * Not the editors with their controls removed: an editor with nothing to press is mostly
 * empty boxes. This says the same three things — which classes exist, what a syllable is
 * built from, and what is ruled out — as text, which is how you would write them down.
 *
 * Read from `grammar` rather than from the draft where the shape allows, so the notation
 * is produced by the same function the generator uses and the two cannot disagree.
 */
const phonotactics = usePhonotacticsStore();

const classes = computed(() => phonotactics.draft.classes);
const templates = computed(() => phonotactics.grammar.templates);
const constraints = computed(() => phonotactics.draft.constraints);
</script>

<template>
  <section>
    <h2>Phoneme classes</h2>
    <ul v-if="classes.length" class="classes">
      <li v-for="cls in classes" :key="cls.symbol">
        <code class="symbol">{{ cls.symbol }}</code>
        <span v-if="cls.label" class="label">{{ cls.label }}</span>
        <span class="members">{{ cls.phoneme_ipa.join(" ") || "—" }}</span>
      </li>
    </ul>
    <p v-else class="hint">No classes defined.</p>

    <h2>Syllable templates</h2>
    <ul v-if="templates.length" class="templates">
      <li v-for="template in templates" :key="template.id">
        <code class="notation">{{ templateNotation(template) }}</code>
        <strong>{{ template.name }}</strong>
        <span class="weight">weight {{ template.weight }}</span>
      </li>
    </ul>
    <p v-else class="hint">No templates defined.</p>

    <h2>Constraints</h2>
    <ul v-if="constraints.length" class="constraints">
      <li v-for="(c, i) in constraints" :key="i">
        {{ describeConstraint(c) }}
        <span v-if="c.note" class="note">{{ c.note }}</span>
      </li>
    </ul>
    <p v-else class="hint">No constraints — the templates alone say what a word may be.</p>
  </section>
</template>

<style scoped>
h2 {
  margin: var(--sp-8) 0 var(--sp-3);
  font-size: 0.875rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-muted);
}

ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sp-2);
  max-width: 60rem;
}

li {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
}

.symbol,
.notation {
  flex: none;
  font-family: var(--font-mono);
  font-weight: 700;
}

.label,
.weight,
.note {
  color: var(--c-muted);
  font-size: 0.8125rem;
}

.members {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.templates strong {
  flex: 1;
  min-width: 0;
}

.hint {
  color: var(--c-muted);
  font-size: 0.8125rem;
}
</style>
