<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { computed } from "vue";
import { onBeforeRouteLeave } from "vue-router";

import { useDragReorder } from "@/composables/useDragReorder";
import { orphanedGraphemes } from "@/lib/orthography";
import { useMembersStore } from "@/stores/members";
import { useOrthographyStore } from "@/stores/orthography";
import { usePhonemesStore } from "@/stores/phonemes";

const props = defineProps<{ projectId: string }>();

const phonemes = usePhonemesStore();
const members = useMembersStore();
const orthography = useOrthographyStore();

const consonants = computed(() => phonemes.inventory.filter((p) => p.kind === "consonant"));
const vowels = computed(() => phonemes.inventory.filter((p) => p.kind === "vowel"));

// Kept, not deleted: a phoneme leaving the inventory must not silently erase a spelling
// someone chose for it.
const orphaned = computed(() =>
  orphanedGraphemes(orthography.draft, new Set(phonemes.inventory.map((p) => p.ipa))),
);

// The store moves by delta, because that is what the arrow buttons ask for; a drop is
// the same splice with the distance worked out from where it landed.
const reorder = useDragReorder((from, to) => orthography.moveRule(from, to - from));

async function save() {
  await orthography.save(props.projectId);
}

onBeforeRouteLeave(() => {
  if (!orthography.dirty) return true;
  return window.confirm("You have unsaved changes to the orthography. Leave anyway?");
});

useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
  if (!orthography.dirty) return;
  event.preventDefault();
});
</script>

<template>
  <section>
    <header>
      <!-- Visually hidden, not deleted: the tab already names the page, so showing it
           twice is noise — but a page with no h1 leaves a screen reader with nothing to
           announce it by. -->
      <h1 class="sr-only">Orthography</h1>
      <p class="muted">
        How the language is written down: a character (or a digraph) for each phoneme, and any
        spelling rules that don't reduce to a one-to-one mapping — digraph resolution,
        capitalization, punctuation. Everything but a rule's name is free text for now.
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
      <p v-if="orthography.changedElsewhere" class="notice" role="status">
        Someone else changed the orthography. Your draft is untouched.
        <button type="button" @click="orthography.acceptIncoming()">Load their version</button>
      </p>

      <p v-if="orphaned.length" class="broken-banner" role="alert">
        <strong>
          {{ orphaned.length === 1 ? "A grapheme names" : `${orphaned.length} graphemes name` }}
          a phoneme the inventory no longer has:
          {{ orphaned.map((g) => `/${g.phoneme_ipa}/ → "${g.grapheme}"`).join(", ") }}.
        </strong>
        Kept, but nothing generates that segment any more. Put the phoneme back on the
        <RouterLink :to="{ name: 'project-phonemes', params: { projectId } }">
          phoneme inventory </RouterLink
        >, or remove the mapping.
      </p>

      <p v-if="orthography.error" class="error" role="alert">{{ orthography.error }}</p>

      <div v-if="members.canEdit" class="bar">
        <span class="muted">
          {{ orthography.draft.graphemes.length }} mapped,
          {{ orthography.draft.rules.length }}
          {{ orthography.draft.rules.length === 1 ? "rule" : "rules" }}
          <em v-if="orthography.dirty"> · unsaved changes</em>
        </span>
        <div class="actions">
          <button
            type="button"
            :disabled="!orthography.dirty || orthography.saving"
            @click="orthography.discard()"
          >
            Discard
          </button>
          <button type="submit" :disabled="!orthography.dirty || orthography.saving" @click="save">
            {{ orthography.saving ? "Saving…" : "Save" }}
          </button>
        </div>
      </div>

      <section class="graphemes">
        <h2>Characters</h2>
        <p class="muted">
          One row per phoneme in the inventory — order here is the chart order, not a choice. A
          digraph like "ng" is just a grapheme with more than one character.
        </p>

        <div class="group">
          <h3>Consonants</h3>
          <div class="grid">
            <label v-for="p in consonants" :key="p.id" class="cell">
              <span class="ipa">/{{ p.ipa }}/</span>
              <input
                :value="orthography.graphemeFor(p.ipa)"
                :readonly="!members.canEdit"
                placeholder="—"
                :aria-label="`Spelling of /${p.ipa}/`"
                @input="orthography.setGrapheme(p.ipa, ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>
        </div>

        <div class="group">
          <h3>Vowels</h3>
          <div class="grid">
            <label v-for="p in vowels" :key="p.id" class="cell">
              <span class="ipa">/{{ p.ipa }}/</span>
              <input
                :value="orthography.graphemeFor(p.ipa)"
                :readonly="!members.canEdit"
                placeholder="—"
                :aria-label="`Spelling of /${p.ipa}/`"
                @input="orthography.setGrapheme(p.ipa, ($event.target as HTMLInputElement).value)"
              />
            </label>
          </div>
        </div>
      </section>

      <section class="rules-section">
        <h2>Rules</h2>
        <p class="muted">
          Ordered, in case one rule feeds another — drag a rule by its handle to move it, or use the
          arrows.
        </p>

        <ol class="rules">
          <li v-for="(rule, i) in orthography.draft.rules" :key="i" v-bind="reorder.item(i)">
            <div class="head">
              <!-- aria-hidden: dragging is mouse-only, and the arrows below are the
                   keyboard and touch route to the same move. -->
              <span
                v-if="members.canEdit"
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
                :readonly="!members.canEdit"
                placeholder="rule_name"
                :aria-label="`Name of rule ${i + 1}`"
              />
              <template v-if="members.canEdit">
                <button type="button" title="Move earlier" @click="orthography.moveRule(i, -1)">
                  ↑
                </button>
                <button type="button" title="Move later" @click="orthography.moveRule(i, 1)">
                  ↓
                </button>
                <button type="button" title="Remove" @click="orthography.removeRuleAt(i)">×</button>
              </template>
            </div>

            <div class="fields">
              <label>
                Effect
                <textarea
                  v-model="rule.effect"
                  :readonly="!members.canEdit"
                  rows="3"
                  placeholder="what happens, and where"
                ></textarea>
              </label>
              <label>
                Examples
                <textarea
                  v-model="rule.examples"
                  :readonly="!members.canEdit"
                  rows="3"
                  placeholder="spellings, one per line"
                ></textarea>
              </label>
            </div>
          </li>
        </ol>

        <button v-if="members.canEdit" type="button" class="add" @click="orthography.addRule()">
          + Add rule
        </button>

        <p v-if="orthography.draft.rules.length === 0" class="muted empty">No rules yet.</p>
      </section>
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

h2 {
  margin: var(--sp-6) 0 var(--sp-1);
  font-size: 1rem;
}

h3 {
  margin: var(--sp-4) 0 var(--sp-2);
  font-size: 0.8125rem;
  color: var(--c-muted);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.graphemes > p,
.rules-section > p {
  max-width: 44rem;
  margin: 0;
  font-size: 0.875rem;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: var(--sp-2);
  max-width: 64rem;
}

.cell {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  padding: var(--sp-1) var(--sp-2);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
}

.ipa {
  flex: none;
  font-family: var(--font-mono);
  color: var(--c-muted);
}

.cell input {
  flex: 1;
  min-width: 0;
  font-family: var(--font-mono);
}

/* One column even on a wide page: position is a possible pipeline, and rules flowing into
   a second column would make "what feeds what" a reading puzzle. */
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
  letter-spacing: 0.08em;
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

.broken-banner {
  margin: var(--sp-4) 0 0;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-danger);
  border-left-width: 3px;
  border-radius: var(--radius);
  font-size: 0.875rem;
}

.broken-banner strong {
  color: var(--c-danger);
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
