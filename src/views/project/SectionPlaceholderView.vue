<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vue-router";

import { usePhonemesStore } from "@/stores/phonemes";

defineProps<{ projectId: string }>();

const route = useRoute();
const phonemes = usePhonemesStore();

// The title comes from the route's own meta so there is no second list of section
// names to keep in sync with `projectTabs`.
const title = computed(() => (typeof route.meta.tab === "string" ? route.meta.tab : "Section"));

/**
 * Sections declare what they build on via `meta.requires`, and the notice below stands
 * in for the page until that dependency is satisfied. A soft gate on purpose: the tab
 * stays navigable, so the header never shows a dead control.
 *
 * The store is loaded by ProjectWorkspaceView, not here — this page does not own the
 * inventory, it only asks whether one exists.
 */
const blocked = computed(() => route.meta.requires === "phonemes" && phonemes.count === 0);
</script>

<template>
  <section class="placeholder">
    <h1>{{ title }}</h1>

    <template v-if="blocked">
      <p class="muted">
        Nothing to build from yet — this section works from the phoneme inventory, and this language
        doesn't have one.
      </p>
      <RouterLink :to="{ name: 'project-phonemes', params: { projectId } }">
        Set up the phoneme inventory →
      </RouterLink>
    </template>

    <p v-else class="muted">
      Not built yet. Needs its own design pass — see
      <code>packages/own-conlang/grammar.yaml</code> in the harness repo, which is the model it
      should be derived from.
    </p>
  </section>
</template>

<style scoped>
.placeholder {
  padding: var(--sp-8) 0;
  text-align: center;
}

h1 {
  margin: 0 0 var(--sp-2);
  font-size: 1.25rem;
}

.muted {
  max-width: 34rem;
  margin: 0 auto var(--sp-4);
  color: var(--c-muted);
  font-size: 0.875rem;
}

code {
  font-family: var(--font-mono);
  font-size: 0.8125em;
}
</style>
