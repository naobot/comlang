<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";

import EntryDetail from "@/components/lexicon/EntryDetail.vue";
import LemmaList from "@/components/lexicon/LemmaList.vue";
import { useProjectExport } from "@/composables/useProjectExport";
import { parseLexiconCsv, planImport } from "@/lib/lexiconImport";
import { useLexiconStore } from "@/stores/lexicon";
import { usePhonemesStore } from "@/stores/phonemes";

const props = defineProps<{ projectId: string }>();

const lexicon = useLexiconStore();
const phonemes = usePhonemesStore();
const route = useRoute();
const router = useRouter();

// The same composable the header menu uses, so the two exports cannot drift apart. This
// page offers the full CSV only: it is the one that carries pos, gloss and notes, and so
// the only one that survives a round trip back through Import. Disabled on the lexicon's
// own count rather than the exporter's `hasAnything`, which is true when any *section*
// has data — here that would offer a file with nothing but a header row in it.
const exporter = useProjectExport(() => props.projectId);

const fileInput = ref<HTMLInputElement | null>(null);
const importing = ref(false);

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
    const parsed = parseLexiconCsv(await file.text());
    if (parsed.problems.length) {
      // Every problem at once: fixing one in a spreadsheet and re-importing to find the
      // next is a miserable loop.
      window.alert(`That file can't be imported:\n\n${parsed.problems.join("\n")}`);
      return;
    }

    const plan = planImport(parsed.rows, lexicon.entries);
    const parts = [
      plan.create ? `add ${plan.create}` : null,
      plan.update ? `update ${plan.update}` : null,
    ].filter(Boolean);
    // Says what it will do before it does it. Entries are matched by key, so a file of
    // unkeyed rows adds rather than updates — worth seeing before, not after.
    const unkeyed = plan.unkeyed
      ? `\n\n${plan.unkeyed} row${plan.unkeyed === 1 ? " has" : "s have"} no key, so ` +
        `${plan.unkeyed === 1 ? "it is" : "they are"} added as new entries rather than matched.`
      : "";
    const missing = parsed.fields.includes("gloss")
      ? ""
      : "\n\nThis file has only key and lemma columns, so meanings, word classes and " +
        "notes on existing entries are left as they are.";

    if (
      !window.confirm(
        `Import ${file.name}? This will ${parts.join(" and ")} ${
          plan.create + plan.update === 1 ? "entry" : "entries"
        }. Nothing is deleted.${unkeyed}${missing}`,
      )
    ) {
      return;
    }

    const result = await lexicon.importRows(props.projectId, parsed.rows, parsed.fields);
    if (result) {
      window.alert(`Imported: ${result.created} added, ${result.updated} updated.`);
    }
  } finally {
    importing.value = false;
  }
}

// Selection lives in the URL so an entry is linkable and the back button works. A query
// param rather than a child route: the tab's own active state stays intact, and there is
// nothing to render at a sub-route that this page does not already show.
function syncFromRoute() {
  const id = typeof route.query.entry === "string" ? route.query.entry : null;
  if (id && id !== lexicon.openId) lexicon.select(id);
  if (!id && lexicon.openId) lexicon.close();
}

onMounted(syncFromRoute);
watch(() => route.query.entry, syncFromRoute);
// A deep link can arrive before the rows do; re-run once they land.
watch(() => lexicon.count, syncFromRoute);

function guarded(action: () => void) {
  if (lexicon.dirty && !window.confirm("You have unsaved changes to this entry. Discard them?")) {
    return;
  }
  action();
}

function pick(id: string) {
  guarded(() => void router.replace({ query: { ...route.query, entry: id } }));
}

function create(lemma: string) {
  guarded(() => {
    const query = { ...route.query };
    delete query.entry;
    void router.replace({ query });
    lexicon.startNew(lemma);
  });
}

