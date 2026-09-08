<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { computed } from "vue";
import { onBeforeRouteLeave } from "vue-router";

import { assembleSpec, parseSpec } from "@/lib/morphologySpec";
import { useLexiconStore } from "@/stores/lexicon";
import { useMembersStore } from "@/stores/members";
import { useMorphologyStore } from "@/stores/morphology";

const props = defineProps<{ projectId: string }>();

const morphology = useMorphologyStore();
const members = useMembersStore();
const lexicon = useLexiconStore();

const EXAMPLE = `{
  "version": 1,
  "rules": {
    "vowels": "aeiou",
    "glides": "jw",
    "digraphs": ["ng", "ts"],
    "reduplication": { "enabled": true },
    "harmony": { "enabled": false, "pairs": { "i": "u", "e": "o" }, "neutral": "a" },
    "elision": { "enabled": false },
    "lowering": { "enabled": false, "after": "w", "map": { "u": "o" } }
  },
  "slots": {
    "nominal": ["numeral", "classifier", "STEM", "plural", "case", "semanticParticle"],
    "predicate": ["negation", "STEM", "tense", "force", "evidential", "conjunction"]
  },
  "affixes": [
    { "match": { "entryKeyPrefix": "p_neg" }, "role": "negation", "position": "prefix" },
    { "match": { "wordClass": "case marker" }, "role": "case", "position": "suffix" },
    { "match": { "wordClass": "tense marker" }, "role": "tense", "position": "suffix" }
  ],
  "stems": [
    { "wordClass": ["noun", "pronoun", "demonstrative"], "slotClass": "nominal" },
    { "wordClass": ["verb", "adjective", "predicate"], "slotClass": "predicate" }
  ]
}`;

/** Parse whatever is in the editor right now (may be broken); used for the live preview. */
const draftParse = computed(() => {
  const text = morphology.draftText.trim();
  if (text === "") return { doc: null, problems: [] as string[], jsonError: null as string | null };
  try {
    return { ...parseSpec(JSON.parse(text)), jsonError: null };
  } catch (e) {
    return {
      doc: null,
      problems: [] as string[],
      jsonError: e instanceof Error ? e.message : String(e),
    };
  }
});

const preview = computed(() => {
  if (draftParse.value.jsonError || lexicon.entries.length === 0) return null;
  return assembleSpec(lexicon.entries, draftParse.value.doc);
});

const stemCount = computed(() => preview.value?.spec.stems.length ?? 0);
const affixCount = computed(() => preview.value?.spec.affixes.length ?? 0);

async function save() {
  await morphology.save(props.projectId);
}

function loadExample() {
  morphology.draftText = EXAMPLE;
}

onBeforeRouteLeave(() => {
  if (!morphology.dirty) return true;
  return window.confirm("You have unsaved changes to the morphology plugin. Leave anyway?");
});

useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
  if (!morphology.dirty) return;
  event.preventDefault();
});
</script>

