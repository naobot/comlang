<script setup lang="ts">
import { computed, ref } from "vue";

import { templateNotation } from "@/lib/phonotactics";
import { usePhonotacticsStore } from "@/stores/phonotactics";
import type { SlotRole } from "@/types/models";

const phonotactics = usePhonotacticsStore();
const newName = ref("");

const ROLES: SlotRole[] = ["onset", "nucleus", "coda"];

const classSymbols = computed(() => phonotactics.draft.classes.map((c) => c.symbol));

// The notation comes from the same function the generator uses, so the formal string and
// the widgets below it cannot drift apart.
const notationFor = (name: string) => {
  const template = phonotactics.grammar.templates.find((t) => t.name === name);
  return template ? templateNotation(template) : "∅";
};

function add() {
  if (phonotactics.addTemplate(newName.value)) newName.value = "";
}
</script>

<template>
  <section>
    <h2>Syllable templates</h2>
    <p class="hint">
      An ordered run of slots. Optional slots are bracketed, and weight sets how often a template is
      picked relative to the others.
    </p>

    <p v-if="classSymbols.length === 0" class="warn">
      Define at least one phoneme class first — a slot has to name one.
    </p>

    <ul class="templates">
      <li v-for="template in phonotactics.draft.templates" :key="template.name">
        <div class="head">
          <code class="notation">{{ notationFor(template.name) }}</code>
          <strong>{{ template.name }}</strong>
          <label class="weight">
            weight
            <input v-model.number="template.weight" type="number" min="1" step="1" />
          </label>
          <button type="button" @click="phonotactics.removeTemplate(template.name)">Remove</button>
        </div>

        <ol class="slots">
          <li v-for="(slot, i) in template.slots" :key="i">
            <select v-model="slot.class_symbol" :aria-label="`Slot ${i + 1} class`">
              <option v-for="symbol in classSymbols" :key="symbol" :value="symbol">
                {{ symbol }}
              </option>
            </select>
            <select v-model="slot.role" :aria-label="`Slot ${i + 1} role`">
              <option v-for="role in ROLES" :key="role" :value="role">{{ role }}</option>
            </select>
            <label class="opt">
              <input v-model="slot.optional" type="checkbox" />
              optional
            </label>
            <button
              type="button"
              title="Move left"
              @click="phonotactics.moveSlot(template.name, i, -1)"
            >
              ←
            </button>
            <button
              type="button"
              title="Move right"
              @click="phonotactics.moveSlot(template.name, i, 1)"
            >
              →
            </button>
            <button type="button" @click="phonotactics.removeSlot(template.name, i)">×</button>
          </li>
        </ol>

        <div class="addslot">
          <button
            v-for="symbol in classSymbols"
            :key="symbol"
            type="button"
            @click="
              phonotactics.addSlot(
                template.name,
                symbol,
                template.slots.length === 0 ? 'nucleus' : 'coda',
              )
            "
          >
            + {{ symbol }}
          </button>
        </div>
      </li>
    </ul>

    <form class="add" @submit.prevent="add">
      <input
        v-model="newName"
        placeholder="New template name, e.g. heavy"
        aria-label="Template name"
      />
      <button type="submit" :disabled="!newName.trim()">Add template</button>
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

.warn {
  color: var(--c-danger);
  font-size: 0.8125rem;
}

.templates {
  list-style: none;
  margin: 0 0 var(--sp-4);
  padding: 0;
  display: grid;
  gap: var(--sp-3);
}

.templates > li {
  padding: var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.notation {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 700;
  padding: var(--sp-1) var(--sp-2);
  border-radius: var(--radius);
  background: var(--c-raised);
}

.head strong {
  flex: 1;
  min-width: 0;
}

.weight {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  color: var(--c-muted);
  font-size: 0.75rem;
}

.weight input {
  width: 4rem;
}

.slots {
  list-style: none;
  margin: var(--sp-3) 0 0;
  padding: 0;
  display: grid;
  gap: var(--sp-1);
}

.slots li {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
}

.slots select {
  font: inherit;
  padding: var(--sp-1) var(--sp-2);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  color: var(--c-text);
}

.opt {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  color: var(--c-muted);
  font-size: 0.75rem;
}

.opt input {
  width: auto;
}

.addslot {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  margin-top: var(--sp-3);
}

.add {
  display: flex;
  gap: var(--sp-2);
  max-width: 24rem;
}
</style>
