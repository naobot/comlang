<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { useAuthStore } from "@/stores/auth";
import { useMembersStore } from "@/stores/members";

const props = defineProps<{ projectId: string }>();

const auth = useAuthStore();
const members = useMembersStore();

const email = ref("");

const isOwner = computed(
  () => members.members.find((m) => m.user_id === auth.user?.id)?.role === "owner",
);

function load(projectId: string) {
  // Subscribe first, then fetch — the fetch covers the window before the channel is
  // live. See the note in DashboardView.
  members.subscribe(projectId);
  void members.fetchFor(projectId);
}

onMounted(() => load(props.projectId));
watch(() => props.projectId, load);
onUnmounted(() => members.unsubscribeAll());

async function onAdd() {
  const value = email.value.trim();
  if (!value) return;
  if (await members.addByEmail(props.projectId, value)) email.value = "";
}

function label(m: (typeof members.members)[number]) {
  return m.profile?.display_name || m.profile?.email || m.user_id;
}
</script>

<template>
  <section class="members">
    <h2>Members</h2>

    <p v-if="members.loading && members.members.length === 0" class="muted">Loading…</p>

    <ul v-else class="list">
      <li v-for="m in members.members" :key="`${m.project_id}:${m.user_id}`">
        <span class="name">
          {{ label(m) }}
          <em v-if="m.user_id === auth.user?.id">you</em>
        </span>
        <span class="role">{{ m.role }}</span>
        <button
          v-if="isOwner && m.user_id !== auth.user?.id"
          type="button"
          @click="members.remove(m.project_id, m.user_id)"
        >
          Remove
        </button>
      </li>
    </ul>

    <form v-if="isOwner" class="add" @submit.prevent="onAdd">
      <input
        v-model="email"
        type="email"
        placeholder="collaborator@example.com"
        aria-label="Collaborator email"
      />
      <button type="submit" :disabled="members.adding || !email.trim()">
        {{ members.adding ? "Adding…" : "Add" }}
      </button>
    </form>

    <!-- The RPC only resolves emails that already have an account; there is no invite
         email in this build. -->
    <p v-if="isOwner" class="muted hint">
      They need an account already — accounts are created in the Supabase dashboard.
    </p>

    <p v-if="members.error" class="error" role="alert">{{ members.error }}</p>
  </section>
</template>

<style scoped>
.members {
  margin-top: var(--sp-8);
  padding-top: var(--sp-6);
  border-top: 1px solid var(--c-border);
}

h2 {
  margin: 0 0 var(--sp-4);
  font-size: 1rem;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sp-2);
}

.list li {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
}

.name {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}

.name em {
  margin-left: var(--sp-2);
  font-style: normal;
  font-size: 0.75rem;
  color: var(--c-muted);
}

.role {
  font-size: 0.8125rem;
  color: var(--c-muted);
}

.add {
  display: flex;
  gap: var(--sp-2);
  margin-top: var(--sp-4);
}

.muted {
  color: var(--c-muted);
  font-size: 0.875rem;
}

.hint {
  margin: var(--sp-2) 0 0;
}

.error {
  color: var(--c-danger);
}
</style>
