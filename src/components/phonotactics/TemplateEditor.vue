<script setup lang="ts">
import { computed, ref } from "vue";

import SlotPhonemesDialog from "@/components/phonotactics/SlotPhonemesDialog.vue";
import { useDragReorder } from "@/composables/useDragReorder";
import { duplicateTemplateNames, templateNotation } from "@/lib/phonotactics";
import { usePhonotacticsStore } from "@/stores/phonotactics";
import type { DraftSlot } from "@/stores/phonotactics";
import type { SlotRole } from "@/types/models";

const phonotactics = usePhonotacticsStore();
const newName = ref("");

const ROLES: SlotRole[] = ["onset", "nucleus", "coda"];

const classSymbols = computed(() => phonotactics.draft.classes.map((c) => c.symbol));

/**
 * Templates are addressed by index everywhere here, and `:key` is the index too.
 *
 * The name is editable, so it is no longer an identity: keying on it would remount the
 * row — and drop focus — on every keystroke, and the store's edits would go looking for a
 * name that is halfway to being something else.
 */
const reorder = useDragReorder((from, to) => phonotactics.moveTemplate(from, to));

/**
 * Shown, not prevented. Two templates may pass through the same name while one of them is
 * being retyped, and refusing the keystroke would mean a name could never be edited into
 * another's. `save` is where it is refused, with a message that says which.
 */
const duplicates = computed(() => new Set(duplicateTemplateNames(phonotactics.draft)));

const nameIsBad = (name: string) => !name.trim() || duplicates.value.has(name.trim());

/** Which slot's phoneme picker is open. One at a time; null is closed. */
const editing = ref<{ templateIndex: number; index: number } | null>(null);

const editingSlot = computed<DraftSlot | null>(() => {
  if (!editing.value) return null;
  const template = phonotactics.draft.templates[editing.value.templateIndex];
  return template?.slots[editing.value.index] ?? null;
});

const membersOf = (symbol: string) =>
  phonotactics.draft.classes.find((c) => c.symbol === symbol)?.phoneme_ipa.length ?? 0;

/**
 * What the slot draws from, said in one short label: how many segments, and out of how
 * many its class holds. A following slot says "all"; a restricted one says the count, so
 * the difference is legible without opening anything.
 */
function slotSummary(slot: DraftSlot) {
  const total = membersOf(slot.class_symbol);
  if (slot.phoneme_ipa === null) return `all ${total}`;
  return `${slot.phoneme_ipa.length} of ${total}`;
}

// The notation comes from the same function the generator uses, so the formal string and
// the widgets below it cannot drift apart. By index rather than by name: `resolveGrammar`
// maps the draft's templates in order, and two of them may share a name mid-edit.
const notationFor = (index: number) => {
  const template = phonotactics.grammar.templates[index];
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
      picked relative to the others. Drag a template by its handle to reorder it, or use the arrows.
    </p>

    <p v-if="classSymbols.length === 0" class="warn">
      Define at least one phoneme class first — a slot has to name one.
    </p>

    <ul class="templates">
      <li v-for="(template, t) in phonotactics.draft.templates" :key="t" v-bind="reorder.item(t)">
        <div class="head">
          <!-- aria-hidden: dragging is mouse-only; the arrows are the keyboard route. -->
          <span
            class="drag-handle"
            aria-hidden="true"
            title="Drag to reorder"
            v-bind="reorder.handle(t)"
            >⠿</span
          >
          <code class="notation">{{ notationFor(t) }}</code>
          <input
            v-model="template.name"
            class="name"
            :class="{ bad: nameIsBad(template.name) }"
            placeholder="template name"
            :aria-label="`Name of template ${t + 1}`"
          />
          <label class="weight">
            weight
            <input v-model.number="template.weight" type="number" min="1" step="1" />
          </label>
          <button type="button" title="Move up" @click="phonotactics.moveTemplate(t, t - 1)">
            ↑
          </button>
          <button type="button" title="Move down" @click="phonotactics.moveTemplate(t, t + 1)">
            ↓
          </button>
          <button type="button" @click="phonotactics.removeTemplateAt(t)">Remove</button>
        </div>

        <ol class="slots">
          <li v-for="(slot, i) in template.slots" :key="i">
            <!-- An action, not a v-model: changing the class drops the slot's own
                 selection, which was drawn from the class it is leaving. -->
            <select
              :value="slot.class_symbol"
              :aria-label="`Slot ${i + 1} class`"
              @change="phonotactics.setSlotClass(t, i, ($event.target as HTMLSelectElement).value)"
            >
              <option v-for="symbol in classSymbols" :key="symbol" :value="symbol">
                {{ symbol }}
              </option>
            </select>
            <button
              type="button"
              class="phonemes"
              :class="{ restricted: slot.phoneme_ipa !== null }"
              :aria-label="`Choose phonemes for slot ${i + 1}`"
              @click="editing = { templateIndex: t, index: i }"
            >
              {{ slotSummary(slot) }}
            </button>
            <select v-model="slot.role" :aria-label="`Slot ${i + 1} role`">
              <option v-for="role in ROLES" :key="role" :value="role">{{ role }}</option>
            </select>
            <label class="opt">
              <input v-model="slot.optional" type="checkbox" />
              optional
            </label>
            <button type="button" title="Move left" @click="phonotactics.moveSlot(t, i, -1)">
              ←
            </button>
            <button type="button" title="Move right" @click="phonotactics.moveSlot(t, i, 1)">
              →
            </button>
            <button type="button" @click="phonotactics.removeSlot(t, i)">×</button>
          </li>
        </ol>

        <div class="addslot">
          <button
            v-for="symbol in classSymbols"
            :key="symbol"
            type="button"
            @click="
              phonotactics.addSlot(t, symbol, template.slots.length === 0 ? 'nucleus' : 'coda')
            "
          >
            + {{ symbol }}
          </button>
        </div>
      </li>
    </ul>

    <SlotPhonemesDialog
      v-if="editing && editingSlot"
      :open="true"
      :template-index="editing.templateIndex"
      :slot-index="editing.index"
      :slot-draft="editingSlot"
      @close="editing = null"
    />

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

.head .name {
  flex: 1;
  min-width: 0;
  font-weight: 600;
}

/* Blank, or shared with another template. Not blocked — see `duplicates` — but a save
   will refuse it, so it says so before the button is pressed. */
.head .name.bad {
  border-color: var(--c-danger);
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

.phonemes {
  /* Content, not a label: a count reads worse tracked out and uppercased. */
  text-transform: none;
  letter-spacing: normal;
  font-weight: 400;
  color: var(--c-muted);
}

/* Matches the ′ the notation above carries, so the row and the formal string agree. */
.phonemes.restricted {
  color: var(--c-text);
  border-color: var(--c-accent);
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
