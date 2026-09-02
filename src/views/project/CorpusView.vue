<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { computed, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";

import { useProjectExport } from "@/composables/useProjectExport";
import { parseCorpusCsv, planCorpusImport } from "@/lib/corpusImport";
import { type CorpusDraft, useCorpusStore } from "@/stores/corpus";
import { usePhonemesStore } from "@/stores/phonemes";
import type { CorpusEntry } from "@/types/models";

const props = defineProps<{ projectId: string }>();

const corpus = useCorpusStore();
const phonemes = usePhonemesStore();

// The same composable the header menu and the lexicon page use, so no two exports of the
// same data can drift apart.
const exporter = useProjectExport(() => props.projectId);

const query = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const importing = ref(false);

// Filtered on the client over rows that are already loaded, as in the lexicon: a corpus
// runs to a few hundred examples and a round trip per keystroke would be strictly worse.
// Both columns are searched, because you look an example up by whichever side you know.
const matches = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return corpus.entries;
  return corpus.entries.filter((e) => `${e.english} ${e.conlang}`.toLowerCase().includes(q));
});

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

function chooseFile() {
  fileInput.value?.click();
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Cleared immediately so picking the same file twice in a row still fires a change.
  input.value = "";
  if (!file) return;

  importing.value = true;
  try {
    const parsed = parseCorpusCsv(await file.text());
    if (parsed.problems.length) {
      // Every problem at once: fixing one in a spreadsheet and re-importing to find the
      // next is a miserable loop.
      window.alert(`That file can't be imported:\n\n${parsed.problems.join("\n")}`);
      return;
    }

    const plan = planCorpusImport(parsed.rows, corpus.entries);
    if (plan.add === 0) {
      window.alert(
        `Every one of those ${parsed.rows.length} rows is already in the corpus, so there ` +
          "is nothing to add.",
      );
      return;
    }

    // Says what it will do before it does it. This format has no key column, so an import
    // only ever adds — a corrected sentence arrives as a second row rather than replacing
    // the first, and that is worth seeing before, not after.
    const skipped = plan.skip
      ? ` ${plan.skip} ${plan.skip === 1 ? "row is" : "rows are"} already in the corpus and ` +
        "will be skipped."
      : "";

    if (
      !window.confirm(
        `Import ${file.name}? This will add ${plan.add} ` +
          `${plan.add === 1 ? "example" : "examples"}.${skipped} Nothing is changed or ` +
          "deleted — examples are matched only by being identical on both sides, since the " +
          "file has no key column.",
      )
    ) {
      return;
    }

    const result = await corpus.importRows(props.projectId, parsed.rows);
    if (result) {
      window.alert(`Imported: ${result.created} added, ${result.skipped} skipped.`);
    }
  } finally {
    importing.value = false;
  }
}

function confirmDelete(id: string, english: string, conlang: string) {
  const label = english.trim() || conlang.trim();
  if (!window.confirm(`Delete “${label}”?`)) return;
  void corpus.remove(id);
}

// Unsaved cells are the thing to protect here, and there can be several at once.
onBeforeRouteLeave(() => {
  if (!corpus.dirty) return true;
  return window.confirm("Some examples have unsaved changes. Leave anyway?");
});

useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
  if (!corpus.dirty) return;
  event.preventDefault();
});
</script>

