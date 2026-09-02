<script setup lang="ts">
import type { DragHandleProps } from "@/composables/useDragReorder";
import type { DraftCategory } from "@/lib/wordClasses";

defineProps<{
  category: DraftCategory;
  index: number;
  usedBy: string[];
  /** See `ClassCard`: the handle renders here, the dragging is the list's business. */
  handle: DragHandleProps;
}>();

const emit = defineEmits<{
  move: [index: number, delta: number];
  remove: [index: number];
  rename: [index: number, name: string];
  addValue: [index: number];
  removeValue: [index: number, valueIndex: number];
}>();
</script>

<template>
  <li class="card">
    <div class="head">
      <!-- aria-hidden: dragging is mouse-only; the arrows are the keyboard route. -->
      <span class="drag-handle" aria-hidden="true" title="Drag to reorder" v-bind="handle">⠿</span>
      <!-- Renaming goes through the store rather than v-model: the classes that inflect
           for this category refer to it by name, and those references have to move too. -->
      <input
        class="name"
        :value="category.name"
        placeholder="category name"
        :aria-label="`Name of category ${index + 1}`"
        @input="emit('rename', index, ($event.target as HTMLInputElement).value)"
      />
      <button type="button" title="Move up" @click="emit('move', index, -1)">↑</button>
      <button type="button" title="Move down" @click="emit('move', index, 1)">↓</button>
      <button type="button" title="Remove" @click="emit('remove', index)">×</button>
    </div>

    <input v-model="category.description" class="description" placeholder="what it marks" />

    <ul class="values">
      <li v-for="(value, j) in category.values" :key="j">
        <input v-model="value.value" class="value" placeholder="value" aria-label="Value" />
        <input v-model="value.notes" class="notes" placeholder="note (optional)" />
        <button type="button" title="Remove value" @click="emit('removeValue', index, j)">×</button>
      </li>
    </ul>

    <div class="foot">
      <button type="button" @click="emit('addValue', index)">+ Value</button>
      <p v-if="usedBy.length" class="muted">{{ usedBy.join(", ") }}</p>
      <p v-else class="muted">No class inflects for this yet.</p>
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

.description {
  margin-top: var(--sp-2);
  font-size: 0.875rem;
}

.values {
  list-style: none;
  margin: var(--sp-3) 0 0;
  padding: 0;
  display: grid;
  gap: var(--sp-2);
}

.values li {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.value {
  flex: 0 0 9rem;
  font-family: var(--font-mono);
  font-size: 0.875rem;
}

.notes {
  flex: 1;
  min-width: 0;
  font-size: 0.8125rem;
}

.foot {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-top: var(--sp-3);
}

.muted {
  margin: 0;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--c-muted);
  font-size: 0.75rem;
}
</style>
