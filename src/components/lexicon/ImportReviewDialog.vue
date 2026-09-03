<script setup lang="ts">
import { computed, reactive, ref } from "vue";

import ModalDialog from "@/components/ModalDialog.vue";
import type { ImportField } from "@/lib/lexiconImport";
import {
  type Decisions,
  FIELD_LABEL,
  type MergePlan,
  type ResolvedImport,
  decideAbsent,
  decideConflict,
  decideDuplicate,
  decideUnkeyed,
  emptyDecisions,
  resolveImport,
  tally,
  unresolved,
} from "@/lib/lexiconMerge";

/**
 * Reviewing an import before any of it is written.
 *
 * This replaced a `window.confirm` that said "This will add 12 and update 30 entries" and
 * nothing else — which is a count, not a description: it could not say *which* thirty, nor
 * that one of them was about to have its lemma replaced. Three things are shown here that
 * the confirm could not show at all, and each is a decision rather than a notice:
 *
 * - a **conflict**, where the file and the lexicon hold the same key with different
 *   content, laid out as a diff and defaulting to the imported version;
 * - a key claimed **twice inside the file**, which used to refuse the whole file — the
 *   good rows with it — and is now a question with an answer;
 * - stored entries the file **does not carry**, which may be deleted, but only one tick at
 *   a time and never by default.
 *
 * Every default lives in `lexiconMerge.ts`, not here, so there is one place for them.
 * Nothing is written until `confirm` fires.
 */
const props = defineProps<{
  open: boolean;
  plan: MergePlan;
  fileName: string;
  busy: boolean;
  /** A refused write. Shown here rather than behind the dialog, so the choices survive it. */
  error: string | null;
}>();
const emit = defineEmits<{ close: []; confirm: [ResolvedImport] }>();

const decisions = reactive<Decisions>(emptyDecisions());

// Collapsed by default where the section is an account of what happened rather than a
// decision, and where it is the longest: "not in this file" is the whole rest of the
// lexicon on a partial import.
const shown = reactive<Record<string, boolean>>({
  conflicts: true,
  duplicates: true,
  unkeyed: true,
  additions: false,
  absent: false,
});
const toggle = (name: string) => (shown[name] = !shown[name]);

const counts = computed(() => tally(props.plan, decisions));
const blocking = computed(() => unresolved(props.plan, decisions));

/** The one field-set warning the old confirm did carry, kept: absent columns are not writes. */
const partialColumns = computed(() => !props.plan.fields.includes("gloss"));

function takeAll(choice: "take" | "keep") {
  for (const c of props.plan.conflicts) decisions.conflicts[c.key] = choice;
}
function allUnkeyed(choice: "add" | "skip") {
  for (const row of props.plan.unkeyed) decisions.unkeyed[row.line] = choice;
}
function allAbsent(choice: "keep" | "delete") {
  for (const entry of props.plan.absent) decisions.absent[entry.id] = choice;
}

// Deleting the whole rest of the lexicon in one click is the one action here that a
// mis-aimed pointer should not be able to complete, so it asks a second time.
const confirmingDeleteAll = ref(false);
function deleteAll() {
  if (!confirmingDeleteAll.value) {
    confirmingDeleteAll.value = true;
    return;
  }
  confirmingDeleteAll.value = false;
  allAbsent("delete");
}

const empty = (value: string) => value.length === 0;

function submit() {
  if (blocking.value.length || props.busy) return;
  emit("confirm", resolveImport(props.plan, decisions));
}

const fieldsOf = (fields: ImportField[]) => fields.map((f) => FIELD_LABEL[f]).join(", ");
</script>

