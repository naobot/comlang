<script setup lang="ts">
import { computed } from "vue";

import { useLexiconStore } from "@/stores/lexicon";

const props = defineProps<{ projectId: string }>();
const lexicon = useLexiconStore();

const title = computed(() => {
  if (lexicon.creating) return lexicon.draft.lemma.trim() || "New entry";
  return lexicon.draft.lemma.trim() || "—";
});

async function save() {
  await lexicon.saveOpen(props.projectId);
}

async function remove() {
  if (!lexicon.openId) return;
  const label = lexicon.draft.lemma.trim() || "this entry";
  if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
  await lexicon.remove(lexicon.openId);
}
</script>

<template>
  <section class="detail">
    <header>
      <h2>{{ title }}</h2>
      <span v-if="lexicon.dirty" class="unsaved">unsaved</span>
    </header>

    <!-- Someone else edited this entry while it was being changed here. Their version is
         held aside rather than applied, so nothing typed is lost either way. -->
    <p v-if="lexicon.incoming" class="notice" role="status">
      Someone else changed this entry. Your edits are untouched.
      <button type="button" @click="lexicon.acceptIncoming()">Load theirs</button>
    </p>

    <!-- The pane deliberately keeps its text: it is still work, and saving it again
         recreates the entry. -->
    <p v-if="lexicon.openDeletedElsewhere" class="notice danger" role="alert">
      Someone else deleted this entry. What's below is still here — saving will create it again.
    </p>

    <p v-if="lexicon.error" class="error" role="alert">{{ lexicon.error }}</p>

    <form @submit.prevent="save">
      <label class="wide">
        Lemma
        <input v-model="lexicon.draft.lemma" class="mono" required aria-label="Lemma" />
      </label>

      <label class="wide">
        Meaning
        <input v-model="lexicon.draft.gloss" placeholder="English translation" />
      </label>

      <label>
        Word class
        <!-- Free text with suggestions rather than a select: the word-classes schema is
             tabled, and a fixed list here would quietly decide it. -->
        <input v-model="lexicon.draft.word_class" list="lexicon-word-classes" />
        <datalist id="lexicon-word-classes">
          <option v-for="wc in lexicon.wordClasses" :key="wc ?? ''" :value="wc ?? ''" />
        </datalist>
      </label>

      <label>
        Key
        <input v-model="lexicon.draft.entry_key" class="mono" placeholder="e.g. n_neck" />
      </label>

      <label class="wide">
        Notes
        <textarea v-model="lexicon.draft.notes" rows="5"></textarea>
      </label>

      <div class="actions">
        <button type="submit" :disabled="!lexicon.dirty || lexicon.saving">
          {{ lexicon.saving ? "Saving…" : "Save" }}
        </button>
        <button
          type="button"
          :disabled="!lexicon.dirty || lexicon.saving"
          @click="lexicon.discard()"
        >
          Discard
        </button>
        <button
          v-if="lexicon.openId && !lexicon.openDeletedElsewhere"
          type="button"
          class="danger-action"
          @click="remove"
        >
          Delete
        </button>
      </div>
    </form>

    <p class="hint">
      Fields are free-form for now. Word class becomes a real reference once that section is
      designed.
    </p>
  </section>
</template>

<style scoped>
.detail {
  min-width: 0;
}

header {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  margin-bottom: var(--sp-4);
}

h2 {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 1.25rem;
  overflow-wrap: anywhere;
}

.unsaved {
  color: var(--c-accent);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-4);
}

label {
  display: grid;
  gap: var(--sp-1);
  color: var(--c-muted);
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  min-width: 0;
}

label.wide {
  grid-column: 1 / -1;
}

label input,
label textarea {
  color: var(--c-text);
  font-size: 1rem;
  letter-spacing: normal;
  text-transform: none;
}

.mono {
  font-family: var(--font-mono);
}

textarea {
  resize: vertical;
}

.actions {
  grid-column: 1 / -1;
  display: flex;
  gap: var(--sp-2);
}

.danger-action {
  margin-left: auto;
  color: var(--c-danger);
  border-color: var(--c-danger);
}

.notice {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
  margin: 0 0 var(--sp-4);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-left: 3px solid var(--c-accent);
  border-radius: var(--radius);
  background: var(--c-raised);
  font-size: 0.875rem;
}

.notice.danger {
  border-color: var(--c-danger);
  color: var(--c-danger);
}

.error {
  margin: 0 0 var(--sp-4);
  color: var(--c-danger);
}

.hint {
  margin-top: var(--sp-6);
  color: var(--c-muted);
  font-size: 0.8125rem;
}

@media (max-width: 34rem) {
  form {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
