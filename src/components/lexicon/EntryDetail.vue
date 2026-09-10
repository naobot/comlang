<script setup lang="ts">
import { computed, nextTick, ref } from "vue";

import PhonemePalette from "@/components/lexicon/PhonemePalette.vue";
import { checkLemma } from "@/lib/lemmaPhonotactics";
import { useLexiconStore } from "@/stores/lexicon";
import { useMembersStore } from "@/stores/members";
import { usePhonemesStore } from "@/stores/phonemes";
import { usePhonotacticsStore } from "@/stores/phonotactics";
import { useWordClassesStore } from "@/stores/wordClasses";

const props = defineProps<{ projectId: string }>();
const lexicon = useLexiconStore();
const members = useMembersStore();
const phonemes = usePhonemesStore();
const phonotactics = usePhonotacticsStore();
const wordClasses = useWordClassesStore();

/**
 * The classes this project defines, from what is **saved** — a half-typed class on the
 * other tab must not become a choice here.
 *
 * Empty until someone sets that page up, and the field falls back to free text with
 * suggestions when it is: a project with no classes yet still has to be able to write a
 * word down. Same soft gate as everywhere else.
 */
const defined = computed(() => wordClasses.classNames.filter((n) => n.trim()));

/**
 * The entry's own value when no class defines it — a class that was deleted, or a value
 * from before this page existed.
 *
 * It stays selectable rather than being silently cleared, because `word_class` is text
 * and the whole point of that is that a dangling name survives to be reconnected.
 */
const orphaned = computed(() => {
  const current = lexicon.draft.word_class?.trim();
  if (!current) return null;
  return defined.value.includes(current) ? null : current;
});

/**
 * Why the underlying phonology as typed does not fit the saved phonotactics, or null.
 *
 * Checks against `underlying_phonology`, not `lemma` — once a project has an orthography
 * (0031), `lemma` is the written spelling, which can merge or reshape phonemic contrasts
 * in ways that make checking it against the grammar meaningless. See `lemmaPhonotactics.ts`.
 *
 * Checks the live draft, not the stored row — same as `orphaned` above — so it updates
 * as the field is edited. Dark until the project has both an inventory and a syllable
 * template; advisory when lit, exactly like the orphaned-class hint.
 */
const lemmaWarning = computed(() => {
  if (!phonotactics.hasTemplates || phonemes.count === 0) return null;
  const phonology = lexicon.draft.underlying_phonology.trim();
  if (!phonology) return null;
  const result = checkLemma(
    phonotactics.persistedGrammar,
    new Set(phonemes.inventory.map((p) => p.ipa)),
    phonology,
  );
  return result.ok ? null : result.reason;
});

const title = computed(() => {
  if (lexicon.creating) return lexicon.draft.lemma.trim() || "New entry";
  return lexicon.draft.lemma.trim() || "—";
});

/**
 * The phoneme palette beside the underlying-phonology field: a keyboard has no `ɡ` or `ŋ`
 * key, and that column is meant to hold the real phonemic string. Toggled shut by default
 * — most entries are typed, not clicked — and only offered when the project has a saved
 * inventory to draw from.
 */
const showPalette = ref(false);
const underlyingInput = ref<HTMLInputElement | null>(null);

/**
 * Drop `ipa` in at the caret (replacing any selection), then put the caret after it. Falls
 * back to appending when the input has not reported a selection — e.g. the palette chip
 * was reached by keyboard, so the input is not focused.
 */
function insertPhoneme(ipa: string) {
  const el = underlyingInput.value;
  const current = lexicon.draft.underlying_phonology;
  const start = el?.selectionStart ?? current.length;
  const end = el?.selectionEnd ?? current.length;
  lexicon.draft.underlying_phonology = current.slice(0, start) + ipa + current.slice(end);
  void nextTick(() => {
    if (!el) return;
    el.focus();
    const caret = start + ipa.length;
    el.setSelectionRange(caret, caret);
  });
}

async function save() {
  await lexicon.saveOpen(props.projectId);
}

async function remove() {
  if (!lexicon.openId) return;
  const label = lexicon.draft.lemma.trim() || "this entry";
  if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;
  await lexicon.remove(lexicon.openId);
}
</script>

