<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

import HeaderMenu from "@/components/HeaderMenu.vue";
import { projectTabs } from "@/router";
import { useAuthStore } from "@/stores/auth";
import { useProjectsStore } from "@/stores/projects";

const auth = useAuthStore();
const projects = useProjectsStore();
const route = useRoute();
const router = useRouter();

// The bar is contextual rather than two components: the right-hand side and the
// account menu are identical everywhere, and only the left and centre vary.
const projectId = computed(() =>
  typeof route.params.projectId === "string" ? route.params.projectId : null,
);
const project = computed(() => (projectId.value ? projects.get(projectId.value) : undefined));

async function signOut() {
  await auth.signOut();
  await router.replace({ name: "login" });
}
</script>

<template>
  <header class="bar">
    <div class="left">
      <template v-if="projectId">
        <RouterLink :to="{ name: 'dashboard' }" class="home" title="All projects">←</RouterLink>
        <span class="project">{{ project?.name ?? "…" }}</span>
      </template>
      <RouterLink v-else :to="{ name: 'dashboard' }" class="project plain">Projects</RouterLink>

      <HeaderMenu>
        <template #trigger>
          <span class="sr-only">Project menu</span>
          <!-- Inline, because one gear does not justify an icon dependency. -->
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              d="M12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Zm7.4-2.6.1-.9-.1-.9 1.9-1.5-1.9-3.3-2.3.9a7 7 0 0 0-1.6-.9L15.1 4H10.9l-.4 2.4a7 7 0 0 0-1.6.9l-2.3-.9-1.9 3.3 1.9 1.5-.1.9.1.9-1.9 1.5 1.9 3.3 2.3-.9c.5.4 1 .7 1.6.9l.4 2.4h4.2l.4-2.4c.6-.2 1.1-.5 1.6-.9l2.3.9 1.9-3.3-1.9-1.5Z"
            />
          </svg>
        </template>

        <p class="label">{{ auth.user?.email }}</p>
        <hr />
        <template v-if="projectId">
          <RouterLink :to="{ name: 'project-members', params: { projectId } }" role="menuitem">
            Members
          </RouterLink>
          <RouterLink :to="{ name: 'project-settings', params: { projectId } }" role="menuitem">
            Settings
          </RouterLink>
          <hr />
        </template>
        <button type="button" role="menuitem" @click="signOut">Sign out</button>
      </HeaderMenu>
    </div>

    <nav v-if="projectId" class="tabs" aria-label="Conlang sections">
      <RouterLink
        v-for="tab in projectTabs"
        :key="tab.name"
        :to="{ name: tab.name, params: { projectId } }"
      >
        {{ tab.label }}
      </RouterLink>
    </nav>
    <div v-else class="tabs" />

    <span class="brand">comlang</span>
  </header>
</template>

<style scoped>
.bar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  gap: var(--sp-6);
  height: var(--header-h);
  padding: 0 var(--sp-4);
  border-bottom: 1px solid var(--c-border);
  background: var(--c-surface);
}

.left {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex: none;
}

.home {
  color: var(--c-muted);
  text-decoration: none;
}

.home:hover {
  color: var(--c-text);
}

.project {
  font-weight: 600;
  white-space: nowrap;
}

.project.plain {
  color: var(--c-text);
  text-decoration: none;
}

/* The tabs take the middle and are the only part allowed to scroll: five labels this
   long overflow a narrow window, and the page body must never scroll sideways. */
.tabs {
  flex: 1;
  min-width: 0;
  display: flex;
  align-self: stretch;
  gap: var(--sp-1);
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs::-webkit-scrollbar {
  display: none;
}

.tabs a {
  display: flex;
  align-items: center;
  padding: 0 var(--sp-3);
  border-bottom: 2px solid transparent;
  color: var(--c-muted);
  font-size: 0.875rem;
  white-space: nowrap;
  text-decoration: none;
}

.tabs a:hover {
  color: var(--c-text);
}

/* Active state comes from vue-router's own class, not a hand-rolled route comparison. */
.tabs a.router-link-active {
  border-bottom-color: var(--c-accent);
  color: var(--c-text);
  font-weight: 600;
}

.brand {
  flex: none;
  color: var(--c-muted);
  font-size: 0.8125rem;
  letter-spacing: 0.08em;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
