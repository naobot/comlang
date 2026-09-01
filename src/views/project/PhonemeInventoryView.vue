<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { computed } from "vue";
import { onBeforeRouteLeave } from "vue-router";

import ConsonantChart from "@/components/ipa/ConsonantChart.vue";
import VowelChart from "@/components/ipa/VowelChart.vue";
import { usePhonemesStore } from "@/stores/phonemes";

const props = defineProps<{ projectId: string }>();

const phonemes = usePhonemesStore();

// Passed down rather than letting each chart reach for the store, so the charts stay
// pure reference renderers and can be reused wherever a phone picker is needed.
const isSelected = (ipa: string) => phonemes.has(ipa);

const summary = computed(() => {
  const c = phonemes.consonants.length;
  const v = phonemes.vowels.length;
  return `${c} consonant${c === 1 ? "" : "s"}, ${v} vowel${v === 1 ? "" : "s"}`;
});

async function save() {
  await phonemes.save(props.projectId);
}

// This page saves explicitly, so losing a draft to a stray click is a real hazard —
// more so than on an autosaving page, not less.
onBeforeRouteLeave(() => {
  if (!phonemes.dirty) return true;
  return window.confirm("You have unsaved changes to the inventory. Leave anyway?");
});

useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
  if (!phonemes.dirty) return;
  event.preventDefault();
});
</script>

<template>
  <section>
    <header>
      <div>
        <h1>Phoneme inventory</h1>
        <p class="muted">
          Toggle the segments this language uses. Everything downstream — phonotactics, the lexicon,
          grammar rules — is built from what you pick here.
        </p>
      </div>
    </header>

    <!-- Realtime notifies but never patches: applying a collaborator's change to the
         draft would rewrite an edit in progress, then save it back as if it were the
         user's own choice. -->
    <p v-if="phonemes.changedElsewhere" class="notice" role="status">
      Someone else changed this inventory. Your draft is untouched.
      <button type="button" @click="phonemes.fetchFor(projectId)">Load their version</button>
    </p>

    <p v-if="phonemes.error" class="error" role="alert">{{ phonemes.error }}</p>

    <div class="bar">
      <span class="muted">{{ summary }}<em v-if="phonemes.dirty"> · unsaved changes</em></span>
      <div class="actions">
        <button
          type="button"
          :disabled="!phonemes.dirty || phonemes.saving"
          @click="phonemes.discard()"
        >
          Discard
        </button>
        <button type="submit" :disabled="!phonemes.dirty || phonemes.saving" @click="save">
          {{ phonemes.saving ? "Saving…" : "Save" }}
        </button>
      </div>
    </div>

    <ConsonantChart :is-selected="isSelected" @toggle="phonemes.toggle" />
    <VowelChart :is-selected="isSelected" @toggle="phonemes.toggle" />
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 var(--sp-2);
  font-size: 1.25rem;
}

header p {
  max-width: 44rem;
  margin: 0;
  font-size: 0.875rem;
}

/* Sticks below the app header so Save is reachable from anywhere in a long chart. */
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
</style>
