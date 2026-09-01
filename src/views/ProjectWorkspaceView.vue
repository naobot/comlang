<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";

import ProjectMembers from "@/components/ProjectMembers.vue";
import { useMembersStore } from "@/stores/members";
import { useProjectsStore } from "@/stores/projects";

const props = defineProps<{ projectId: string }>();

const projects = useProjectsStore();
const members = useMembersStore();
const resolving = ref(true);

// Renaming is owner-only in RLS, so only an owner is offered the control. The policy
// is the real boundary; this just avoids showing a button that would always fail.
const editing = ref(false);
const saving = ref(false);
const draftName = ref("");
const draftDescription = ref("");

function startEdit() {
  draftName.value = project.value?.name ?? "";
  draftDescription.value = project.value?.description ?? "";
  editing.value = true;
}

async function save() {
  const name = draftName.value.trim();
  if (!name) return;

  saving.value = true;
  try {
    const ok = await projects.updateProject(props.projectId, {
      name,
      description: draftDescription.value.trim() || null,
    });
    if (ok) editing.value = false;
  } finally {
    saving.value = false;
  }
}

const project = computed(() => projects.get(props.projectId));

onMounted(async () => {
  // Subscribe first so the fetch covers the window before the channel is live — see
  // the note in DashboardView. A deep link lands here with an empty store, so fetch
  // before deciding the project is missing.
  projects.subscribe();
  if (!project.value) await projects.fetchAll();
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

        <form v-if="editing" class="edit" @submit.prevent="save">
          <input v-model="draftName" aria-label="Project name" required />
          <input
            v-model="draftDescription"
            aria-label="Project description"
            placeholder="Description (optional)"
          />
          <div class="actions">
            <button type="submit" :disabled="saving || !draftName.trim()">
              {{ saving ? "Saving…" : "Save" }}
            </button>
            <button type="button" @click="editing = false">Cancel</button>
          </div>
        </form>

        <template v-else>
          <div class="title">
            <h1>{{ project.name }}</h1>
            <button v-if="members.isOwner" type="button" @click="startEdit">Rename</button>
          </div>
          <p v-if="project.description" class="muted">{{ project.description }}</p>
        </template>

        <p v-if="projects.error" class="error" role="alert">{{ projects.error }}</p>
      </header>

      <nav>
        <ul>
          <li v-for="section in sections" :key="section">
            <span>{{ section }}</span>
            <em>not built yet</em>
          </li>
        </ul>
      </nav>

      <ProjectMembers :project-id="projectId" />

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

.title {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.edit {
  display: grid;
  gap: var(--sp-2);
  margin-top: var(--sp-2);
  max-width: 32rem;
}

.edit .actions {
  display: flex;
  gap: var(--sp-2);
}

.muted {
  color: var(--c-muted);
}

.error {
  color: var(--c-danger);
}
</style>
