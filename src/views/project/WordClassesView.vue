<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { computed } from "vue";
import { onBeforeRouteLeave } from "vue-router";

import CategoryCard from "@/components/wordClasses/CategoryCard.vue";
import ClassCard from "@/components/wordClasses/ClassCard.vue";
import { entryCounts, orphanedClassNames } from "@/lib/wordClasses";
import { useLexiconStore } from "@/stores/lexicon";
import { usePhonemesStore } from "@/stores/phonemes";
import { useWordClassesStore } from "@/stores/wordClasses";

const props = defineProps<{ projectId: string }>();

const classes = useWordClassesStore();
const lexicon = useLexiconStore();
const phonemes = usePhonemesStore();

const counts = computed(() => entryCounts(lexicon.entries));

/**
 * Lexicon entries whose class no longer exists.
 *
 * Measured against the **draft**, not the saved classes, so deleting a class shows what
 * that would strand before the save rather than after it — the same courtesy the phoneme
 * inventory pays the phonotactics.
 */
const orphans = computed(() => orphanedClassNames(lexicon.entries, classes.draft));

async function save() {
  await classes.save(props.projectId);
}

/** Adopting an orphaned name as a real class is almost always what was meant. */
function adopt(name: string) {
  classes.addClass(name);
}

onBeforeRouteLeave(() => {
  if (!classes.dirty) return true;
  return window.confirm("You have unsaved changes to the word classes. Leave anyway?");
});

useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
  if (!classes.dirty) return;
  event.preventDefault();
});
</script>

<template>
  <section>
    <header>
      <h1>Word classes</h1>
      <p class="muted">
        The parts of speech this language has, and the categories each one inflects for. A class
        name is what a lexicon entry's word class refers to.
      </p>
    </header>

    <div v-if="phonemes.count === 0" class="gate">
      <p class="muted">
        Nothing to build from yet — this section works from the phoneme inventory, and this language
        doesn't have one.
      </p>
      <RouterLink :to="{ name: 'project-phonemes', params: { projectId } }">
        Set up the phoneme inventory →
      </RouterLink>
    </div>

    <template v-else>
      <p v-if="classes.changedElsewhere" class="notice" role="status">
        Someone else changed the word classes. Your draft is untouched.
        <button type="button" @click="classes.acceptIncoming()">Load their version</button>
      </p>

      <p v-if="classes.error" class="error" role="alert">{{ classes.error }}</p>

      <!-- A dangling class name is inert, not lost: the entry keeps it, so putting the
           class back restores the connection. That is why it warns instead of blocking. -->
      <div v-if="orphans.length" class="impact" role="alert">
        <p class="impact-head">
          Some lexicon entries name a class that isn't here. They keep the name, so adding the class
          back reconnects them.
        </p>
        <ul>
          <li v-for="orphan in orphans" :key="orphan.name">
            <strong>{{ orphan.name }}</strong>
            — {{ orphan.count }} {{ orphan.count === 1 ? "entry" : "entries" }}
            <button type="button" @click="adopt(orphan.name)">Add as a class</button>
          </li>
        </ul>
      </div>

      <div class="bar">
        <span class="muted">
          {{ classes.draft.classes.length }}
          {{ classes.draft.classes.length === 1 ? "class" : "classes" }},
          {{ classes.draft.categories.length }}
          {{ classes.draft.categories.length === 1 ? "category" : "categories" }}
          <em v-if="classes.dirty"> · unsaved changes</em>
        </span>
        <div class="actions">
          <button
            type="button"
            :disabled="!classes.dirty || classes.saving"
            @click="classes.discard()"
          >
            Discard
          </button>
          <button type="submit" :disabled="!classes.dirty || classes.saving" @click="save">
            {{ classes.saving ? "Saving…" : "Save" }}
          </button>
        </div>
      </div>

      <div class="panes">
        <div>
          <h2>Classes</h2>
          <ul class="cards">
            <ClassCard
              v-for="(cls, i) in classes.draft.classes"
              :key="i"
              :cls="cls"
              :index="i"
              :count="classes.draft.classes.length"
              :entries="counts.get(cls.name.trim()) ?? 0"
              :categories="classes.draft.categories"
              @move="classes.moveClass"
              @remove="classes.removeClassAt"
              @toggle="classes.toggleCategory"
            />
          </ul>
          <button type="button" class="add" @click="classes.addClass()">+ Add class</button>
          <p v-if="classes.draft.classes.length === 0" class="muted empty">
            No classes yet. Noun and verb are the usual place to start.
          </p>
        </div>

        <div>
          <h2>Categories</h2>
          <ul class="cards">
            <CategoryCard
              v-for="(category, i) in classes.draft.categories"
              :key="i"
              :category="category"
              :index="i"
              :used-by="
                classes.draft.classes
                  .filter((c) => c.categories.includes(category.name))
                  .map((c) => c.name || 'unnamed')
              "
              @move="classes.moveCategory"
              @remove="classes.removeCategoryAt"
              @rename="classes.renameCategory"
              @add-value="classes.addValue"
              @remove-value="classes.removeValueAt"
            />
          </ul>
          <button type="button" class="add" @click="classes.addCategory()">+ Add category</button>
          <p v-if="classes.draft.categories.length === 0" class="muted empty">
            No categories yet — number, case and tense are the ones most languages need first.
          </p>
        </div>
      </div>

      <!-- Said plainly rather than left as an absence, so the page does not read as a
           complete account of the morphology. -->
      <p class="deferred">
        Morpheme order isn't modelled here yet. The source splits a nominal template across a word
        boundary, lets a semantic particle occupy the case slot, marks plural by reduplication and
        evidentiality by a coda — none of which is a slot chain, and each needs its own design pass.
      </p>
    </template>
  </section>
