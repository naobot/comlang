<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { onBeforeRouteLeave } from "vue-router";

import { useDragReorder } from "@/composables/useDragReorder";
import { useGrammarRulesStore } from "@/stores/grammarRules";
import { usePhonemesStore } from "@/stores/phonemes";

const props = defineProps<{ projectId: string }>();

const rules = useGrammarRulesStore();
const phonemes = usePhonemesStore();

// The store moves by delta, because that is what the arrow buttons ask for; a drop is
// the same splice with the distance worked out from where it landed.
const reorder = useDragReorder((from, to) => rules.move(from, to - from));

async function save() {
  await rules.save(props.projectId);
}

onBeforeRouteLeave(() => {
  if (!rules.dirty) return true;
  return window.confirm("You have unsaved changes to the grammar rules. Leave anyway?");
});

useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
  if (!rules.dirty) return;
  event.preventDefault();
});
</script>

<template>
  <section>
    <header>
      <!-- Visually hidden, not deleted: the tab already names the page, so showing it
           twice is noise — but a page with no h1 leaves a screen reader with nothing to
           announce it by. -->
      <h1 class="sr-only">Grammar rules</h1>
      <p class="muted">
        Ordered, because the order is the pipeline — a rule applies to what the rules above it have
        already produced. Drag a rule by its handle to move it, or use the arrows. Everything but
        the name is free text for now.
      </p>
    </header>

    <div v-if="phonemes.count === 0" class="gate">
      <p class="muted">
        Nothing to build from yet — this section works from the phoneme inventory, and this language
        doesn't have one.
      </p>
      <RouterLink :to="{ name: 'project-phonemes', params: { projectId } }">
        Set up the phoneme inventory →
      </RouterLink>
    </div>

    <template v-else>
      <p v-if="rules.changedElsewhere" class="notice" role="status">
        Someone else changed the grammar rules. Your draft is untouched.
        <button type="button" @click="rules.acceptIncoming()">Load their version</button>
      </p>

      <p v-if="rules.error" class="error" role="alert">{{ rules.error }}</p>

      <div class="bar">
        <span class="muted">
          {{ rules.draft.length }} {{ rules.draft.length === 1 ? "rule" : "rules" }}
          <em v-if="rules.dirty"> · unsaved changes</em>
        </span>
        <div class="actions">
          <button type="button" :disabled="!rules.dirty || rules.saving" @click="rules.discard()">
            Discard
          </button>
          <button type="submit" :disabled="!rules.dirty || rules.saving" @click="save">
            {{ rules.saving ? "Saving…" : "Save" }}
          </button>
        </div>
      </div>

      <ol class="rules">
        <li v-for="(rule, i) in rules.draft" :key="i" v-bind="reorder.item(i)">
          <div class="head">
            <!-- aria-hidden: dragging is mouse-only, and the arrows below are the
                 keyboard and touch route to the same move. -->
            <span
              class="drag-handle"
              aria-hidden="true"
              title="Drag to reorder"
              v-bind="reorder.handle(i)"
              >⠿</span
            >
            <span class="index">{{ i + 1 }}</span>
            <input
              v-model="rule.name"
              class="name"
              placeholder="rule_name"
              :aria-label="`Name of rule ${i + 1}`"
            />
            <button type="button" title="Move earlier" @click="rules.move(i, -1)">↑</button>
            <button type="button" title="Move later" @click="rules.move(i, 1)">↓</button>
            <button type="button" title="Remove" @click="rules.removeAt(i)">×</button>
          </div>

          <div class="fields">
            <label>
              Effect
              <textarea v-model="rule.effect" rows="2" placeholder="what the rule does"></textarea>
            </label>
            <label>
              Environment
              <textarea
                v-model="rule.environment"
                rows="2"
                placeholder="where it applies"
              ></textarea>
            </label>
            <label>
              Examples
              <textarea
                v-model="rule.examples"
                rows="3"
                placeholder="derivations, one per line"
              ></textarea>
            </label>
            <label>
              Notes
              <textarea
                v-model="rule.notes"
                rows="3"
                placeholder="evidence, provenance, open questions"
              ></textarea>
            </label>
          </div>
        </li>
      </ol>

      <button type="button" class="add" @click="rules.add()">+ Add rule</button>

      <p v-if="rules.draft.length === 0" class="muted empty">
        No rules yet. The first one you add applies first.
      </p>
    </template>
  </section>
</template>

<style scoped>
/* The heading stays in the document for structure, out of the layout for looks. */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

header p {
  max-width: 44rem;
  margin: 0;
  font-size: 0.875rem;
}

.gate {
  padding: var(--sp-8) 0;
  text-align: center;
}

.gate p {
  max-width: 34rem;
  margin: 0 auto var(--sp-4);
}

.bar {
  position: sticky;
  top: var(--header-h);
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--sp-3);
  margin: var(--sp-6) 0 var(--sp-4);
  padding: var(--sp-3) 0;
  border-bottom: 1px solid var(--c-border);
  background: var(--c-bg);
}

.actions {
  display: flex;
  gap: var(--sp-2);
}

.bar em {
  font-style: normal;
  color: var(--c-accent);
  font-weight: 600;
}

/* One column even on a wide page: position is the pipeline, and rules flowing into a
   second column would make "what feeds what" a reading puzzle. */
.rules {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sp-4);
  max-width: 80rem;
}

.rules > li {
  padding: var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
}

.head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

/* The number is the point of the list, not decoration: it is the order of application. */
.index {
  flex: none;
  width: 1.5rem;
  color: var(--c-muted);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.name {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
  font-weight: 600;
}

.fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
  margin-top: var(--sp-3);
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

textarea {
  color: var(--c-text);
  font-size: 0.9375rem;
  letter-spacing: normal;
  text-transform: none;
  resize: vertical;
}

.add {
  margin-top: var(--sp-4);
}

.empty {
  margin-top: var(--sp-4);
}

.notice {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
  margin: var(--sp-4) 0 0;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-left: 3px solid var(--c-accent);
  border-radius: var(--radius);
  background: var(--c-raised);
  font-size: 0.875rem;
}

.muted {
  color: var(--c-muted);
  font-size: 0.875rem;
}

.error {
  color: var(--c-danger);
}

@media (max-width: 40rem) {
  .fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
