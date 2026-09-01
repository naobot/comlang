<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";

import { useAuthStore } from "@/stores/auth";
import { useProjectsStore } from "@/stores/projects";

const auth = useAuthStore();
const projects = useProjectsStore();
const router = useRouter();

const newName = ref("");
const creating = ref(false);

onMounted(async () => {
  await projects.fetchAll();
  projects.subscribe();
});

// The store owns the channel, so leaving the dashboard releases its reference rather
// than tearing down a subscription the workspace may still be using.
onUnmounted(() => projects.unsubscribeAll());

async function onCreate() {
  const name = newName.value.trim();
  if (!name) return;

  creating.value = true;
  try {
    const created = await projects.createProject(name);
    if (created) newName.value = "";
  } finally {
    creating.value = false;
  }
}

async function signOut() {
  await auth.signOut();
  await router.replace({ name: "login" });
}
</script>

<template>
  <div class="page">
    <header>
      <h1>Projects</h1>
      <div class="who">
        <span>{{ auth.user?.email }}</span>
        <button type="button" @click="signOut">Sign out</button>
      </div>
    </header>

    <form class="create" @submit.prevent="onCreate">
      <input v-model="newName" placeholder="New conlang project" aria-label="Project name" />
      <button type="submit" :disabled="creating || !newName.trim()">Create</button>
    </form>

    <p v-if="projects.error" class="error" role="alert">{{ projects.error }}</p>

    <p v-if="projects.loading" class="muted">Loading…</p>

    <!-- A user with no access sees an empty list rather than an error: row-level
         security filters rows, it does not raise. Say so, or the screen just looks
         broken. -->
    <p v-else-if="projects.projects.length === 0" class="muted">
      No projects yet. Create one above, or ask an owner to add you to theirs.
    </p>

    <ul v-else class="projects">
      <li v-for="project in projects.projects" :key="project.id">
        <RouterLink :to="{ name: 'project', params: { projectId: project.id } }">
          <strong>{{ project.name }}</strong>
          <span v-if="project.description" class="muted">{{ project.description }}</span>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.page {
  max-width: 48rem;
  margin: 0 auto;
  padding: var(--sp-8) var(--sp-4);
}

header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-4);
  flex-wrap: wrap;
}

h1 {
  margin: 0;
}

.who {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  color: var(--c-muted);
  font-size: 0.875rem;
}

.create {
  display: flex;
  gap: var(--sp-2);
  margin: var(--sp-6) 0;
}

.projects {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sp-2);
}

.projects a {
  display: grid;
  gap: var(--sp-1);
  padding: var(--sp-4);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  text-decoration: none;
  color: inherit;
}

.projects a:hover {
  border-color: var(--c-accent);
}

.muted {
  color: var(--c-muted);
  font-size: 0.875rem;
}

.error {
  color: var(--c-danger);
}
</style>