<template>
  <section>
    <header>
      <h1>Morphology plugin</h1>
      <p class="muted">
        A JSON document describing how words inflect in this language: which lexicon entries are
        bound affixes, which slot each fills, the order of the phonological word, and its
        phonological rules. The corpus reads it to recognise inflected forms on hover. With no
        plugin, corpus hover shows exact lexicon matches only.
      </p>
      <p class="muted">
        Recognition of rule-altered forms (harmony, elision, lowering) is approximate — it matches
        the alternants a rule <em>could</em> produce, not a full derivation.
      </p>
    </header>

    <div v-if="lexicon.entries.length === 0" class="gate">
      <p class="muted">
        A plugin classifies lexicon entries, and this language doesn't have any yet.
      </p>
      <RouterLink :to="{ name: 'project-lexicon', params: { projectId } }">
        Go to the lexicon →
      </RouterLink>
    </div>

    <template v-else>
      <p v-if="morphology.changedElsewhere" class="notice" role="status">
        Someone else changed the morphology plugin. Your draft is untouched.
        <button type="button" @click="morphology.acceptIncoming()">Load their version</button>
      </p>

      <p v-if="morphology.error" class="error" role="alert">{{ morphology.error }}</p>

      <template v-if="members.isOwner">
        <div class="bar">
          <span class="muted">
            <em v-if="morphology.dirty">unsaved changes</em>
            <span v-else-if="morphology.isEmpty">no plugin — exact matches only</span>
            <span v-else>saved</span>
          </span>
          <div class="actions">
            <button type="button" @click="loadExample">Insert example</button>
            <button
              type="button"
              :disabled="!morphology.dirty || morphology.saving"
              @click="morphology.discard()"
            >
              Discard
            </button>
            <button
              type="button"
              class="primary"
              :disabled="!morphology.dirty || morphology.saving"
              @click="save"
            >
              {{ morphology.saving ? "Saving…" : "Save" }}
            </button>
          </div>
        </div>

        <textarea
          v-model="morphology.draftText"
          class="spec"
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          aria-label="Morphology plugin JSON"
          placeholder="Paste or write the plugin JSON here. Leave empty for exact-match-only hover."
        />

        <div class="panel">
          <p v-if="draftParse.jsonError" class="error" role="alert">
            Not valid JSON: {{ draftParse.jsonError }}
          </p>
          <template v-else>
            <p class="muted">
              {{ stemCount }} {{ stemCount === 1 ? "stem" : "stems" }} · {{ affixCount }}
              {{ affixCount === 1 ? "affix" : "affixes" }}
              <template v-if="draftParse.doc === null && morphology.draftText.trim() !== ''">
                · document not usable
              </template>
            </p>
            <ul v-if="draftParse.problems.length" class="problems">
              <li v-for="(p, i) in draftParse.problems" :key="i">{{ p }}</li>
            </ul>
            <ul v-if="preview && preview.problems.length" class="problems">
              <li v-for="(p, i) in preview.problems" :key="i">{{ p }}</li>
            </ul>
          </template>
        </div>
      </template>

      <template v-else>
        <p class="muted">Only the project owner can edit the morphology plugin.</p>
        <pre v-if="!morphology.isEmpty" class="spec readonly">{{ morphology.persistedText }}</pre>
        <p v-else class="muted">No plugin set — corpus hover shows exact lexicon matches only.</p>
      </template>

      <details class="docs">
        <summary>Document reference</summary>
        <ul class="muted">
          <li>
            <code>rules.vowels</code> / <code>glides</code> / <code>digraphs</code> — the letters
            syllabification works from.
          </li>
          <li>
            <code>rules.reduplication.enabled</code> — plural is a copy of the final two syllables
            prefixed to the stem.
          </li>
          <li>
            <code>rules.harmony</code> / <code>elision</code> / <code>lowering</code> — phonological
            rules; recognition of their output is approximate.
          </li>
          <li>
            <code>slots.nominal</code> / <code>slots.predicate</code> — the ordered slot names of
            each phonological word; each must contain exactly one <code>"STEM"</code>.
          </li>
          <li>
            <code>affixes[]</code> — <code>match</code> (one of <code>entryKeyPrefix</code>,
            <code>entryKey</code>, <code>wordClass</code>) → a <code>role</code> (a slot name) and a
            <code>position</code>.
          </li>
          <li>
            <code>stems[]</code> — <code>wordClass</code> → <code>slotClass</code> (<code
              >nominal</code
            >
            / <code>predicate</code> / <code>both</code>).
          </li>
        </ul>
        <pre class="spec readonly">{{ EXAMPLE }}</pre>
      </details>
    </template>
  </section>
</template>

<style scoped>
section {
  max-width: 60rem;
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

h1 {
  margin: 0 0 var(--sp-2);
  font-size: 1.25rem;
}

.muted {
  margin: 0 0 var(--sp-2);
  color: var(--c-muted);
  font-size: 0.875rem;
}

.gate {
  padding: var(--sp-6) var(--sp-3);
  border: 1px dashed var(--c-border);
  border-radius: var(--radius);
}

.notice {
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius);
  background: var(--c-raised);
  font-size: 0.875rem;
}

.error {
  margin: 0;
  color: var(--c-danger);
  font-size: 0.875rem;
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}

.actions {
  display: flex;
  gap: var(--sp-2);
}

.primary {
  background: var(--c-accent);
  color: var(--c-accent-text);
  border-color: transparent;
}

.primary:hover:not(:disabled) {
  background: var(--c-text);
}

.spec {
  width: 100%;
  min-height: 22rem;
  padding: var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  color: var(--c-text);
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  line-height: 1.5;
  resize: vertical;
  white-space: pre;
  overflow: auto;
  tab-size: 2;
}

.readonly {
  margin: 0;
}

.panel {
  padding: var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-raised);
}

.problems {
  margin: var(--sp-2) 0 0;
  padding-left: var(--sp-4);
  color: var(--c-danger);
  font-size: 0.8125rem;
}

.docs summary {
  cursor: pointer;
  font-size: 0.875rem;
}

.docs ul {
  margin: var(--sp-3) 0;
  padding-left: var(--sp-4);
  line-height: 1.6;
}
</style>
