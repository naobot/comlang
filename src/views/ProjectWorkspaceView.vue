<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import { useAuthStore } from "@/stores/auth";
import { useCorpusStore } from "@/stores/corpus";
import { useGrammarRulesStore } from "@/stores/grammarRules";
import { useLexiconStore } from "@/stores/lexicon";
import { useMembersStore } from "@/stores/members";
import { usePhonemesStore } from "@/stores/phonemes";
import { usePhonotacticsStore } from "@/stores/phonotactics";
import { useProjectsStore } from "@/stores/projects";
import { useWordClassesStore } from "@/stores/wordClasses";

const props = defineProps<{ projectId: string }>();

const auth = useAuthStore();
const projects = useProjectsStore();
const members = useMembersStore();
const lexicon = useLexiconStore();
const grammarRules = useGrammarRulesStore();
const corpus = useCorpusStore();
const phonemes = usePhonemesStore();
const phonotactics = usePhonotacticsStore();
const wordClasses = useWordClassesStore();
const resolving = ref(true);

const project = computed(() => projects.get(props.projectId));

/**
 * Membership is loaded here, at the workspace root, not in the Members tab.
 *
 * `members.isOwner` gates the gear menu and the settings form, both of which exist on
 * every tab. Fetching it only where the member list renders would leave `isOwner`
 * false everywhere else — an owner would lose their own controls by navigating away.
 */
/**
 * The inventory is loaded here for the same reason as membership: sections that do not
 * own it still need to know whether it exists. `meta.requires` on the phonotactics,
 * word-class, lexicon and grammar routes is answered from this store, and those pages
 * would all read "no inventory" if only the phoneme tab ever fetched it.
 */
async function loadProjectData(projectId: string) {
  members.subscribe(projectId);
  // Awaited, unlike everything below it: `members.canEdit` decides whether the whole
  // workspace renders read-only, and a member watching their own controls appear a beat
  // late reads as a bug. Nothing else here gates the page's shape.
  const membership = members.fetchFor(projectId);
  phonemes.subscribe(projectId);
  void phonemes.fetchFor(projectId);
  phonotactics.subscribe(projectId);
  void phonotactics.fetchFor(projectId);
  lexicon.subscribe(projectId);
  void lexicon.fetchFor(projectId);
  grammarRules.subscribe(projectId);
  void grammarRules.fetchFor(projectId);
  corpus.subscribe(projectId);
  void corpus.fetchFor(projectId);
  // Loaded here rather than only on its own tab, for the same reason as the inventory:
  // the lexicon's class picker and its orphan warning both need the class list, and
  // that page does not own it.
  wordClasses.subscribe(projectId);
  void wordClasses.fetchFor(projectId);
  await membership;
}

onMounted(async () => {
  // Subscribe first so the fetch covers the window before the channel is live — see
  // the note in DashboardView. A deep link lands here with an empty store, so fetch
  // before deciding the project is missing.
  projects.subscribe();
  const data = loadProjectData(props.projectId);
  // A deep link lands here with an empty store. `fetchAll` covers the signed-in case;
  // `fetchPublic` is what makes a shared link work for someone who is not a member — or
  // not signed in at all.
  if (!project.value) await projects.fetchAll();
  if (!project.value) await projects.fetchPublic();
  await data;
  resolving.value = false;
});

watch(
  () => props.projectId,
  (id) => void loadProjectData(id),
);

onUnmounted(() => {
  projects.unsubscribeAll();
  members.unsubscribeAll();
  phonemes.unsubscribeAll();
  phonotactics.unsubscribeAll();
  lexicon.unsubscribeAll();
  grammarRules.unsubscribeAll();
  wordClasses.unsubscribeAll();
  corpus.unsubscribeAll();
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

    <template v-else>
      <!-- Said once, at the top, rather than as a disabled control in every section: a
           visitor is reading a published conlang, and the sections below simply do not
           offer the editing controls. RLS is the boundary either way — this is what stops
           the page offering a button that would always fail. -->
      <p v-if="!members.canEdit" class="read-only" role="status">
        <strong>Read-only.</strong>
        {{
          auth.user
            ? "This conlang is published; you're not a member of it, so nothing here can be changed."
            : "This conlang is published. Sign in as a member to make changes."
        }}
        <RouterLink v-if="!auth.user" :to="{ name: 'login', query: { r: $route.fullPath } }">
          Sign in
        </RouterLink>
      </p>

      <RouterView />
    </template>
  </main>
</template>

<style scoped>
/* Full width up to 2400px. The sections are two-pane editors and dense charts, not
   prose — they use the room. Individual blocks that *are* prose keep their own measure,
   which is why the intro paragraphs still cap at 44rem. */
.page {
  max-width: 2400px;
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

.read-only {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  flex-wrap: wrap;
  margin: 0 0 var(--sp-4);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-left: 3px solid var(--c-accent);
  border-radius: var(--radius);
  background: var(--c-raised);
  font-size: 0.875rem;
}
</style>
