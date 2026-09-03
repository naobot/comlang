<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { computed, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";

import ImportReviewDialog from "@/components/corpus/ImportReviewDialog.vue";
import PassageList from "@/components/corpus/PassageList.vue";
import UtteranceGrid from "@/components/corpus/UtteranceGrid.vue";
import { useProjectExport } from "@/composables/useProjectExport";
import { type CorpusImportPlan, buildCorpusImportPlan, parseCorpusCsv } from "@/lib/corpusImport";
import { useCorpusStore } from "@/stores/corpus";
import { useMembersStore } from "@/stores/members";
import { usePhonemesStore } from "@/stores/phonemes";
import type { CorpusKind } from "@/types/models";

const props = defineProps<{ projectId: string }>();

const corpus = useCorpusStore();
const members = useMembersStore();
const phonemes = usePhonemesStore();

// The same composable the header menu and the lexicon page use, so no two exports of the
// same data can drift apart.
const exporter = useProjectExport(() => props.projectId);

/**
 * Which sub-view is showing. Passages first, deliberately.
 *
 * The grid was the whole page, and a grid of two short columns reads as a word list —
 * which is how it was being used. Landing on the long-form half says what the corpus is
 * for before anyone types anything, and the sentence grid is one click away with its count
 * on the button.
 */
const view = ref<CorpusKind>("passage");

const query = ref("");
const fileInput = ref<HTMLInputElement | null>(null);
const importing = ref(false);
// The parsed file, held between picking it and pressing Import in the review dialog.
// Nothing is written while this is set — same rule the lexicon's own review follows.
const review = ref<{ plan: CorpusImportPlan; fileName: string } | null>(null);
const outcome = ref<string | null>(null);
// Read off the store at the moment of failure rather than rendered from it, for the same
// reason the lexicon does this: the dialog stays open so nothing scrolled to is lost.
const importError = ref<string | null>(null);

const shown = computed(() => corpus.matching(view.value, query.value).length);
const total = computed(
  () => (view.value === "passage" ? corpus.passages : corpus.utterances).length,
);

/** Switching views cancels a new row started in the other one, which is now invisible. */
function show(kind: CorpusKind) {
  if (view.value === kind) return;
  if (corpus.pending && corpus.pending.kind !== kind) corpus.cancelNew();
  view.value = kind;
}

function chooseFile() {
  fileInput.value?.click();
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  // Cleared immediately so picking the same file twice in a row still fires a change.
  input.value = "";
  if (!file) return;

  outcome.value = null;
  importError.value = null;
  const parsed = parseCorpusCsv(await file.text());
  if (parsed.problems.length) {
    // What is left here is only what the dialog cannot show a decision about: a file of
    // the wrong shape, or every row empty on both sides. Every problem at once, since
    // fixing one in a spreadsheet to find the next is miserable.
    window.alert(`That file can't be imported:\n\n${parsed.problems.join("\n")}`);
    return;
  }

  review.value = {
    plan: buildCorpusImportPlan(parsed.rows, corpus.entries),
    fileName: file.name,
  };
}

async function applyImport() {
  if (!review.value) return;
  importing.value = true;
  importError.value = null;
  try {
    const rows = review.value.plan.additions.map((r) => ({
      english: r.english,
      conlang: r.conlang,
    }));
    const result = await corpus.importRows(props.projectId, rows);
    if (!result) {
      importError.value = corpus.error ?? "That import could not be applied.";
      return;
    }
    review.value = null;
    // The server's own counts, not the plan's: a collaborator's write in the gap between
    // review and confirm can make the two disagree, and what actually landed is what
    // this line should say.
    const parts = [
      result.created ? `${result.created} added` : null,
      result.passages ? `${result.passages} as passages` : null,
      result.skipped ? `${result.skipped} skipped` : null,
    ].filter(Boolean);
    outcome.value = parts.length ? `Imported: ${parts.join(", ")}.` : "Nothing changed.";
  } finally {
    importing.value = false;
  }
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
          The language in use: things said in it, English beside the conlang. Whole exchanges and
          paragraphs belong here as much as single sentences — a word on its own, with a definition,
          belongs in the
          <RouterLink :to="{ name: 'project-lexicon', params: { projectId } }">lexicon</RouterLink>
          instead.
        </p>
        <div class="io">
          <button type="button" :disabled="corpus.count === 0" @click="exporter.exportCorpusCsv()">
            Export CSV
          </button>
          <button
            v-if="members.canEdit"
            type="button"
            :disabled="review !== null || importing || corpus.savingNew"
            @click="chooseFile"
          >
            Import CSV
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

      <!-- Both outcomes land here rather than in an alert(), same as the lexicon: a
           refused import used to vanish silently once the confirm dialog closed. -->
      <p v-if="importError && !review" class="status danger" role="alert">{{ importError }}</p>
      <p v-else-if="outcome" class="status muted" role="status">{{ outcome }}</p>
    </header>

    <ImportReviewDialog
      v-if="review"
      :open="true"
      :plan="review.plan"
      :file-name="review.fileName"
      :busy="importing"
      :error="importError"
      @close="review = null"
      @confirm="applyImport"
    />

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
      <!-- One store, one CSV, two ways of editing. Tabs rather than routes: the header's
           tab bar names the *sections*, and this is a choice within one of them. -->
      <div class="tabs" role="tablist" aria-label="Corpus view">
        <button
          type="button"
          role="tab"
          :aria-selected="view === 'passage'"
          :class="{ on: view === 'passage' }"
          @click="show('passage')"
        >
          Passages <span class="tally">{{ corpus.passages.length }}</span>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="view === 'utterance'"
          :class="{ on: view === 'utterance' }"
          @click="show('utterance')"
        >
          Sentences <span class="tally">{{ corpus.utterances.length }}</span>
        </button>
      </div>

      <p class="lead muted">
        <template v-if="view === 'passage'">
          Conversations, paragraphs, stories — anything with more than one sentence in it. Line
          breaks are kept, so a dialogue can be laid out speaker by speaker.
        </template>
        <template v-else>
          One sentence per row. If a row grows into an exchange, move it across with → Passage.
        </template>
      </p>

      <div class="toolbar">
        <input
          v-model="query"
          type="search"
          :placeholder="view === 'passage' ? 'Search the passages' : 'Search either side'"
          :aria-label="`Search the ${view === 'passage' ? 'passages' : 'sentences'}`"
        />
        <p class="count">
          {{ shown }}
          <template v-if="view === 'passage'">{{ shown === 1 ? "passage" : "passages" }}</template>
          <template v-else>{{ shown === 1 ? "sentence" : "sentences" }}</template>
          <span v-if="query.trim()">of {{ total }}</span>
        </p>
        <button
          v-if="members.canEdit"
          type="button"
          :disabled="!!corpus.pending"
          @click="corpus.startNew(view)"
        >
          {{ view === "passage" ? "+ New passage" : "+ New sentence" }}
        </button>
      </div>

      <p v-if="corpus.error" class="error" role="alert">{{ corpus.error }}</p>

      <PassageList v-if="view === 'passage'" :project-id="projectId" :query="query" />
      <UtteranceGrid v-else :project-id="projectId" :query="query" />
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
  /* Below this there is no useful list left; let the window scroll instead. */
  min-height: 26rem;
}

.intro {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-6);
  flex-wrap: wrap;
  margin-bottom: var(--sp-3);
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

.status {
  width: 100%;
  margin: var(--sp-3) 0 0;
  font-size: 0.875rem;
}

.status.danger {
  color: var(--c-danger);
}

.tabs {
  display: flex;
  gap: var(--sp-2);
  border-bottom: 1px solid var(--c-border);
  padding-bottom: var(--sp-2);
}

/* The selected one is filled rather than underlined: the app header's tab bar already
   owns the underline, and two underlined rows on one page read as one broken row. */
.tabs .on {
  background: var(--c-accent);
  color: var(--c-accent-text);
  border-color: transparent;
}

.tally {
  margin-left: var(--sp-2);
  font-variant-numeric: tabular-nums;
  opacity: 0.75;
}

.lead {
  max-width: 44rem;
  margin: var(--sp-3) 0;
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
</style>
