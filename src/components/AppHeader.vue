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
/**
 * Null when the person cannot be named — they have left the project, or the viewer is a
 * visitor to a published conlang and cannot read the member list at all. The line then
 * says only *when*, which is the part that is public.
 */
const lastBy = computed(() => {
  const id = project.value?.last_activity_by;
  if (!id) return null;
  if (id === auth.user?.id) return "you";
  const profile = members.members.find((m) => m.user_id === id)?.profile;
  if (!profile) return null;
  return profile.display_name || profile.email.split("@")[0] || null;
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
          <template v-if="auth.user">
            <RouterLink :to="{ name: 'set-password' }" role="menuitem">Change password</RouterLink>
            <button type="button" role="menuitem" @click="signOut">Sign out</button>
          </template>
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
          <template v-if="auth.user">
            <RouterLink :to="{ name: 'set-password' }" role="menuitem">Change password</RouterLink>
            <button type="button" role="menuitem" @click="signOut">Sign out</button>
          </template>
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

    <p v-if="projectId && lastAt" class="activity">
      <template v-if="lastBy">Last updated by {{ lastBy }} at {{ lastAt }}</template>
      <template v-else>Last updated {{ lastAt }}</template>
    </p>

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
  margin-left: var(--sp-2);
  border: 1px solid var(--c-border);
  border-radius: 999px;
  color: var(--c-muted);
  font-family: var(--font-display);
  font-size: 0.625rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  line-height: 1.5;
}

.home {
  color: var(--c-muted);
  text-decoration: none;
}

.home:hover {
  color: var(--c-text);
}

/* The project name, the tabs and the brand are the three places the header names
   something, so all three take the display face. 500 rather than 600 for the reason the
   base button rule gives: the grotesk already reads a step heavier here. */
.project {
  font-family: var(--font-display);
  font-weight: 500;
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
  font-family: var(--font-display);
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
  font-weight: 500;
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

/* The one place tracked wider than the 0.08em every other label uses: the brand is a
   wordmark rather than a label, and it is the only text on the page that is. */
.brand {
  flex: none;
  color: var(--c-muted);
  font-family: var(--font-display);
  font-size: 0.8125rem;
  letter-spacing: 0.1em;
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
