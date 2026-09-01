<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { onMounted, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";

import EntryDetail from "@/components/lexicon/EntryDetail.vue";
import LemmaList from "@/components/lexicon/LemmaList.vue";
import { useLexiconStore } from "@/stores/lexicon";
import { usePhonemesStore } from "@/stores/phonemes";

const props = defineProps<{ projectId: string }>();

const lexicon = useLexiconStore();
const phonemes = usePhonemesStore();
const route = useRoute();
const router = useRouter();

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
      <h1>Lexicon</h1>
      <p class="muted">
        Every word in the language. Search by the conlang form or by what it means.
      </p>
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
h1 {
  margin: 0 0 var(--sp-2);
  font-size: 1.25rem;
}

header p {
  max-width: 44rem;
  margin: 0 0 var(--sp-6);
  font-size: 0.875rem;
}

.panes {
  display: grid;
  grid-template-columns: 15rem minmax(0, 1fr);
  gap: var(--sp-6);
  align-items: start;
}

.panes > :first-child {
  position: sticky;
  /* Below the app header, with room for the page's own top padding. */
  top: calc(var(--header-h) + var(--sp-4));
  max-height: calc(100vh - var(--header-h) - var(--sp-8));
  padding-right: var(--sp-3);
  border-right: 1px solid var(--c-border);
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
  }

  .panes > :first-child {
    position: static;
    max-height: 22rem;
    padding-right: 0;
    padding-bottom: var(--sp-4);
    border-right: 0;
    border-bottom: 1px solid var(--c-border);
  }
}
</style>
