<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { computed, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";

import PassageList from "@/components/corpus/PassageList.vue";
import UtteranceGrid from "@/components/corpus/UtteranceGrid.vue";
import { useProjectExport } from "@/composables/useProjectExport";
import { parseCorpusCsv, planCorpusImport } from "@/lib/corpusImport";
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

    // The file has no kind column either, so where each row lands is inferred from its
    // shape. Stated up front, because it is a guess and correcting one is a click.
    const split = plan.passages
      ? ` ${plan.passages} of them ${plan.passages === 1 ? "looks" : "look"} long enough to ` +
        `be ${plan.passages === 1 ? "a passage" : "passages"} and will open there; the rest ` +
        "go to sentences."
      : " All of them will go to sentences.";

    if (
      !window.confirm(
        `Import ${file.name}? This will add ${plan.add} ` +
          `${plan.add === 1 ? "example" : "examples"}.${skipped}${split} Nothing is changed ` +
          "or deleted — examples are matched only by being identical on both sides, since " +
          "the file has no key column.",
      )
    ) {
      return;
    }

    const result = await corpus.importRows(props.projectId, parsed.rows);
    if (result) {
      window.alert(
        `Imported: ${result.created} added (${result.passages} as passages), ` +
          `${result.skipped} skipped.`,
      );
    }
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
            :disabled="importing || corpus.savingNew"
            @click="chooseFile"
          >
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
