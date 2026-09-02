<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";

import { useMembersStore } from "@/stores/members";
import { useProjectsStore } from "@/stores/projects";

const props = defineProps<{ projectId: string }>();

const projects = useProjectsStore();
const members = useMembersStore();

const project = computed(() => projects.get(props.projectId));

const saving = ref(false);
const publishing = ref(false);
const name = ref("");
const description = ref("");

const isPublic = computed(() => project.value?.is_public ?? false);

/**
 * Publishing is its own action, not a checkbox inside the Save form.
 *
 * It does something different in kind from renaming: it decides who may read the language
 * at all, and it takes effect the moment it is pressed. Burying it in a form someone might
 * submit while thinking about the description is the wrong shape for that, and it is why
 * this asks first.
 */
async function togglePublic() {
  const next = !isPublic.value;
  const question = next
    ? "Publish this conlang? Anyone with the link will be able to read every section, " +
      "signed in or not, and it will be listed on the home page. Nobody outside the " +
      "project can change anything, and the member list stays private."
    : "Unpublish? It will disappear from the public list and only members will be able " +
      "to open it.";
  if (!window.confirm(question)) return;

  publishing.value = true;
  try {
    await projects.updateProject(props.projectId, { is_public: next });
  } finally {
    publishing.value = false;
  }
}

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

    <!-- Owner-only, like renaming: RLS restricts UPDATE on projects to owners, so this is
         the one control that decides who can read the whole thing. -->
    <section v-if="members.isOwner" class="publish">
      <h2>Visibility</h2>
      <p class="muted">
        <template v-if="isPublic">
          <strong>Published.</strong> Anyone with the link can read every section, signed in or not,
          and it is listed on the home page. Only members can change anything, and the member list
          is not published.
        </template>
        <template v-else> <strong>Private.</strong> Only members can open it. </template>
      </p>
      <button type="button" :disabled="publishing" @click="togglePublic">
        {{ publishing ? "Saving…" : isPublic ? "Make private" : "Publish" }}
      </button>
    </section>

    <dl v-else class="readonly">
      <dt>Name</dt>
      <dd>{{ project?.name }}</dd>
      <dt>Description</dt>
      <dd>{{ project?.description || "—" }}</dd>
      <dt>Visibility</dt>
      <dd>{{ isPublic ? "Published — anyone can read it" : "Private" }}</dd>
      <dt>Your role</dt>
      <dd>{{ members.currentRole ?? "not a member" }}</dd>
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

.publish {
  margin-top: var(--sp-8);
  padding-top: var(--sp-6);
  border-top: 1px solid var(--c-border);
}

.publish h2 {
  margin: 0 0 var(--sp-2);
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.publish p {
  margin: 0 0 var(--sp-3);
  font-size: 0.875rem;
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
