<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

import { useAuthStore } from "@/stores/auth";
import { useProjectsStore } from "@/stores/projects";

const auth = useAuthStore();
const projects = useProjectsStore();

const newName = ref("");
const creating = ref(false);

onMounted(async () => {
  // Subscribe BEFORE fetching, not after. There is a window between a channel going
  // live and the first row landing, and anything changed in it is simply never
  // delivered. Fetching second means the fetch covers that window; fetching first
  // leaves a permanent hole between the query returning and the channel attaching.
  projects.subscribe();
  // Both, and public unconditionally: a signed-out visitor gets a home page that is the
  // published list, and a signed-in one gets their own languages above it. See 0026.
  await Promise.all([projects.fetchAll(), projects.fetchPublic()]);
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
</script>

<template>
  <main class="page">
    <template v-if="auth.user">
      <h1>Your projects</h1>

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
            <strong>
              {{ project.name }}
              <span v-if="project.is_public" class="badge">public</span>
            </strong>
            <span v-if="project.description" class="muted">{{ project.description }}</span>
          </RouterLink>
        </li>
      </ul>
    </template>

    <!-- Signed out, the published list *is* the home page, so it leads rather than
         following an invitation to sign in. -->
    <template v-else>
      <h1>Published conlangs</h1>
      <p class="muted lead">
        Anyone can read these. <RouterLink :to="{ name: 'login' }">Sign in</RouterLink> to work on
        your own.
      </p>
    </template>

    <section v-if="auth.user || projects.publicProjects.length" class="public">
      <h2 v-if="auth.user">Published conlangs</h2>
      <p v-if="auth.user" class="muted lead">Published by other people, and readable by anyone.</p>

      <p v-if="projects.loadingPublic" class="muted">Loading…</p>
      <p v-else-if="projects.publicProjects.length === 0" class="muted">Nothing published yet.</p>

      <ul v-else class="projects">
        <li v-for="project in projects.publicProjects" :key="project.id">
          <RouterLink :to="{ name: 'project', params: { projectId: project.id } }">
            <strong>{{ project.name }}</strong>
            <span v-if="project.description" class="muted">{{ project.description }}</span>
          </RouterLink>
        </li>
      </ul>
    </section>
  </main>
</template>

<style scoped>
.page {
  max-width: 48rem;
  margin: 0 auto;
  padding: var(--sp-8) var(--sp-4);
}

h1 {
  margin: 0;
  font-size: 1.25rem;
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
  background: var(--c-raised);
}

.muted {
  color: var(--c-muted);
  font-size: 0.875rem;
}

.lead {
  margin: var(--sp-2) 0 var(--sp-4);
}

.public {
  margin-top: var(--sp-8);
}

.public h2 {
  margin: 0;
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-muted);
}

/* Says a project of your own is readable by anyone — the one thing about it you would
   want to see without opening it. */
.badge {
  margin-left: var(--sp-2);
  padding: 1px var(--sp-2);
  border: 1px solid var(--c-border);
  border-radius: 999px;
  color: var(--c-muted);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  vertical-align: middle;
}

.error {
  color: var(--c-danger);
}
</style>
