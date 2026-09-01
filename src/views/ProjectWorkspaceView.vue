<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import { useProjectsStore } from "@/stores/projects";

const props = defineProps<{ projectId: string }>();

const projects = useProjectsStore();
const resolving = ref(true);

const project = computed(() => projects.get(props.projectId));

onMounted(async () => {
  // A deep link lands here with an empty store, so fetch before deciding it is missing.
  if (!project.value) await projects.fetchAll();
  projects.subscribe();
  resolving.value = false;
});

onUnmounted(() => projects.unsubscribeAll());

// The linguistic core lands here. Deliberately stubbed: the schema needs its own design
// pass (see the plan's "Later" section and packages/own-conlang/grammar.yaml in the
// harness repo, which is the model to derive it from).
const sections = ["Phoneme inventory", "Phonotactics", "Word classes", "Lexicon", "Grammar rules"];
</script>

<template>
  <div class="page">
    <p v-if="resolving" class="muted">Loading…</p>

    <!-- A non-member gets zero rows, which is indistinguishable from a bad id. Don't
         claim it doesn't exist, and don't confirm that it does. -->
    <div v-else-if="!project" class="missing">
      <h1>Not found</h1>
      <p class="muted">This project doesn't exist, or you don't have access to it.</p>
      <RouterLink :to="{ name: 'dashboard' }">Back to projects</RouterLink>
    </div>

    <template v-else>
      <header>
        <RouterLink :to="{ name: 'dashboard' }" class="back">← Projects</RouterLink>
        <h1>{{ project.name }}</h1>
        <p v-if="project.description" class="muted">{{ project.description }}</p>
      </header>

      <nav>
        <ul>
          <li v-for="section in sections" :key="section">
            <span>{{ section }}</span>
            <em>not built yet</em>
          </li>
        </ul>
      </nav>

      <RouterView />
    </template>
  </div>
</template>

<style scoped>
.page {
  max-width: 60rem;
  margin: 0 auto;
  padding: var(--sp-8) var(--sp-4);
}

.back {
  font-size: 0.875rem;
  text-decoration: none;
}

h1 {
  margin: var(--sp-2) 0 0;
}

nav ul {
  list-style: none;
  margin: var(--sp-6) 0 0;
  padding: 0;
  display: grid;
  gap: var(--sp-2);
}

nav li {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: var(--sp-4);
  padding: var(--sp-3) var(--sp-4);
  border: 1px dashed var(--c-border);
  border-radius: var(--radius);
}

nav em {
  color: var(--c-muted);
  font-size: 0.8125rem;
  font-style: normal;
}

.muted {
  color: var(--c-muted);
}
</style>
