<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { onBeforeRouteLeave } from "vue-router";

import ClassEditor from "@/components/phonotactics/ClassEditor.vue";
import ConstraintEditor from "@/components/phonotactics/ConstraintEditor.vue";
import SampleOutput from "@/components/phonotactics/SampleOutput.vue";
import TemplateEditor from "@/components/phonotactics/TemplateEditor.vue";
import { usePhonemesStore } from "@/stores/phonemes";
import { usePhonotacticsStore } from "@/stores/phonotactics";

const props = defineProps<{ projectId: string }>();

const phonemes = usePhonemesStore();
const phonotactics = usePhonotacticsStore();

async function save() {
  await phonotactics.save(props.projectId);
}

// Same guard as the inventory page. An explicit-save page that drops work on a stray
// click is worse than an autosaving one, not better.
onBeforeRouteLeave(() => {
  if (!phonotactics.dirty) return true;
  return window.confirm("You have unsaved phonotactics changes. Leave anyway?");
});

useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
  if (!phonotactics.dirty) return;
  event.preventDefault();
});
</script>

<template>
  <section>
    <header>
      <h1>Phonotactics</h1>
      <p class="muted">
        Which segments can go where. Classes name sets of phonemes, templates say how a syllable is
        built from them, and constraints rule out what the templates would otherwise allow.
      </p>
    </header>

    <!-- The same soft gate the placeholder used to render. This page works from the
         inventory, so with nothing in it there is nothing to build classes out of. -->
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
      <p v-if="phonotactics.changedElsewhere" class="notice" role="status">
        Someone else changed the phonotactics. Your draft is untouched.
        <button type="button" @click="phonotactics.acceptIncoming()">Load their version</button>
      </p>

      <p v-if="phonotactics.error" class="error" role="alert">{{ phonotactics.error }}</p>

      <div class="bar">
        <span class="muted">
          {{ phonotactics.draft.classes.length }} classes,
          {{ phonotactics.draft.templates.length }} templates,
          {{ phonotactics.draft.constraints.length }} constraints
          <em v-if="phonotactics.dirty"> · unsaved changes</em>
        </span>
        <div class="actions">
          <button
            type="button"
            :disabled="!phonotactics.dirty || phonotactics.saving"
            @click="phonotactics.discard()"
          >
            Discard
          </button>
          <button
            type="submit"
            :disabled="!phonotactics.dirty || phonotactics.saving"
            @click="save"
          >
            {{ phonotactics.saving ? "Saving…" : "Save" }}
          </button>
        </div>
      </div>

      <ClassEditor />
      <TemplateEditor />
      <ConstraintEditor />
      <SampleOutput />
    </template>
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