<template>
  <ModalDialog :open="open" :title="`Review import — ${fileName}`" @close="emit('close')">
    <div class="review">
      <p v-if="partialColumns" class="note">
        This file carries only {{ fieldsOf(plan.fields).toLowerCase() }}. Meanings, word classes and
        notes on existing entries are left exactly as they are.
      </p>

      <!-- Duplicates first: it is the only section that can block, so it must not be
           something you scroll past to find out why Import is disabled. -->
      <section v-if="plan.duplicates.length" class="block">
        <header>
          <button type="button" class="head" @click="toggle('duplicates')">
            <span class="caret">{{ shown.duplicates ? "▾" : "▸" }}</span>
            {{ plan.duplicates.length }} key{{ plan.duplicates.length === 1 ? "" : "s" }} claimed
            more than once in this file
          </button>
        </header>
        <p class="hint">
          Two rows cannot both be the same entry, and which one won would otherwise depend on where
          it sat in the file. Pick one, or skip the key.
        </p>
        <div v-if="shown.duplicates" class="rows">
          <div v-for="group in plan.duplicates" :key="group.key" class="card">
            <div class="card-head">
              <code>{{ group.key }}</code>
              <span class="muted">{{
                group.matchesExisting ? "already in the lexicon" : "new entry"
              }}</span>
            </div>
            <label v-for="row in group.candidates" :key="row.line" class="choice">
              <input
                type="radio"
                :name="`dup-${group.key}`"
                :checked="decideDuplicate(decisions, group.key) === row.line"
                @change="decisions.duplicates[group.key] = row.line"
              />
              <span class="line">Line {{ row.line }}</span>
              <span class="lemma">{{ row.lemma }}</span>
              <span class="muted">{{ row.gloss || "—" }}</span>
            </label>
            <label class="choice">
              <input
                type="radio"
                :name="`dup-${group.key}`"
                :checked="decideDuplicate(decisions, group.key) === 'skip'"
                @change="decisions.duplicates[group.key] = 'skip'"
              />
              <span class="line">Skip</span>
              <span class="muted">leave this key out of the import</span>
            </label>
          </div>
        </div>
      </section>

      <section v-if="plan.conflicts.length" class="block">
        <header>
          <button type="button" class="head" @click="toggle('conflicts')">
            <span class="caret">{{ shown.conflicts ? "▾" : "▸" }}</span>
            {{ plan.conflicts.length }} entr{{ plan.conflicts.length === 1 ? "y" : "ies" }} differ
            from what is stored
          </button>
          <div class="bulk">
            <button type="button" @click="takeAll('keep')">Keep all stored</button>
            <button type="button" @click="takeAll('take')">Take all imported</button>
          </div>
        </header>
        <div v-if="shown.conflicts" class="rows">
          <div
            v-for="conflict in plan.conflicts"
            :key="conflict.key"
            class="card"
            :class="{ kept: decideConflict(decisions, conflict.key) === 'keep' }"
          >
            <div class="card-head">
              <span class="lemma">{{ conflict.existing.lemma }}</span>
              <code>{{ conflict.key }}</code>
              <span class="muted">line {{ conflict.line }}</span>
              <div class="pick">
                <button
                  type="button"
                  :class="{ on: decideConflict(decisions, conflict.key) === 'keep' }"
                  @click="decisions.conflicts[conflict.key] = 'keep'"
                >
                  Keep stored
                </button>
                <button
                  type="button"
                  :class="{ on: decideConflict(decisions, conflict.key) === 'take' }"
                  @click="decisions.conflicts[conflict.key] = 'take'"
                >
                  Take imported
                </button>
              </div>
            </div>
            <div class="diff">
              <div class="diff-head">Field</div>
              <div class="diff-head">In the lexicon</div>
              <div class="diff-head">In this file</div>
              <template v-for="d in conflict.diffs" :key="d.field">
                <div class="field" :class="{ same: !d.changed }">{{ FIELD_LABEL[d.field] }}</div>
                <div class="cell old" :class="{ same: !d.changed }">
                  <span v-if="empty(d.before)" class="faint">empty</span>
                  <template v-else>{{ d.before }}</template>
                </div>
                <div class="cell new" :class="{ same: !d.changed }">
                  <span v-if="empty(d.after)" class="faint">empty</span>
                  <template v-else>{{ d.after }}</template>
                </div>
              </template>
            </div>
          </div>
        </div>
      </section>

      <section v-if="plan.unkeyed.length" class="block">
        <header>
          <button type="button" class="head" @click="toggle('unkeyed')">
            <span class="caret">{{ shown.unkeyed ? "▾" : "▸" }}</span>
            {{ plan.unkeyed.length }} row{{ plan.unkeyed.length === 1 ? "" : "s" }} with no key
          </button>
          <div class="bulk">
            <button type="button" @click="allUnkeyed('add')">Add all</button>
            <button type="button" @click="allUnkeyed('skip')">Skip all</button>
          </div>
        </header>
        <p class="hint">
          Entries are matched by key, so these cannot be matched to anything. They are added as new
          entries.
        </p>
        <div v-if="shown.unkeyed" class="rows">
          <div
            v-for="row in plan.unkeyed"
            :key="row.line"
            class="line-row"
            :class="{ off: decideUnkeyed(decisions, row.line) === 'skip' }"
          >
            <span class="muted">Line {{ row.line }}</span>
            <span class="lemma">{{ row.lemma }}</span>
            <span class="muted">{{ row.gloss || "—" }}</span>
            <div class="pick">
              <button
                type="button"
                :class="{ on: decideUnkeyed(decisions, row.line) === 'add' }"
                @click="decisions.unkeyed[row.line] = 'add'"
              >
                Add
              </button>
              <button
                type="button"
                :class="{ on: decideUnkeyed(decisions, row.line) === 'skip' }"
                @click="decisions.unkeyed[row.line] = 'skip'"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      </section>

      <section v-if="plan.additions.length" class="block">
        <header>
          <button type="button" class="head" @click="toggle('additions')">
            <span class="caret">{{ shown.additions ? "▾" : "▸" }}</span>
            {{ plan.additions.length }} new entr{{ plan.additions.length === 1 ? "y" : "ies" }}
          </button>
        </header>
        <div v-if="shown.additions" class="rows">
          <div v-for="row in plan.additions" :key="row.line" class="line-row">
            <code>{{ row.entry_key }}</code>
            <span class="lemma">{{ row.lemma }}</span>
            <span class="muted">{{ row.gloss || "—" }}</span>
          </div>
        </div>
      </section>

      <p v-if="plan.identical" class="note">
        {{ plan.identical }} entr{{ plan.identical === 1 ? "y is" : "ies are" }} already identical
        to this file, and {{ plan.identical === 1 ? "is" : "are" }} left alone.
      </p>

      <section v-if="plan.absent.length" class="block">
        <header>
          <button type="button" class="head" @click="toggle('absent')">
            <span class="caret">{{ shown.absent ? "▾" : "▸" }}</span>
            {{ plan.absent.length }} entr{{ plan.absent.length === 1 ? "y" : "ies" }} in the lexicon
            {{ plan.absent.length === 1 ? "is" : "are" }} not in this file
          </button>
          <div class="bulk">
            <button type="button" @click="allAbsent('keep')">Keep all</button>
            <button type="button" class="danger" @click="deleteAll">
              {{ confirmingDeleteAll ? "Really delete all?" : "Delete all" }}
            </button>
          </div>
        </header>
        <p class="hint">
          A partial file is a normal thing to import, so these are kept unless you say otherwise.
          Deleting one here removes the entry from the lexicon.
        </p>
        <div v-if="shown.absent" class="rows">
          <div
            v-for="entry in plan.absent"
            :key="entry.id"
            class="line-row"
            :class="{ doomed: decideAbsent(decisions, entry.id) === 'delete' }"
          >
            <code v-if="entry.entry_key">{{ entry.entry_key }}</code>
            <span v-else class="faint">no key</span>
            <span class="lemma">{{ entry.lemma }}</span>
            <span class="muted">{{ entry.gloss || "—" }}</span>
            <div class="pick">
              <button
                type="button"
                :class="{ on: decideAbsent(decisions, entry.id) === 'keep' }"
                @click="decisions.absent[entry.id] = 'keep'"
              >
                Keep
              </button>
              <button
                type="button"
                :class="{ on: decideAbsent(decisions, entry.id) === 'delete' }"
                @click="decisions.absent[entry.id] = 'delete'"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <p v-if="error" class="blocked" role="alert">{{ error }}</p>
      <p v-else class="tally">
        <span v-if="counts.created">{{ counts.created }} added</span>
        <span v-if="counts.updated">{{ counts.updated }} updated</span>
        <span v-if="counts.unchanged">{{ counts.unchanged }} unchanged</span>
        <span v-if="counts.deleted" class="danger">{{ counts.deleted }} deleted</span>
        <span v-if="!counts.created && !counts.updated && !counts.deleted"> nothing to write </span>
      </p>
      <p v-if="blocking.length" class="blocked">
        Decide the {{ blocking.length }} repeated key{{ blocking.length === 1 ? "" : "s" }} first.
      </p>
      <button type="button" @click="emit('close')">Cancel</button>
      <button
        type="submit"
        :disabled="
          busy || blocking.length > 0 || (!counts.created && !counts.updated && !counts.deleted)
        "
        @click="submit"
      >
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
  max-width: 64rem;
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