onBeforeRouteLeave(() => {
  if (!lexicon.dirty) return true;
  return window.confirm("You have unsaved changes to this entry. Leave anyway?");
});

useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
  if (!lexicon.dirty) return;
  event.preventDefault();
});
</script>

<template>
  <section>
    <header>
      <!-- Visually hidden, not deleted: the tab already names the page, so showing it
           twice is noise — but a page with no h1 leaves a screen reader with nothing to
           announce it by. -->
      <h1 class="sr-only">Lexicon</h1>
      <div class="intro">
        <p class="muted">
          Every word in the language. Search by the conlang form or by what it means.
        </p>
        <div class="io">
          <button
            type="button"
            :disabled="lexicon.count === 0"
            @click="exporter.exportLexiconCsvFull()"
          >
            Export CSV
          </button>
          <button type="button" :disabled="importing || lexicon.saving" @click="chooseFile">
            {{ importing ? "Importing…" : "Import CSV" }}
          </button>
          <!-- A real file input, kept out of the layout: a styled button that opens it is
               the only way to get the app's own button styling on a file picker.
               tabindex="-1" because the visible button is the control — otherwise the tab
               order lands on something nobody can see. -->
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

    <!-- The same soft gate the placeholder had. -->
    <div v-if="phonemes.count === 0" class="gate">
      <p class="muted">
        Nothing to build from yet — this section works from the phoneme inventory, and this language
        doesn't have one.
      </p>
      <RouterLink :to="{ name: 'project-phonemes', params: { projectId } }">
        Set up the phoneme inventory →
      </RouterLink>
    </div>

    <div v-else class="panes">
      <LemmaList @pick="pick" @create="create" />

      <EntryDetail v-if="lexicon.openId || lexicon.creating" :project-id="projectId" />
      <p v-else class="placeholder muted">Pick a word from the list, or add one.</p>
    </div>
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

.intro {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-6);
  flex-wrap: wrap;
  margin-bottom: var(--sp-6);
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

/**
 * The one section that fills the viewport instead of growing with its content.
 *
 * A dictionary is a list you scroll *inside*, not a page that gets taller with every word
 * added — 60 entries already ran off the bottom. Height has to be **definite**, not a
 * max-height: the lemma list is `flex: 1` inside its panel, and against an indefinite
 * height that resolves to the full content height, so the list took its natural size and
 * spilled out of the cap rather than scrolling within it. That was the bug.
 *
 * dvh rather than vh so mobile browser chrome does not leave the panes below the fold.
 */
section {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - var(--header-h) - var(--sp-8) * 2);
  /* Below this there is no useful list left; let the window scroll instead. */
  min-height: 26rem;
}

.panes {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(15rem, 22rem) minmax(0, 1fr);
  gap: var(--sp-6);
  /* Stretch, not start: a definite height is what lets each pane scroll on its own. */
  align-items: stretch;
  min-height: 0;
}

/* Without this a grid child refuses to shrink below its content, and the overflow
   reappears one level down. */
.panes > * {
  min-height: 0;
}

.panes > :first-child {
  padding-right: var(--sp-3);
  border-right: 1px solid var(--c-border);
}

/* The form is short enough to fit, but a long note should not push the page instead. */
.panes > :last-child {
  overflow-y: auto;
}

.placeholder {
  padding: var(--sp-8) 0;
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

/* Stack rather than squeeze: a 15rem sidebar plus a two-column form does not fit. */
@media (max-width: 44rem) {
  .panes {
    grid-template-columns: minmax(0, 1fr);
    /* Two rows sharing the same fixed height: the list keeps a usable slice and the
       entry takes the rest, so neither pane pushes the page. */
    grid-template-rows: minmax(0, 16rem) minmax(0, 1fr);
  }

  .panes > :first-child {
    padding-right: 0;
    padding-bottom: var(--sp-4);
    border-right: 0;
    border-bottom: 1px solid var(--c-border);
  }
}
</style>
