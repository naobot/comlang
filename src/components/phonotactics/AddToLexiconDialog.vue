<script setup lang="ts">
import { computed, ref, watch } from "vue";

import ModalDialog from "@/components/ModalDialog.vue";
import { type EntryDraft, useLexiconStore } from "@/stores/lexicon";
import { useWordClassesStore } from "@/stores/wordClasses";

/**
 * Turns a generated word into a lexicon entry.
 *
 * The generator produces a *form* and nothing else — what it means, what class it belongs
 * to and what to key it under are all things only a person can say — so the word arrives
 * here as a filled-in lemma and the rest is a small version of the lexicon's own form.
 *
 * It writes through `createEntry` rather than the lexicon's open draft: that draft belongs
 * to the entry someone may have left open on the lexicon page, and adding a word from this
 * tab must not silently discard it. Everything below is local until Add is pressed, so
 * Escape and Cancel really are cancels.
 */
const props = defineProps<{ open: boolean; projectId: string; ipa: string }>();
const emit = defineEmits<{ close: []; added: [lemma: string] }>();

const lexicon = useLexiconStore();
const wordClasses = useWordClassesStore();

const draft = ref<EntryDraft>({
  lemma: "",
  gloss: "",
  word_class: "",
  entry_key: "",
  notes: "",
});
const saving = ref(false);
const error = ref<string | null>(null);

/**
 * Re-seeded each time it opens, so cancelling leaves nothing behind and the next word does
 * not inherit the last one's gloss.
 *
 * The lemma is the generated form and is editable: the generator is a suggestion, and
 * shaving a segment off before writing it down is a normal thing to want.
 */
watch(
  () => [props.open, props.ipa],
  () => {
    if (!props.open) return;
    draft.value = { lemma: props.ipa, gloss: "", word_class: "", entry_key: "", notes: "" };
    error.value = null;
  },
  { immediate: true },
);

/** From what is **saved** on the word-classes page — a half-typed class is not a choice. */
const defined = computed(() => wordClasses.classNames.filter((n) => n.trim()));

/**
 * Entries that already carry this exact lemma.
 *
 * Shown, never blocking. The language has homographs — `gwan` is both "meaning" and
 * "become" — which is why `lexicon_entries` has no unique constraint on lemma, so this is
 * a "did you mean to?" and not an error.
 */
const existing = computed(() =>
  lexicon.entries.filter((e) => e.lemma === draft.value.lemma.trim()),
);

async function add() {
  saving.value = true;
  error.value = null;
  try {
    const result = await lexicon.createEntry(props.projectId, draft.value);
    if (!result.ok) {
      // Kept open with the text intact: the one failure a person can act on is a duplicate
      // key, and acting on it means editing the field they are looking at.
      error.value = result.error;
      return;
    }
    emit("added", result.entry.lemma);
    emit("close");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <ModalDialog :open="open" title="Add to the lexicon" @close="emit('close')">
    <form class="fields" @submit.prevent="add">
      <label class="wide">
        Lemma
        <input v-model="draft.lemma" class="mono" required aria-label="Lemma" />
      </label>

      <label class="wide">
        Meaning
        <input
          v-model="draft.gloss"
          placeholder="English translation"
          aria-label="Meaning"
          autofocus
        />
      </label>

      <label>
        Word class
        <!-- A select once the project defines classes, so this and the lexicon page agree
             on the vocabulary; free text before that, so a new project is not blocked.
             Mirrors EntryDetail. -->
        <select v-if="defined.length" v-model="draft.word_class" aria-label="Word class">
          <option value="">—</option>
          <option v-for="name in defined" :key="name" :value="name">{{ name }}</option>
        </select>
        <input v-else v-model="draft.word_class" aria-label="Word class" />
      </label>

      <label>
        Key
        <input v-model="draft.entry_key" class="mono" placeholder="e.g. n_neck" aria-label="Key" />
      </label>

      <label class="wide">
        Notes
        <textarea v-model="draft.notes" rows="2" aria-label="Notes"></textarea>
      </label>
    </form>

    <p v-if="existing.length" class="note">
      The lexicon already has {{ existing.length }}
      {{ existing.length === 1 ? "entry" : "entries" }} with this lemma
      <template v-if="existing.some((e) => e.gloss)">
        ({{
          existing
            .map((e) => e.gloss)
            .filter(Boolean)
            .join(", ")
        }})</template
      >. Homographs are allowed — this adds another.
    </p>

    <p class="hint">
      The word came from the draft grammar on this page, which does not have to be saved for the
      entry to be. Nothing about the entry records that it was generated.
    </p>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <template #footer>
      <button type="button" @click="emit('close')">Cancel</button>
      <button type="submit" :disabled="saving || !draft.lemma.trim()" @click="add">
        {{ saving ? "Adding…" : "Add entry" }}
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
  min-width: min(36rem, 70vw);
}

label {
  display: grid;
  gap: var(--sp-1);
  min-width: 0;
  color: var(--c-muted);
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.wide {
  grid-column: 1 / -1;
}

input,
textarea,
select {
  color: var(--c-text);
  font-size: 0.9375rem;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
}

select {
  font: inherit;
  font-size: 0.9375rem;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
}

textarea {
  resize: vertical;
}

.mono {
  font-family: var(--font-mono);
}

.note,
.hint {
  max-width: 40rem;
  margin: var(--sp-3) 0 0;
  font-size: 0.8125rem;
}

.note {
  color: var(--c-text);
}

.hint {
  color: var(--c-muted);
}

.error {
  margin: var(--sp-3) 0 0;
  color: var(--c-danger);
  font-size: 0.875rem;
}
</style>
