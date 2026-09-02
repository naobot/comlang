<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";

import HeaderMenu from "@/components/HeaderMenu.vue";
import { useProjectExport } from "@/composables/useProjectExport";
import { projectTabs } from "@/router";
import { useAuthStore } from "@/stores/auth";
import { useMembersStore } from "@/stores/members";
import { useProjectsStore } from "@/stores/projects";

const auth = useAuthStore();
const projects = useProjectsStore();
const members = useMembersStore();
const route = useRoute();
const router = useRouter();

const projectId = computed(() =>
  typeof route.params.projectId === "string" ? route.params.projectId : null,
);
const project = computed(() => (projectId.value ? projects.get(projectId.value) : undefined));

const exporter = useProjectExport(() => projectId.value);

async function signOut() {
  await auth.signOut();
  await router.replace({ name: "login" });
}

// Last updated ------------------------------------------------------------------------

/**
 * Resolved from the members already loaded for this project rather than a fresh query:
 * whoever last touched it is essentially always a member, and `profiles` is only readable
 * for people you share a project with anyway.
 */
const lastBy = computed(() => {
  const id = project.value?.last_activity_by;
  if (!id) return null;
  if (id === auth.user?.id) return "you";
  const member = members.members.find((m) => m.user_id === id);
  const profile = member?.profile;
  if (!profile) return "someone"; // they may have left the project since
  return profile.display_name || profile.email.split("@")[0] || "someone";
});

const lastAt = computed(() => {
  const at = project.value?.last_activity_at;
  if (!at) return null;
  const date = new Date(at);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
});
</script>

<template>
  <header class="bar">
    <div class="left">
      <template v-if="projectId">
        <RouterLink :to="{ name: 'dashboard' }" class="home" title="All projects">←</RouterLink>

        <!-- The whole name is the menu trigger. A caret rather than a gear: the name is
             already the obvious thing to reach for, and a gear implies settings only. -->
        <HeaderMenu>
          <template #trigger>
            <span class="project">{{ project?.name ?? "…" }}</span>
            <!-- Worth carrying on every page: an owner should never have to open settings
                 to find out whether what they are typing is public. -->
            <span v-if="project?.is_public" class="badge">public</span>
            <span class="caret" aria-hidden="true">▾</span>
          </template>

          <p class="label">{{ auth.user?.email ?? "Not signed in" }}</p>
          <hr />
          <button
            type="button"
            role="menuitem"
            :disabled="!exporter.hasAnything.value"
            @click="exporter.exportGrammarYaml()"
          >
            Export grammar.yaml
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="!exporter.hasAnything.value"
            @click="exporter.exportLexiconCsv()"
          >
            Export lexicon.csv
          </button>
          <button
            type="button"
            role="menuitem"
            :disabled="!exporter.hasAnything.value"
            @click="exporter.exportLexiconCsvFull()"
          >
            Export lexicon.csv (full)
          </button>
          <hr />
          <!-- Membership and settings are for the people working on the language. A
               visitor to a published conlang is not one, and `project_members` is not
               readable to them anyway — the page would be an empty list. -->
          <template v-if="members.canEdit">
            <RouterLink :to="{ name: 'project-members', params: { projectId } }" role="menuitem">
              Members
            </RouterLink>
            <RouterLink :to="{ name: 'project-settings', params: { projectId } }" role="menuitem">
              Settings
            </RouterLink>
            <hr />
          </template>
          <button v-if="auth.user" type="button" role="menuitem" @click="signOut">Sign out</button>
          <RouterLink v-else :to="{ name: 'login', query: { r: route.fullPath } }" role="menuitem">
            Sign in
          </RouterLink>
        </HeaderMenu>
      </template>

      <template v-else>
        <RouterLink :to="{ name: 'dashboard' }" class="project plain">Projects</RouterLink>
        <HeaderMenu>
          <template #trigger>
            <span class="sr-only">Account menu</span>
            <span class="caret" aria-hidden="true">▾</span>
          </template>
          <p class="label">{{ auth.user?.email ?? "Not signed in" }}</p>
          <hr />
          <button v-if="auth.user" type="button" role="menuitem" @click="signOut">Sign out</button>
          <RouterLink v-else :to="{ name: 'login' }" role="menuitem">Sign in</RouterLink>
        </HeaderMenu>
      </template>
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

    <p v-if="projectId && lastAt" class="activity">Last updated by {{ lastBy }} at {{ lastAt }}</p>

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

.badge {
  padding: 1px var(--sp-2);
  border: 1px solid var(--c-border);
  border-radius: 999px;
  color: var(--c-muted);
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
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

.caret {
  color: var(--c-muted);
  font-size: 0.625rem;
}

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

.tabs a.router-link-active {
  border-bottom-color: var(--c-accent);
  color: var(--c-text);
  font-weight: 600;
}

/* Sits left of the brand so the app name still anchors the far right, as it has since the
   header was built. Hidden on narrow screens: the tabs need the room more. */
.activity {
  flex: none;
  margin: 0;
  color: var(--c-muted);
  font-size: 0.6875rem;
  white-space: nowrap;
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

@media (max-width: 60rem) {
  .activity {
    display: none;
  }
}
</style>
