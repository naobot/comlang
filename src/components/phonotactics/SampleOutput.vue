<script setup lang="ts">
import { computed, ref } from "vue";

import { generateWords, seededRng } from "@/lib/phonotactics";
import { usePhonotacticsStore } from "@/stores/phonotactics";

const phonotactics = usePhonotacticsStore();

const seed = ref(Math.floor(Math.random() * 1e9));
const count = ref(24);
const maxSyllables = ref(3);

/**
 * Generated from the **draft**, not from what is saved, so the effect of an edit shows
 * before committing to it.
 *
 * This is the whole reuse claim in one expression: `phonotactics.grammar` and
 * `generateWords` are the same pair a future word-generator feature would use, and this
 * component knows nothing about the database.
 */
const results = computed(() =>
  generateWords(
    phonotactics.grammar,
    { minSyllables: 1, maxSyllables: maxSyllables.value },
    seededRng(seed.value),
    count.value,
  ),
);

const words = computed(() => results.value.filter((r) => r.ok).map((r) => (r.ok ? r.ipa : "")));

// One reason is enough: a grammar that cannot produce anything fails the same way every
// time, and twenty copies of the same sentence is not more informative than one.
const failure = computed(() => {
  const first = results.value.find((r) => !r.ok);
  return first && !first.ok ? first.reason : null;
});
</script>

<template>
  <section>
    <h2>Sample output</h2>

    <div class="bar">
      <label>
        up to
        <input v-model.number="maxSyllables" type="number" min="1" max="6" />
        syllables
      </label>
      <button type="button" @click="seed = Math.floor(Math.random() * 1e9)">Regenerate</button>
    </div>

    <p v-if="failure" class="warn">Could not generate: {{ failure }}</p>

    <p v-if="words.length" class="words">
      <span v-for="(word, i) in words" :key="`${word}-${i}`">{{ word }}</span>
    </p>
    <p v-else-if="!failure" class="hint">
      Add a class and a template with a required nucleus to see sample words.
    </p>
  </section>
</template>

<style scoped>
h2 {
  margin: var(--sp-8) 0 var(--sp-3);
  font-size: 0.875rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.bar {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-bottom: var(--sp-3);
}

.bar label {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  color: var(--c-muted);
  font-size: 0.75rem;
}

.bar input {
  width: 4rem;
}

.words {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0;
  padding: var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-raised);
  font-family: var(--font-mono);
  font-size: 0.9375rem;
}

.hint {
  color: var(--c-muted);
  font-size: 0.8125rem;
}

.warn {
  color: var(--c-danger);
  font-size: 0.875rem;
}
</style>
