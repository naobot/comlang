<script setup lang="ts">
import { computed } from "vue";

import { type CorpusDraft, useCorpusStore } from "@/stores/corpus";
import type { CorpusEntry } from "@/types/models";

/**
 * The long-form half of the corpus: conversations, paragraphs, stories.
 *
 * Not the grid with taller cells. A passage is one text, and a row in a table says the
 * opposite — it says the unit is the line, which is exactly the habit that turns a corpus
 * into a second lexicon. So a passage is a card: two panes side by side, both as tall as
 * the longer of them, with room already made before anything is typed.
 *
 * The two sides are two blocks of text and are *not* aligned line by line. Aligning them
 * would need a third representation (line pairs) and a rule for what happens when one side
 * has more lines than the other, which is a real design question and not one this round
 * answers. Blank lines and speaker labels are preserved exactly as typed, which is enough
 * to lay a conversation out by hand.
 */
const props = defineProps<{ projectId: string; query: string }>();

const corpus = useCorpusStore();

// The store does the filtering, so this list and the count in the toolbar above it are
// answering the same question.
const matches = computed(() => corpus.matching("passage", props.query));

/** Same invariant the grid relies on: every stored row has a draft. See the store. */
const rows = computed(() =>
  matches.value
    .map((entry) => ({ entry, draft: corpus.drafts.get(entry.id) }))
    .filter((r): r is { entry: CorpusEntry; draft: CorpusDraft } => r.draft !== undefined),
);

/** Enough to see at a glance that a passage really is one — and how it is growing. */
function shape(draft: CorpusDraft) {
  const text = draft.english.trim() || draft.conlang.trim();
  if (!text) return "empty";
  const lines = text.split("\n").filter((l) => l.trim()).length;
  const words = text.split(/\s+/).filter(Boolean).length;
  return `${lines} ${lines === 1 ? "line" : "lines"}, ${words} ${words === 1 ? "word" : "words"}`;
}