<template>
  <section class="detail">
    <header>
      <h2>{{ title }}</h2>
      <span v-if="lexicon.dirty" class="unsaved">unsaved</span>
    </header>

    <!-- Someone else edited this entry while it was being changed here. Their version is
         held aside rather than applied, so nothing typed is lost either way. -->
    <p v-if="lexicon.incoming" class="notice" role="status">
      Someone else changed this entry. Your edits are untouched.
      <button type="button" @click="lexicon.acceptIncoming()">Load theirs</button>
    </p>

    <!-- The pane deliberately keeps its text: it is still work, and saving it again
         recreates the entry. -->
    <p v-if="lexicon.openDeletedElsewhere" class="notice danger" role="alert">
      Someone else deleted this entry. What's below is still here — saving will create it again.
    </p>

    <p v-if="lexicon.error" class="error" role="alert">{{ lexicon.error }}</p>

    <form @submit.prevent="save">
      <label class="wide">
        Lemma
        <input
          v-model="lexicon.draft.lemma"
          class="mono"
          :readonly="!members.canEdit"
          required
          aria-label="Lemma"
        />
      </label>

      <label class="wide">
        Underlying phonology
        <input
          ref="underlyingInput"
          v-model="lexicon.draft.underlying_phonology"
          class="mono"
          :class="{ warn: lemmaWarning }"
          :readonly="!members.canEdit"
          :aria-invalid="lemmaWarning ? 'true' : undefined"
          placeholder="/phonemic form/"
          aria-label="Underlying phonology"
        />
        <small v-if="lemmaWarning" class="hint">{{ lemmaWarning }}</small>
        <div v-if="members.canEdit && phonemes.count > 0" class="palette-wrap">
          <button
            type="button"
            class="palette-toggle"
            :aria-expanded="showPalette"
            @click="showPalette = !showPalette"
          >
            {{ showPalette ? "Hide phonemes" : "Insert phoneme…" }}
          </button>
          <PhonemePalette v-if="showPalette" @insert="insertPhoneme" />
        </div>
      </label>

      <label class="wide">
        Meaning
        <input
          v-model="lexicon.draft.gloss"
          :readonly="!members.canEdit"
          placeholder="English translation"
        />
      </label>

      <label>
        Word class
        <!-- A select once the project defines classes, so the two pages agree on the
             vocabulary; free text before that, so a new project is not blocked. -->
        <select
          v-if="defined.length"
          v-model="lexicon.draft.word_class"
          :disabled="!members.canEdit"
          :class="{ orphan: orphaned }"
        >
          <option :value="null">—</option>
          <option v-for="name in defined" :key="name" :value="name">{{ name }}</option>
          <option v-if="orphaned" :value="orphaned">{{ orphaned }} (not a class)</option>
        </select>
        <template v-else>
          <input
            v-model="lexicon.draft.word_class"
            :readonly="!members.canEdit"
            list="lexicon-word-classes"
          />
          <datalist id="lexicon-word-classes">
            <option v-for="wc in lexicon.wordClasses" :key="wc ?? ''" :value="wc ?? ''" />
          </datalist>
        </template>
        <small v-if="orphaned" class="hint">
          No class is called “{{ orphaned }}”. The entry keeps it either way.
        </small>
      </label>

      <label>
        Key
        <input
          v-model="lexicon.draft.entry_key"
          class="mono"
          :readonly="!members.canEdit"
          placeholder="e.g. n_neck"
        />
      </label>

      <label class="wide">
        Notes
        <textarea v-model="lexicon.draft.notes" :readonly="!members.canEdit" rows="5"></textarea>
      </label>

      <div v-if="members.canEdit" class="actions">
        <button type="submit" :disabled="!lexicon.dirty || lexicon.saving">
          {{ lexicon.saving ? "Saving…" : "Save" }}
        </button>
        <button
          type="button"
          :disabled="!lexicon.dirty || lexicon.saving"
          @click="lexicon.discard()"
        >
          Discard
        </button>
        <button
          v-if="lexicon.openId && !lexicon.openDeletedElsewhere"
          type="button"
          class="danger-action"
          @click="remove"
        >
          Delete
        </button>
      </div>
    </form>

    <p v-if="members.canEdit" class="hint">
      Fields are free-form for now. Word class becomes a real reference once that section is
      designed.
    </p>
  </section>
</template>

<style scoped>
select {
  font: inherit;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  color: var(--c-text);
  width: 100%;
}

/* Inert rather than wrong — the word is intact and reconnects the moment the class comes
   back — so this reads as a flag, not an error. */
select.orphan,
input.warn {
  border-color: var(--c-danger);
}

.hint {
  color: var(--c-danger);
  font-size: 0.75rem;
  letter-spacing: normal;
  text-transform: none;
}

/* A hint sitting under a field — the orphaned-class note, the phonotactic warning — is a
   flag on that field: red, tight to it. Outscopes the muted `.hint` further down, which
   is for the standalone footnote outside the form. */
label .hint {
  margin-top: 0;
  color: var(--c-danger);
  font-size: 0.75rem;
}

.detail {
  min-width: 0;
}

header {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  margin-bottom: var(--sp-4);
}

h2 {
  margin: 0;
  font-family: var(--font-mono);
  font-size: 1.25rem;
  overflow-wrap: anywhere;
}

.unsaved {
  color: var(--c-accent);
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  /* A form field wider than this is harder to read, not easier — the page's extra width
     goes to the lemma list and the notes box instead. */
  max-width: 64rem;
  gap: var(--sp-4);
}

label {
  display: grid;
  gap: var(--sp-1);
  color: var(--c-muted);
  font-size: 0.75rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  min-width: 0;
}

label.wide {
  grid-column: 1 / -1;
}

label input,
label textarea {
  color: var(--c-text);
  font-size: 1rem;
  letter-spacing: normal;
  text-transform: none;
}

.mono {
  font-family: var(--font-mono);
}

/* The palette sits under the field as its own block. `label > *` has already put it back
   to the UI face at 400 with normal casing, which is what the toggle and chips want. */
.palette-wrap {
  display: grid;
  gap: var(--sp-1);
  justify-items: start;
}

.palette-toggle {
  padding: 2px var(--sp-2);
  font-size: 0.75rem;
  color: var(--c-muted);
}

.palette-toggle:hover {
  color: var(--c-text);
}

textarea {
  resize: vertical;
}

.actions {
  grid-column: 1 / -1;
  display: flex;
  gap: var(--sp-2);
}

.danger-action {
  margin-left: auto;
  color: var(--c-danger);
  border-color: var(--c-danger);
}

.notice {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
  margin: 0 0 var(--sp-4);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-left: 3px solid var(--c-accent);
  border-radius: var(--radius);
  background: var(--c-raised);
  font-size: 0.875rem;
}

.notice.danger {
  border-color: var(--c-danger);
  color: var(--c-danger);
}

.error {
  margin: 0 0 var(--sp-4);
  color: var(--c-danger);
}

.hint {
  margin-top: var(--sp-6);
  color: var(--c-muted);
  font-size: 0.8125rem;
}

@media (max-width: 34rem) {
  form {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
