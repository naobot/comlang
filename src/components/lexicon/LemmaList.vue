<script setup lang="ts">
import { computed, ref } from "vue";

import { useLexiconStore } from "@/stores/lexicon";

const lexicon = useLexiconStore();
const emit = defineEmits<{ pick: [id: string]; create: [lemma: string] }>();

const query = ref("");

// Filtered on the client. A lexicon runs to a few hundred entries at most, all of them
// already loaded, so a round trip per keystroke would be strictly worse.
//
// Searching the gloss and word class as well as the lemma is the point: looking a word up
// by its English meaning is what you do when you don't yet know the conlang form.
const matches = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return lexicon.entries;
  return lexicon.entries.filter((e) =>
    [e.lemma, e.gloss, e.word_class, e.entry_key].some((field) =>
      (field ?? "").toLowerCase().includes(q),
    ),
  );
});

const exactLemma = computed(() =>
  matches.value.some((e) => e.lemma.toLowerCase() === query.value.trim().toLowerCase()),
);
</script>

<template>
  <div class="panel">
    <div class="search">
      <input
        v-model="query"
        type="search"
        placeholder="Search lemma or meaning"
        aria-label="Search the lexicon"
      />
    </div>

    <p class="count">
      {{ matches.length }}
      {{ matches.length === 1 ? "entry" : "entries" }}
      <span v-if="query.trim()">of {{ lexicon.count }}</span>
    </p>

    <ul class="lemmas">
      <li v-for="entry in matches" :key="entry.id">
        <button
          type="button"
          :class="{ on: entry.id === lexicon.openId }"
          :aria-current="entry.id === lexicon.openId ? 'true' : undefined"
          @click="emit('pick', entry.id)"
        >
          <span class="lemma">{{ entry.lemma }}</span>
          <span class="gloss">{{ entry.gloss || "—" }}</span>
          <span v-if="entry.id === lexicon.openId && lexicon.dirty" class="dot" title="Unsaved"
            >●</span
          >
        </button>
      </li>
    </ul>

    <p v-if="matches.length === 0" class="empty">
      <template v-if="query.trim()">Nothing matches “{{ query.trim() }}”.</template>
      <template v-else>No entries yet.</template>
    </p>

    <!-- Offering the search text as the new lemma turns a failed lookup into the next
         action, which is usually what a miss means in a dictionary you are writing. -->
    <button
      v-if="query.trim() && !exactLemma"
      type="button"
      class="add"
      @click="emit('create', query.trim())"
    >
      <span class="add-label">+ Add “{{ query.trim() }}”</span>
    </button>
    <button v-else type="button" class="add" @click="emit('create', '')">+ New entry</button>
  </div>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.search input {
  width: 100%;
}

.count {
  margin: var(--sp-2) 0;
  color: var(--c-muted);
  font-size: 0.75rem;
}

.lemmas {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  min-height: 0;
  flex: 1;
}

.lemmas button {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0 var(--sp-2);
  width: 100%;
  padding: var(--sp-2);
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  text-align: left;
  text-transform: none;
  /* Content, not a control: a lemma and its gloss are prose and have to wrap. */
  white-space: normal;
  letter-spacing: normal;
  font-size: 0.875rem;
  font-weight: 400;
}

.lemmas button:hover {
  background: var(--c-raised);
}

.lemmas button.on {
  background: var(--c-raised);
  font-weight: 600;
}

.lemma {
  font-family: var(--font-mono);
  overflow-wrap: anywhere;
}

.gloss {
  grid-column: 1;
  color: var(--c-muted);
  font-size: 0.75rem;
  overflow-wrap: anywhere;
}

.dot {
  grid-row: 1 / span 2;
  align-self: center;
  color: var(--c-accent);
  font-size: 0.625rem;
}

.empty {
  padding: var(--sp-3) var(--sp-2);
  color: var(--c-muted);
  font-size: 0.8125rem;
}

.add {
  margin-top: var(--sp-2);
  width: 100%;
}

/* This is the one button whose label is arbitrary user text. Buttons do not wrap, so a
   long search term has to be truncated rather than left to overflow the sidebar — and
   the ellipsis needs a real element, since it cannot apply to a bare flex text run. */
.add-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
