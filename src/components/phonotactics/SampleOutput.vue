<script setup lang="ts">
import { computed, ref } from "vue";

import AddToLexiconDialog from "@/components/phonotactics/AddToLexiconDialog.vue";
import { generateWords, seededRng } from "@/lib/phonotactics";
import { useLexiconStore } from "@/stores/lexicon";
import { useMembersStore } from "@/stores/members";
import { usePhonotacticsStore } from "@/stores/phonotactics";

/**
 * The project id is only needed to write an entry. The generator half of this component
 * still knows nothing about the database — `phonotactics.grammar` and `generateWords` are
 * the same pair a future word-generator feature would use.
 */
defineProps<{ projectId: string }>();

const phonotactics = usePhonotacticsStore();
const lexicon = useLexiconStore();
const members = useMembersStore();

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

/** The word whose "add to the lexicon" dialog is open, or null. */
const adding = ref<string | null>(null);

/**
 * Words this page has just added, so a chip can say so.
 *
 * Session-local and by form: it is feedback on the click that was made, not a claim about
 * the lexicon. `known` below is the claim about the lexicon, and it is derived from the
 * lexicon rather than remembered here.
 */
const justAdded = ref(new Set<string>());

/**
 * Lemmas the lexicon already holds.
 *
 * Shown but never blocking, because the language has homographs and `lexicon_entries`
 * deliberately has no unique constraint on lemma — the same form really can be two words.
 */
const known = computed(() => new Set(lexicon.entries.map((e) => e.lemma)));

function onAdded(lemma: string) {
  justAdded.value = new Set(justAdded.value).add(lemma);
}

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

    <!-- Each word is a button, because clicking one is the point: a generated form is a
         candidate, and the distance between liking it and writing it down should be one
         click. The chip is content rather than a control, so it opts out of the app's
         uppercase button styling. -->
    <p v-if="words.length" class="words">
      <!-- A visitor to a published conlang can generate words and read them; adding one
           to the lexicon is a write, so for them the chip is just the word. -->
      <template v-if="!members.canEdit">
        <span v-for="(word, i) in words" :key="`${word}-${i}`" class="word still">{{ word }}</span>
      </template>
      <template v-else>
        <button
          v-for="(word, i) in words"
          :key="`${word}-${i}`"
          type="button"
          class="word"
          :class="{ added: justAdded.has(word), known: known.has(word) && !justAdded.has(word) }"
          :title="
            known.has(word)
              ? `${word} is already a lemma in the lexicon — click to add another entry for it`
              : `Add ${word} to the lexicon`
          "
          @click="adding = word"
        >
          {{ word
          }}<span class="mark" aria-hidden="true">{{ justAdded.has(word) ? "✓" : "+" }}</span>
        </button>
      </template>
    </p>
    <p v-else-if="!failure" class="hint">
      Add a class and a template with a required nucleus to see sample words.
    </p>

    <p v-if="words.length && members.canEdit" class="hint">
      Click a word to add it to the lexicon. Words are generated from the draft on this page, so
      they follow edits before they are saved.
    </p>

    <AddToLexiconDialog
      v-if="adding"
      :open="true"
      :project-id="projectId"
      :ipa="adding"
      @added="onAdded"
      @close="adding = null"
    />
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
  margin: 0 0 var(--sp-2);
  padding: var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-raised);
  font-family: var(--font-mono);
  font-size: 0.9375rem;
}

/**
 * A button that is really content — a word — so it opts out of the base button rule the
 * way the IPA chart's phones and the lexicon's lemmas do, and then goes further: at rest
 * it is only text. The row has to read as a list of generated words, not as a toolbar.
 *
 * The border is transparent rather than absent, so appearing on hover costs no reflow: a
 * row of forty chips shifting by a pixel each is exactly the kind of movement that makes
 * a list feel like a control panel.
 */
.word {
  position: relative;
  display: inline-flex;
  align-items: center;
  font-family: inherit;
  font-size: inherit;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  padding: 2px var(--sp-2);
  border: 1px solid transparent;
  background: none;
}

/* Not a control at all for a read-only visitor: no hover, no border, no affordance. */
.word.still {
  cursor: default;
  padding: 2px var(--sp-2);
}

.word:not(.still):hover:not(:disabled),
.word:focus-visible {
  border-color: var(--c-border);
  background: var(--c-surface);
}

/**
 * Out of the flow entirely, in the chip's top-right corner.
 *
 * In the flow it set the chip's width, so the whole row reflowed as the pointer moved
 * across it. Absolute keeps every word exactly where it was; the corner is chosen over an
 * inline position for the same reason — there is nothing there to push.
 */
.mark {
  position: absolute;
  top: -0.35em;
  right: 0;
  opacity: 0;
  color: var(--c-accent);
  font-size: 0.75em;
  font-weight: 700;
  line-height: 1;
  pointer-events: none;
}

.word:hover .mark,
.word:focus-visible .mark {
  opacity: 1;
}

/* Already a lemma. Not a warning — homographs are legitimate — so it recedes in colour
   and nothing else. */
.word.known {
  color: var(--c-muted);
}

/* The tick stays visible where the plus only appears on hover: one is feedback about
   something that happened, the other is an invitation. */
.word.added {
  color: var(--c-accent);
}

.word.added .mark {
  opacity: 1;
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