<template>
  <section>
    <header>
      <!-- Visually hidden, not deleted: the tab already names the page, so showing it
           twice is noise — but a page with no h1 leaves a screen reader with nothing to
           announce it by. -->
      <h1 class="sr-only">Corpus</h1>
      <div class="intro">
        <p class="muted">
          Example utterances, English beside the conlang. Edit a cell and save the row.
        </p>
        <div class="io">
          <button type="button" :disabled="corpus.count === 0" @click="exporter.exportCorpusCsv()">
            Export CSV
          </button>
          <button type="button" :disabled="importing || corpus.savingNew" @click="chooseFile">
            {{ importing ? "Importing…" : "Import CSV" }}
          </button>
          <!-- A real file input, kept out of the layout: a styled button that opens it is
               the only way to get the app's own button styling on a file picker. -->
          <input
            ref="fileInput"
            type="file"
            accept=".csv,text/csv"
            class="sr-only"
            tabindex="-1"
            aria-hidden="true"
            @change="onFile"
          />
        </div>
      </div>
    </header>

    <!-- The same soft gate every other section has. -->
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
      <div class="toolbar">
        <input
          v-model="query"
          type="search"
          placeholder="Search either side"
          aria-label="Search the corpus"
        />
        <p class="count">
          {{ matches.length }}
          {{ matches.length === 1 ? "example" : "examples" }}
          <span v-if="query.trim()">of {{ corpus.count }}</span>
        </p>
        <button type="button" :disabled="!!corpus.pending" @click="corpus.startNew()">
          + New example
        </button>
      </div>

      <p v-if="corpus.error" class="error" role="alert">{{ corpus.error }}</p>

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
            <tr v-if="corpus.pending" class="new">
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
                    rows="1"
                    :aria-label="`Conlang, row ${i + 1}`"
                    @keydown.enter.meta.prevent="corpus.saveRow(entry.id)"
                    @keydown.enter.ctrl.prevent="corpus.saveRow(entry.id)"
                  />
                </div>
              </td>
              <td class="actions">
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
                <button
                  v-else
                  type="button"
                  class="danger-action"
                  @click="confirmDelete(entry.id, entry.english, entry.conlang)"
                >
                  Delete
                </button>

                <!-- Held, not applied: someone else changed a row this client is in the
                     middle of editing. Their version is one click away and nothing is
                     lost either way. -->
                <p v-if="corpus.incoming.has(entry.id)" class="held">
                  Changed by someone else.
                  <button type="button" class="link" @click="corpus.acceptIncoming(entry.id)">
                    Use theirs
                  </button>
                </p>
              </td>
            </tr>
          </tbody>
        </table>

        <p v-if="rows.length === 0 && !corpus.pending" class="empty muted">
          <template v-if="query.trim()">Nothing matches “{{ query.trim() }}”.</template>
          <template v-else>
            No examples yet. Add one, or import a CSV of English and conlang pairs.
          </template>
        </p>
      </div>
    </template>
  </section>
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

/**
 * Fills the viewport rather than growing with its content, for the same reason the
 * lexicon does: this is a list you scroll *inside*. Height has to be **definite** — the
 * scrolling child is a flex item, and against an indefinite height it resolves to its
 * full content height and spills out of the cap instead of scrolling within it.
 */
section {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--header-h) - var(--sp-8) * 2);
  /* Below this there is no useful grid left; let the window scroll instead. */
  min-height: 26rem;
}

.intro {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-6);
  flex-wrap: wrap;
  margin-bottom: var(--sp-4);
}

header p {
  max-width: 44rem;
  margin: 0;
  font-size: 0.875rem;
}

.io {
  display: flex;
  gap: var(--sp-2);
  flex: none;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-bottom: var(--sp-3);
}

.toolbar input[type="search"] {
  width: min(24rem, 100%);
}

.count {
  margin: 0;
  color: var(--c-muted);
  font-size: 0.75rem;
  flex: 1;
}

.error {
  margin: 0 0 var(--sp-3);
  color: var(--c-danger);
  font-size: 0.8125rem;
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
  font-weight: 600;
  letter-spacing: 0.07em;
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
  width: 12rem;
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
  text-transform: none;
  letter-spacing: normal;
  font-size: inherit;
}

.empty {
  padding: var(--sp-6) var(--sp-3);
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

.muted {
  color: var(--c-muted);
  font-size: 0.875rem;
}

/* The action column is the first thing to give up its width; below this the two prose
   columns matter more than always-visible labels. */
@media (max-width: 52rem) {
  .actions {
    width: 6rem;
    white-space: normal;
  }

  .actions button + button {
    margin: var(--sp-1) 0 0;
  }
}
</style>