function firstLine(entry: CorpusEntry) {
  const text = entry.english.trim() || entry.conlang.trim();
  const line = text.split("\n")[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 60)}…` : line;
}

function confirmDelete(entry: CorpusEntry) {
  if (!window.confirm(`Delete the passage beginning “${firstLine(entry)}”?`)) return;
  void corpus.remove(entry.id);
}
</script>

<template>
  <div class="scroller">
    <ol class="passages">
      <!-- The unsaved new passage. Local rather than an inserted blank, for the reason the
           grid's new row is: the table refuses a row empty on both sides. -->
      <li v-if="corpus.pending && corpus.pending.kind === 'passage'" class="card new">
        <div class="head">
          <span class="label">New passage</span>
          <span class="shape">{{ shape(corpus.pending) }}</span>
          <div class="actions">
            <button
              type="button"
              class="primary"
              :disabled="corpus.savingNew"
              @click="corpus.saveNew(projectId)"
            >
              {{ corpus.savingNew ? "Saving…" : "Save" }}
            </button>
            <button type="button" @click="corpus.cancelNew()">Cancel</button>
          </div>
        </div>
        <div class="panes">
          <label class="pane">
            <span class="pane-label">English</span>
            <textarea
              v-model="corpus.pending.english"
              placeholder="Paste or type a conversation, a paragraph, a story. Line breaks are kept."
              aria-label="English, new passage"
            />
          </label>
          <label class="pane">
            <span class="pane-label">Conlang</span>
            <textarea
              v-model="corpus.pending.conlang"
              class="conlang"
              placeholder="The same text in the language."
              aria-label="Conlang, new passage"
            />
          </label>
        </div>
      </li>

      <li v-for="({ entry, draft }, i) in rows" :key="entry.id" class="card">
        <div class="head">
          <span class="label">{{ i + 1 }}. {{ firstLine(entry) || "untitled" }}</span>
          <span class="shape">{{ shape(draft) }}</span>
          <div class="actions">
            <template v-if="corpus.isDirty(entry.id)">
              <button
                type="button"
                class="primary"
                :disabled="corpus.savingIds.has(entry.id)"
                @click="corpus.saveRow(entry.id)"
              >
                {{ corpus.savingIds.has(entry.id) ? "Saving…" : "Save" }}
              </button>
              <button type="button" @click="corpus.revert(entry.id)">Revert</button>
            </template>
            <template v-else>
              <!-- Takes effect at once: it changes where the example is edited, not what
                   it says. The mirror of the grid's "→ Passage". -->
              <button
                type="button"
                title="Edit this in the sentence grid instead"
                @click="corpus.setKind(entry.id, 'utterance')"
              >
                → Sentence
              </button>
              <button type="button" class="danger-action" @click="confirmDelete(entry)">
                Delete
              </button>
            </template>
          </div>
        </div>

        <p v-if="corpus.incoming.has(entry.id)" class="held">
          Changed by someone else while you were editing.
          <button type="button" class="link" @click="corpus.acceptIncoming(entry.id)">
            Use theirs
          </button>
        </p>

        <div class="panes">
          <label class="pane">
            <span class="pane-label">English</span>
            <textarea
              v-model="draft.english"
              :aria-label="`English, passage ${i + 1}`"
              @keydown.enter.meta.prevent="corpus.saveRow(entry.id)"
              @keydown.enter.ctrl.prevent="corpus.saveRow(entry.id)"
            />
          </label>
          <label class="pane">
            <span class="pane-label">Conlang</span>
            <textarea
              v-model="draft.conlang"
              class="conlang"
              :aria-label="`Conlang, passage ${i + 1}`"
              @keydown.enter.meta.prevent="corpus.saveRow(entry.id)"
              @keydown.enter.ctrl.prevent="corpus.saveRow(entry.id)"
            />
          </label>
        </div>
      </li>
    </ol>

    <p v-if="rows.length === 0 && !corpus.pending" class="empty muted">
      <template v-if="query.trim()">Nothing matches “{{ query.trim() }}”.</template>
      <template v-else>
        Nothing long-form yet. A conversation, a paragraph of narration, a song — anything with more
        than one sentence in it. This is the half of the corpus that shows how the language behaves
        across a stretch of speech, which single sentences never quite do.
      </template>
    </p>
  </div>
</template>

<style scoped>
/* The one scrolling region, as in the grid: min-height: 0 or a flex child refuses to
   shrink below its content and the overflow reappears on the page. */
.scroller {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.passages {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--sp-4);
  /* Wide, but not the full 2400px: two columns of prose stop being readable well before
     that, and the page's own cap is for charts, not paragraphs. */
  max-width: 100rem;
}

.card {
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: var(--sp-3);
}

.new {
  background: var(--c-raised);
}

.head {
  display: flex;
  align-items: baseline;
  gap: var(--sp-3);
  margin-bottom: var(--sp-3);
}

/* The first line stands in for a title. The corpus has no title column and is not getting
   one — every extra field is another thing to fill in before you may write. */
.label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
  font-size: 0.9375rem;
}

.shape {
  flex: none;
  color: var(--c-faint);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
}

.actions {
  flex: none;
  display: flex;
  gap: var(--sp-2);
}

/* Mirrors the global `button[type="submit"]`: these are buttons in a card, not a form's
   submit, so the styling is by class. */
.primary {
  background: var(--c-accent);
  color: var(--c-accent-text);
  border-color: transparent;
}

.primary:hover:not(:disabled) {
  background: var(--c-text);
}

.danger-action {
  color: var(--c-danger);
  border-color: var(--c-danger);
}

.panes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--sp-3);
  align-items: stretch;
}

.pane {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  min-width: 0;
}

.pane-label {
  color: var(--c-muted);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.07em;
  text-transform: uppercase;
}

/**
 * Tall before anything is in it, and resizable.
 *
 * The grid's auto-growing cell is deliberately not reused here: a passage is written into
 * an empty box, and a box that starts one line high and grows says "one line goes here".
 * The point of this view is that the room is already there.
 */
.pane textarea {
  flex: 1;
  min-height: 11rem;
  resize: vertical;
  font-size: 0.9375rem;
  line-height: 1.6;
  /* Line breaks are content here — a speaker turn, a stanza — so wrapping must not be the
     only thing separating them visually. */
  white-space: pre-wrap;
}

.conlang {
  font-family: var(--font-mono);
}

.held {
  margin: 0 0 var(--sp-3);
  color: var(--c-muted);
  font-size: 0.75rem;
}

.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-accent);
  text-decoration: underline;
  text-transform: none;
  letter-spacing: normal;
  font-size: inherit;
}

.empty {
  max-width: 44rem;
  padding: var(--sp-6) 0;
  font-size: 0.875rem;
}

.muted {
  color: var(--c-muted);
}

/* Side by side stops helping once each pane is narrower than a sensible line length. */
@media (max-width: 60rem) {
  .panes {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
