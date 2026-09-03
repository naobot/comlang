<script setup lang="ts">
import { computed } from "vue";

import { type CorpusDraft, useCorpusStore } from "@/stores/corpus";
import { useMembersStore } from "@/stores/members";
import type { CorpusEntry } from "@/types/models";

/**
 * The single-utterance half of the corpus: one sentence per row, English beside conlang.
 *
 * This is the grid the whole page used to be. It moved into its own component when the
 * corpus split in two (0025) so that neither view has to carry `v-if`s for the other's
 * layout — a spreadsheet row and a passage card have almost nothing in common but the
 * store.
 */
const props = defineProps<{ projectId: string; query: string }>();

const corpus = useCorpusStore();
const members = useMembersStore();

// The store does the filtering, so this list and the count in the toolbar above it are
// answering the same question.
const matches = computed(() => corpus.matching("utterance", props.query));

/**
 * Each visible row paired with its edit buffer.
 *
 * Read here rather than calling a materialise-on-demand helper from the template: that
 * would write to the store during render. The store's invariant is that every row in
 * `byId` has a draft — `fetchFor` and `upsert` are the only two places rows arrive, and
 * both set the pair together — so the guard below is a type narrowing, not a filter that
 * is expected to drop anything.
 */
const rows = computed(() =>
  matches.value
    .map((entry) => ({ entry, draft: corpus.drafts.get(entry.id) }))
    .filter((r): r is { entry: CorpusEntry; draft: CorpusDraft } => r.draft !== undefined),
);

function confirmDelete(id: string, english: string, conlang: string) {
  const label = english.trim() || conlang.trim();
  if (!window.confirm(`Delete “${label}”?`)) return;
  void corpus.remove(id);
}
</script>

<template>
  <div class="grid">
    <table>
      <thead>
        <tr>
          <th class="num"><span class="sr-only">Row</span></th>
          <th>English</th>
          <th>Conlang</th>
          <th class="actions"><span class="sr-only">Actions</span></th>
        </tr>
      </thead>
      <tbody>
        <!-- The unsaved new row. Local rather than an immediately-inserted blank,
             because the table refuses a row that is empty on both sides — which is
             exactly what a new one starts as. -->
        <tr v-if="corpus.pending && corpus.pending.kind === 'utterance'" class="new">
          <td class="num">+</td>
          <td>
            <div class="grow" :data-value="corpus.pending.english">
              <textarea
                v-model="corpus.pending.english"
                rows="1"
                aria-label="English, new example"
                @keydown.enter.meta.prevent="corpus.saveNew(projectId)"
                @keydown.enter.ctrl.prevent="corpus.saveNew(projectId)"
              />
            </div>
          </td>
          <td>
            <div class="grow conlang" :data-value="corpus.pending.conlang">
              <textarea
                v-model="corpus.pending.conlang"
                rows="1"
                aria-label="Conlang, new example"
                @keydown.enter.meta.prevent="corpus.saveNew(projectId)"
                @keydown.enter.ctrl.prevent="corpus.saveNew(projectId)"
              />
            </div>
          </td>
          <td class="actions">
            <button
              type="button"
              class="primary"
              :disabled="corpus.savingNew"
              @click="corpus.saveNew(projectId)"
            >
              {{ corpus.savingNew ? "Saving…" : "Save" }}
            </button>
            <button type="button" @click="corpus.cancelNew()">Cancel</button>
          </td>
        </tr>

        <tr v-for="({ entry, draft }, i) in rows" :key="entry.id">
          <td class="num">{{ i + 1 }}</td>
          <td>
            <div class="grow" :data-value="draft.english">
              <textarea
                v-model="draft.english"
                :readonly="!members.canEdit"
                rows="1"
                :aria-label="`English, row ${i + 1}`"
                @keydown.enter.meta.prevent="corpus.saveRow(entry.id)"
                @keydown.enter.ctrl.prevent="corpus.saveRow(entry.id)"
              />
            </div>
          </td>
          <td>
            <div class="grow conlang" :data-value="draft.conlang">
              <textarea
                v-model="draft.conlang"
                :readonly="!members.canEdit"
                rows="1"
                :aria-label="`Conlang, row ${i + 1}`"
                @keydown.enter.meta.prevent="corpus.saveRow(entry.id)"
                @keydown.enter.ctrl.prevent="corpus.saveRow(entry.id)"
              />
            </div>
          </td>
          <td class="actions">
            <!-- Nothing here for a visitor to a published conlang: every one of these is
                 a write, and the row itself is already readable beside it. -->
            <template v-if="members.canEdit">
              <template v-if="corpus.isDirty(entry.id)">
                <button
                  type="button"
                  class="primary"
                  :disabled="corpus.savingIds.has(entry.id)"
                  @click="corpus.saveRow(entry.id)"
                >
                  {{ corpus.savingIds.has(entry.id) ? "Saving…" : "Save" }}
                </button>
                <button type="button" @click="corpus.revert(entry.id)">Revert</button>
              </template>
              <template v-else>
                <!-- The correction for a row that has grown past one sentence, and for an
                     import's guess. It takes effect at once: it changes where the example
                     is edited, not what it says. -->
                <button
                  type="button"
                  title="Edit this as a passage instead"
                  @click="corpus.setKind(entry.id, 'passage')"
                >
                  → Passage
                </button>
                <button
                  type="button"
                  class="danger-action"
                  @click="confirmDelete(entry.id, entry.english, entry.conlang)"
                >
                  Delete
                </button>
              </template>

              <!-- Held, not applied: someone else changed a row this client is in the
                   middle of editing. Their version is one click away and nothing is
                   lost either way. -->
              <p v-if="corpus.incoming.has(entry.id)" class="held">
                Changed by someone else.
                <button type="button" class="link" @click="corpus.acceptIncoming(entry.id)">
                  Use theirs
                </button>
              </p>
            </template>
          </td>
        </tr>
      </tbody>
    </table>

    <p v-if="rows.length === 0 && !corpus.pending" class="empty muted">
      <template v-if="query.trim()">Nothing matches “{{ query.trim() }}”.</template>
      <template v-else>
        No single sentences yet. Add one, or import a CSV of English and conlang pairs.
      </template>
    </p>
  </div>
