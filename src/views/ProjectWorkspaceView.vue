<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { useMembersStore } from "@/stores/members";
import { useProjectsStore } from "@/stores/projects";

const props = defineProps<{ projectId: string }>();

const projects = useProjectsStore();
const members = useMembersStore();
const resolving = ref(true);

const project = computed(() => projects.get(props.projectId));

/**
 * Membership is loaded here, at the workspace root, not in the Members tab.
 *
 * `members.isOwner` gates the gear menu and the settings form, both of which exist on
 * every tab. Fetching it only where the member list renders would leave `isOwner`
 * false everywhere else — an owner would lose their own controls by navigating away.
 */
function loadMembers(projectId: string) {
  members.subscribe(projectId);
  void members.fetchFor(projectId);
}

onMounted(async () => {
  // Subscribe first so the fetch covers the window before the channel is live — see
  // the note in DashboardView. A deep link lands here with an empty store, so fetch
  // before deciding the project is missing.
  projects.subscribe();
  loadMembers(props.projectId);
  if (!project.value) await projects.fetchAll();
  resolving.value = false;
});

watch(() => props.projectId, loadMembers);

onUnmounted(() => {
  projects.unsubscribeAll();
  members.unsubscribeAll();
});
</script>

<template>
  <main class="page">
    <p v-if="resolving" class="muted">Loading…</p>

    <!-- A non-member gets zero rows, which is indistinguishable from a bad id. Don't
         claim it doesn't exist, and don't confirm that it does. -->
    <div v-else-if="!project" class="missing">
      <h1>Not found</h1>
      <p class="muted">This project doesn't exist, or you don't have access to it.</p>
      <RouterLink :to="{ name: 'dashboard' }">Back to projects</RouterLink>
    </div>

    <RouterView v-else />
  </main>
</template>

<style scoped>
.page {
  max-width: 60rem;
  margin: 0 auto;
  padding: var(--sp-8) var(--sp-4);
}

h1 {
  margin: 0 0 var(--sp-2);
  font-size: 1.25rem;
}

.muted {
  color: var(--c-muted);
}
</style>