.bulk {
  display: flex;
  gap: var(--sp-2);
  flex: none;
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
}

.card {
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

/* A row whose stored version is being kept is not an error, so it recedes rather than
   colouring: the import simply does not touch it. */
.card.kept .diff,
.line-row.off > :not(.pick) {
  opacity: 0.5;
}

.card-head,
.line-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.line-row {
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
}

.line-row.doomed {
  border-color: var(--c-danger);
}

.lemma {
  font-family: var(--font-mono);
  font-size: 0.9375rem;
}

code {
  font-family: var(--font-mono);
  font-size: 0.8125rem;
  color: var(--c-muted);
}

.muted {
  color: var(--c-muted);
  font-size: 0.875rem;
  min-width: 0;
}

.faint {
  color: var(--c-faint);
  font-size: 0.875rem;
  font-style: italic;
}

.pick {
  margin-left: auto;
  display: flex;
  gap: var(--sp-1);
  flex: none;
}

/* The chosen half of a pair, not a submit: `on` rather than `type="submit"`, which would
   also submit the dialog's own form. */
.pick .on {
  background: var(--c-accent);
  color: var(--c-accent-text);
  border-color: transparent;
}

.pick .on:hover:not(:disabled) {
  background: var(--c-text);
}

.danger {
  color: var(--c-danger);
  border-color: var(--c-danger);
}

.diff {
  display: grid;
  grid-template-columns: minmax(6rem, auto) 1fr 1fr;
  gap: 1px;
  /* The gap is the rule between cells: one background behind a grid of tinted cells is
     cheaper than a border on each and never doubles up. */
  background: var(--c-border);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  overflow: hidden;
}

.diff-head,
.field,
.cell {
  background: var(--c-surface);
  padding: var(--sp-1) var(--sp-2);
  font-size: 0.875rem;
  /* A gloss can be a sentence and a lemma can be long; wrapping beats a horizontal
     scrollbar inside a card inside a dialog. */
  overflow-wrap: anywhere;
}

.diff-head {
  font-family: var(--font-display);
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.field {
  color: var(--c-muted);
}

.cell.old {
  background: var(--c-diff-old);
}

.cell.new {
  background: var(--c-diff-new);
}

/* An unchanged field is context, not a change: it keeps the surface and recedes. */
.cell.same,
.field.same {
  background: var(--c-surface);
  color: var(--c-muted);
}

.choice {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.choice input {
  width: auto;
  flex: none;
}

.line {
  font-size: 0.875rem;
  font-weight: 600;
  min-width: 5rem;
}

.tally {
  margin: 0 auto 0 0;
  display: flex;
  gap: var(--sp-3);
  flex-wrap: wrap;
  color: var(--c-muted);
  font-size: 0.875rem;
}

.tally .danger {
  color: var(--c-danger);
  font-weight: 600;
  border: 0;
}

.blocked {
  margin: 0;
  color: var(--c-danger);
  font-size: 0.875rem;
}
</style>