</template>

<style scoped>
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* The one scrolling region. min-height: 0 or a flex child refuses to shrink below its
   content and the overflow simply reappears on the page. */
.grid {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
}

table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

/* Sticky so the column names survive scrolling — the two columns are both prose and
   otherwise indistinguishable a screen down. */
thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--c-surface);
  border-bottom: 1px solid var(--c-border);
  padding: var(--sp-2) var(--sp-3);
  text-align: left;
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--c-muted);
}

tbody td {
  border-bottom: 1px solid var(--c-border);
  padding: 0;
  vertical-align: top;
}

.num {
  width: 3rem;
  padding: var(--sp-2) var(--sp-3);
  color: var(--c-faint);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.actions {
  width: 14rem;
  padding: var(--sp-2) var(--sp-3);
  white-space: nowrap;
}

.actions button + button {
  margin-left: var(--sp-2);
}

/* Mirrors the global `button[type="submit"]` and EntryDetail's `.danger-action`. These
   are real buttons in a grid rather than a form's submit, so the styling is by class. */
.primary {
  background: var(--c-accent);
  color: var(--c-accent-text);
  border-color: transparent;
}

.primary:hover:not(:disabled) {
  background: var(--c-text);
}

.danger-action {
  color: var(--c-danger);
  border-color: var(--c-danger);
}

.new td {
  background: var(--c-raised);
}

/**
 * A textarea that grows with its text, with no JavaScript in the loop.
 *
 * The wrapper is a 1x1 grid holding both the textarea and a hidden ::after carrying the
 * same string, stacked in the same cell: the pseudo-element sets the row height and the
 * textarea stretches to it. A sentence is the unit of content here, so a fixed-height
 * input that scrolled its own single line would hide exactly what the page is for.
 */
.grow {
  display: grid;
}

.grow::after {
  content: attr(data-value) " ";
  visibility: hidden;
  white-space: pre-wrap;
}

.grow > textarea,
.grow::after {
  grid-area: 1 / 1;
  min-width: 0;
  padding: var(--sp-2) var(--sp-3);
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 0.875rem;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.grow > textarea {
  resize: none;
  overflow: hidden;
}

.grow > textarea:focus {
  outline: 2px solid var(--c-accent);
  outline-offset: -2px;
  border-radius: var(--radius);
}

.conlang > textarea,
.conlang::after {
  font-family: var(--font-mono);
}

.held {
  margin: var(--sp-2) 0 0;
  color: var(--c-muted);
  font-size: 0.6875rem;
  white-space: normal;
}

.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-accent);
  text-decoration: underline;
  /* Content, not a control: a link inside a sentence keeps the sentence's face. */
  font-family: var(--font-ui);
  text-transform: none;
  letter-spacing: normal;
  font-size: inherit;
}

.empty {
  padding: var(--sp-6) var(--sp-3);
  font-size: 0.875rem;
}

.muted {
  color: var(--c-muted);
  font-size: 0.875rem;
}

/* The action column is the first thing to give up its width; below this the two prose
   columns matter more than always-visible labels. */
@media (max-width: 52rem) {
  .actions {
    width: 7rem;
    white-space: normal;
  }

  .actions button + button {
    margin: var(--sp-1) 0 0;
  }
}
</style>
