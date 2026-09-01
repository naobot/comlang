<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import { useMembersStore } from "@/stores/members";
import { useProjectsStore } from "@/stores/projects";

const props = defineProps<{ projectId: string }>();

const projects = useProjectsStore();
const members = useMembersStore();

const project = computed(() => projects.get(props.projectId));

const saving = ref(false);
const name = ref("");
const description = ref("");

// Seed the fields once the project resolves, and re-seed if a realtime update lands
// while nobody is mid-edit. `saving` guards the in-flight case.
watchEffect(() => {
  if (!project.value || saving.value) return;
  name.value = project.value.name;
  description.value = project.value.description ?? "";
});

async function save() {
  const trimmed = name.value.trim();
  if (!trimmed) return;

  saving.value = true;
  try {
    await projects.updateProject(props.projectId, {
      name: trimmed,
      description: description.value.trim() || null,
    });
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="settings">
    <h1>Settings</h1>

    <!-- Renaming is owner-only in RLS. The policy is the real boundary; hiding the form
         from a collaborator just avoids offering a control that would always fail. -->
    <form v-if="members.isOwner" @submit.prevent="save">
      <label>
        Name
        <input v-model="name" required aria-label="Project name" />
      </label>
      <label>
        Description
        <input v-model="description" placeholder="Optional" />
      </label>
      <div>
        <button type="submit" :disabled="saving || !name.trim()">
          {{ saving ? "Saving…" : "Save" }}
        </button>
      </div>
    </form>

    <dl v-else class="readonly">
      <dt>Name</dt>
      <dd>{{ project?.name }}</dd>
      <dt>Description</dt>
      <dd>{{ project?.description || "—" }}</dd>
      <dt>Your role</dt>
      <dd>{{ members.currentRole ?? "—" }}</dd>
    </dl>

    <p v-if="!members.isOwner" class="muted">Only the project owner can change these.</p>
    <p v-if="projects.error" class="error" role="alert">{{ projects.error }}</p>
  </section>
</template>

<style scoped>
.settings {
  max-width: 32rem;
}

h1 {
  margin: 0 0 var(--sp-6);
  font-size: 1.25rem;
}

form {
  display: grid;
  gap: var(--sp-4);
}

label {
  display: grid;
  gap: var(--sp-1);
  font-size: 0.875rem;
  color: var(--c-muted);
}

label input {
  color: var(--c-text);
}

.readonly {
  display: grid;
  grid-template-columns: 8rem 1fr;
  gap: var(--sp-2) var(--sp-4);
  margin: 0;
}

.readonly dt {
  color: var(--c-muted);
  font-size: 0.875rem;
}

.readonly dd {
  margin: 0;
}

.muted {
  color: var(--c-muted);
  font-size: 0.875rem;
}

.error {
  color: var(--c-danger);
}
</style>