</template>

<style scoped>
h1 {
  margin: 0 0 var(--sp-2);
  font-size: 1.25rem;
}

header p {
  max-width: 44rem;
  margin: 0;
  font-size: 0.875rem;
}

h2 {
  margin: 0 0 var(--sp-3);
  font-size: 0.75rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.gate {
  padding: var(--sp-8) 0;
  text-align: center;
}

.gate p {
  max-width: 34rem;
  margin: 0 auto var(--sp-4);
}

.bar {
  position: sticky;
  top: var(--header-h);
  z-index: 5;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--sp-3);
  margin: var(--sp-6) 0 var(--sp-4);
  padding: var(--sp-3) 0;
  border-bottom: 1px solid var(--c-border);
  background: var(--c-bg);
}

.actions {
  display: flex;
  gap: var(--sp-2);
}

.bar em {
  font-style: normal;
  color: var(--c-accent);
  font-weight: 600;
}

.panes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-6);
  align-items: start;
}

.cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sp-3);
}

.add {
  margin-top: var(--sp-3);
}

.empty {
  margin-top: var(--sp-3);
}

.notice {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
  margin: var(--sp-4) 0 0;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-left: 3px solid var(--c-accent);
  border-radius: var(--radius);
  background: var(--c-raised);
  font-size: 0.875rem;
}

.impact {
  margin: var(--sp-4) 0 0;
  padding: var(--sp-3);
  border: 1px solid var(--c-danger);
  border-radius: var(--radius);
  font-size: 0.875rem;
}

.impact-head {
  margin: 0 0 var(--sp-2);
}

.impact ul {
  margin: 0;
  padding-left: var(--sp-4);
  display: grid;
  gap: var(--sp-1);
}

.deferred {
  max-width: 44rem;
  margin: var(--sp-8) 0 0;
  padding-top: var(--sp-4);
  border-top: 1px solid var(--c-border);
  color: var(--c-muted);
  font-size: 0.8125rem;
}

.muted {
  color: var(--c-muted);
  font-size: 0.875rem;
}

.error {
  color: var(--c-danger);
}

@media (max-width: 60rem) {
  .panes {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
