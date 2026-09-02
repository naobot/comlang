<script setup lang="ts">
import type { DraftCategory, DraftClass } from "@/lib/wordClasses";

defineProps<{
  cls: DraftClass;
  index: number;
  count: number;
  /** Entries in the lexicon whose word_class names this class. */
  entries: number;
  categories: DraftCategory[];
}>();

const emit = defineEmits<{
  move: [index: number, delta: number];
  remove: [index: number];
  toggle: [index: number, name: string];
}>();
</script>

<template>
  <li class="card">
    <div class="head">
      <input
        v-model="cls.name"
        class="name"
        placeholder="class name"
        :aria-label="`Name of word class ${index + 1}`"
      />
      <!-- Open vs closed is a claim about the language, and upstream records that it is
           an open question for two of these — so it is editable, never inferred. -->
      <select v-model="cls.kind" :aria-label="`Is ${cls.name || 'this class'} open or closed?`">
        <option value="open">open</option>
        <option value="closed">closed</option>
      </select>
      <span class="entries" :title="`${entries} lexicon ${entries === 1 ? 'entry' : 'entries'}`">
        {{ entries }}
      </span>
      <button type="button" title="Move up" @click="emit('move', index, -1)">↑</button>
      <button type="button" title="Move down" @click="emit('move', index, 1)">↓</button>
      <button type="button" title="Remove" @click="emit('remove', index)">×</button>
    </div>

    <input v-model="cls.description" class="description" placeholder="what this class is" />

    <div class="categories">
      <p v-if="categories.length === 0" class="muted">
        No categories yet — add one on the right and it becomes tickable here.
      </p>
      <label v-for="category in categories" v-else :key="category.name" class="pill">
        <input
          type="checkbox"
          :checked="cls.categories.includes(category.name)"
          @change="emit('toggle', index, category.name)"
        />
        {{ category.name || "unnamed" }}
      </label>
    </div>
  </li>
</template>

<style scoped>
.card {
  padding: var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

select {
  font: inherit;
  font-size: 0.8125rem;
  padding: var(--sp-1) var(--sp-2);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  color: var(--c-text);
}

/* The lexicon's own count, not a stored one: a copy would be wrong the moment anyone
   added a word. */
.entries {
  flex: none;
  min-width: 1.5rem;
  color: var(--c-muted);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.description {
  margin-top: var(--sp-2);
  font-size: 0.875rem;
}

.categories {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1) var(--sp-2);
  margin-top: var(--sp-3);
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-1);
  padding: 2px var(--sp-2);
  border: 1px solid var(--c-border);
  border-radius: 999px;
  font-size: 0.8125rem;
  cursor: pointer;
}

.pill:has(input:checked) {
  border-color: var(--c-accent);
  color: var(--c-text);
  font-weight: 600;
}

.pill input {
  width: auto;
  margin: 0;
}

.muted {
  margin: 0;
  color: var(--c-muted);
  font-size: 0.8125rem;
}
</style>
