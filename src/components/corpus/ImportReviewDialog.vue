<script setup lang="ts">
import { computed, reactive } from "vue";

import ModalDialog from "@/components/ModalDialog.vue";
import type { CorpusImportPlan } from "@/lib/corpusImport";

/**
 * Reviewing a corpus import before any of it is written.
 *
 * The lexicon's `ImportReviewDialog` by the same idea — say what a file will actually do
 * before it does it, rather than a `window.confirm` giving only a count — with the parts
 * that logic has no use for left out. There is no key column here, so there is nothing to
 * conflict with, nothing that can be claimed twice, and nothing to delete: a file can only
 * ever add rows or repeat ones already stored. What is shown is exactly the two things
 * this format can actually tell you before writing — which rows are new, and where each
 * one would land — plus which rows are already in the corpus and so left untouched.
 *
 * Nothing here is a decision the way a lexicon conflict is. The kind shown per row is a
 * preview of what `import_corpus` will infer server-side, not a choice being made in the
 * dialog — `inferKind` and the RPC apply the same rule, so the two cannot disagree. A
 * guess that lands wrong is still one click to fix afterwards with the sub-view's own
 * → Passage / → Sentence control, same as a row typed in by hand.
 */
const props = defineProps<{
  open: boolean;
  plan: CorpusImportPlan;
  fileName: string;
  busy: boolean;
  /** A refused write. Shown here rather than behind the dialog, so it survives it. */
  error: string | null;
}>();
const emit = defineEmits<{ close: []; confirm: [] }>();

// Additions open by default — it is the section with something to check before writing.
// Skipped is an account of what is already there, and is the longest section on a
// re-import of a file mostly already stored, so it starts collapsed like the lexicon's
// "not in this file" does.
const shown = reactive<Record<string, boolean>>({ additions: true, skipped: false });
const toggle = (name: string) => (shown[name] = !shown[name]);

const passageCount = computed(
  () => props.plan.additions.filter((r) => r.kind === "passage").length,
);
const sentenceCount = computed(() => props.plan.additions.length - passageCount.value);

function submit() {
  if (props.busy || props.plan.additions.length === 0) return;
  emit("confirm");
}
</script>

<template>
  <ModalDialog :open="open" :title="`Review import — ${fileName}`" @close="emit('close')">
    <div class="review">
      <section v-if="plan.additions.length" class="block">
        <header>
          <button type="button" class="head" @click="toggle('additions')">
            <span class="caret">{{ shown.additions ? "▾" : "▸" }}</span>
            {{ plan.additions.length }} new example{{ plan.additions.length === 1 ? "" : "s" }}
          </button>
        </header>
        <p class="hint">
          The file has no kind column, so where each lands is guessed from its shape — a line break,
          or a stretch long enough to be a paragraph, opens it as a passage. Wrong guesses are one
          click to move afterwards.
        </p>
        <div v-if="shown.additions" class="rows">
          <div v-for="row in plan.additions" :key="row.line" class="line-row">
            <span class="muted">Line {{ row.line }}</span>
            <span class="pair">
              <span class="text">{{ row.english || "—" }}</span>
              <span class="text conlang">{{ row.conlang || "—" }}</span>
            </span>
            <span class="kind" :class="row.kind">
              {{ row.kind === "passage" ? "→ Passages" : "→ Sentences" }}
            </span>
          </div>
        </div>
      </section>

      <p v-else class="note">
        Every row in that file is already in the corpus, so there is nothing to add.
      </p>

      <section v-if="plan.skipped.length" class="block">
        <header>
          <button type="button" class="head" @click="toggle('skipped')">
            <span class="caret">{{ shown.skipped ? "▾" : "▸" }}</span>
            {{ plan.skipped.length }} row{{ plan.skipped.length === 1 ? "" : "s" }} already in the
            corpus
          </button>
        </header>
        <p class="hint">
          Matched only by being identical on both sides, since the file has no key column. Left
          exactly as they are.
        </p>
        <div v-if="shown.skipped" class="rows">
          <div v-for="row in plan.skipped" :key="row.line" class="line-row off">
            <span class="muted">Line {{ row.line }}</span>
            <span class="pair">
              <span class="text">{{ row.english || "—" }}</span>
              <span class="text conlang">{{ row.conlang || "—" }}</span>
            </span>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <p v-if="error" class="blocked" role="alert">{{ error }}</p>
      <p v-else class="tally">
        <span v-if="plan.additions.length">
          {{ plan.additions.length }} added
          <template v-if="passageCount && sentenceCount">
            ({{ passageCount }} as passages, {{ sentenceCount }} as sentences)
          </template>
          <template v-else-if="passageCount">(as passages)</template>
        </span>
        <span v-if="plan.skipped.length">{{ plan.skipped.length }} skipped</span>
        <span v-if="!plan.additions.length && !plan.skipped.length">nothing to write</span>
      </p>
      <button type="button" @click="emit('close')">Cancel</button>
      <button type="submit" :disabled="busy || plan.additions.length === 0" @click="submit">
        {{ busy ? "Importing…" : "Import" }}
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.review {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
  max-width: 56rem;
}

.block {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.block > header {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

/* The heading *is* the disclosure control, so the whole line is the target rather than a
   caret a few pixels wide. Content, not a control: it must not be uppercased or tracked. */
.head {
  flex: 1;
  min-width: 0;
  justify-content: flex-start;
  text-align: left;
  white-space: normal;
  font-family: var(--font-ui);
  text-transform: none;
  letter-spacing: normal;
  font-size: 0.9375rem;
  font-weight: 600;
  padding: var(--sp-1) 0;
  border-color: transparent;
  background: transparent;
}

.head:hover:not(:disabled) {
  background: transparent;
  color: var(--c-accent);
}

.caret {
  color: var(--c-faint);
  margin-right: var(--sp-2);
}

.hint,
.note {
  margin: 0;
  max-width: 44rem;
  color: var(--c-muted);
  font-size: 0.875rem;
}

.note {
  padding: var(--sp-2) var(--sp-3);
  background: var(--c-raised);
  border-radius: var(--radius);
}

.rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  max-height: 24rem;
  overflow-y: auto;
}

.line-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
}

.line-row.off {
  opacity: 0.6;
}

.muted {
  flex: none;
  color: var(--c-muted);
  font-size: 0.8125rem;
  min-width: 4rem;
}

.pair {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: var(--sp-1);
}

.text {
  font-size: 0.875rem;
  /* A passage's text can be several lines; the row grows rather than clipping it. */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.conlang {
  color: var(--c-muted);
}

.kind {
  flex: none;
  font-family: var(--font-display);
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.kind.passage {
  color: var(--c-accent);
}

.tally {
  margin: 0 auto 0 0;
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
  color: var(--c-muted);
  font-size: 0.875rem;
}

.blocked {
  margin: 0;
  color: var(--c-danger);
  font-size: 0.875rem;
}
</style>
