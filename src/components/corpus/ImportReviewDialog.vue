<script setup lang="ts">
import { computed, reactive, ref } from "vue";

import ModalDialog from "@/components/ModalDialog.vue";
import {
  type Decisions,
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
} from "@/lib/corpusMerge";

/**
 * Reviewing a corpus import before any of it is written.
 *
 * The lexicon's `ImportReviewDialog` by the same idea and now, since 0028, close to the
 * same shape: English is a key exactly the way `entry_key` is, so this shows the same four
 * situations that dialog does — a conflict (the file's conlang differs from what is
 * stored), a duplicated key inside the file, a row the stored corpus doesn't carry (kept
 * unless deletion is opted into), and a row with no key at all. What differs is only that
 * a conflict here has one field to show, not four — English is the key and cannot itself
 * change without becoming a different row, so `before`/`after` is the conlang alone rather
 * than a per-field diff table.
 *
 * The kind shown on a new row is a preview of what `import_corpus` will infer for it, not
 * a choice made here — `inferKind` and the RPC apply the same rule to the same brand-new
 * rows, so the two cannot disagree. A row matched to something already stored keeps that
 * row's own kind untouched, so it carries none here.
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
// corpus on a partial import.
const shown = reactive<Record<string, boolean>>({
  duplicates: true,
  conflicts: true,
  unkeyed: true,
  additions: false,
  absent: false,
});
const toggle = (name: string) => (shown[name] = !shown[name]);

const counts = computed(() => tally(props.plan, decisions));
const blocking = computed(() => unresolved(props.plan, decisions));

function takeAll(choice: "take" | "keep") {
  for (const c of props.plan.conflicts) decisions.conflicts[c.key] = choice;
}
function allUnkeyed(choice: "add" | "skip") {
  for (const row of props.plan.unkeyed) decisions.unkeyed[row.line] = choice;
}
function allAbsent(choice: "keep" | "delete") {
  for (const entry of props.plan.absent) decisions.absent[entry.id] = choice;
}

// Deleting the whole rest of the corpus in one click is the one action here that a
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

function submit() {
  if (blocking.value.length || props.busy) return;
  emit("confirm", resolveImport(props.plan, decisions));
}
</script>

<template>
  <ModalDialog :open="open" :title="`Review import — ${fileName}`" @close="emit('close')">
    <div class="review">
      <!-- Duplicates first: it is the only section that can block, so it must not be
           something you scroll past to find out why Import is disabled. -->
      <section v-if="plan.duplicates.length" class="block">
        <header>
          <button type="button" class="head" @click="toggle('duplicates')">
            <span class="caret">{{ shown.duplicates ? "▾" : "▸" }}</span>
            {{ plan.duplicates.length }} sentence{{ plan.duplicates.length === 1 ? "" : "s" }}
            claimed more than once in this file
          </button>
        </header>
        <p class="hint">
          Two rows cannot both be the same example, and which one won would otherwise depend on
          where it sat in the file. Pick one, or skip the sentence.
        </p>
        <div v-if="shown.duplicates" class="rows">
          <div v-for="group in plan.duplicates" :key="group.key" class="card">
            <div class="card-head">
              <span class="english">{{ group.key }}</span>
              <span class="muted">{{
                group.matchesExisting ? "already in the corpus" : "new example"
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
              <span class="conlang">{{ row.conlang || "—" }}</span>
            </label>
            <label class="choice">
              <input
                type="radio"
                :name="`dup-${group.key}`"
                :checked="decideDuplicate(decisions, group.key) === 'skip'"
                @change="decisions.duplicates[group.key] = 'skip'"
              />
              <span class="line">Skip</span>
              <span class="muted">leave this sentence out of the import</span>
            </label>
          </div>
        </div>
      </section>

      <section v-if="plan.conflicts.length" class="block">
        <header>
          <button type="button" class="head" @click="toggle('conflicts')">
            <span class="caret">{{ shown.conflicts ? "▾" : "▸" }}</span>
            {{ plan.conflicts.length }} example{{ plan.conflicts.length === 1 ? "" : "s" }} differ
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
              <span class="english">{{ conflict.existing.english }}</span>
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
              <div class="cell old">{{ conflict.before || "—" }}</div>
              <div class="cell new">{{ conflict.after || "—" }}</div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="plan.unkeyed.length" class="block">
        <header>
          <button type="button" class="head" @click="toggle('unkeyed')">
            <span class="caret">{{ shown.unkeyed ? "▾" : "▸" }}</span>
            {{ plan.unkeyed.length }} row{{ plan.unkeyed.length === 1 ? "" : "s" }} with no English
          </button>
          <div class="bulk">
            <button type="button" @click="allUnkeyed('add')">Add all</button>
            <button type="button" @click="allUnkeyed('skip')">Skip all</button>
          </div>
        </header>
        <p class="hint">
          Examples are matched by English, so these cannot be matched to anything. They are added as
          new examples.
        </p>
        <div v-if="shown.unkeyed" class="rows">
          <div
            v-for="row in plan.unkeyed"
            :key="row.line"
            class="line-row"
            :class="{ off: decideUnkeyed(decisions, row.line) === 'skip' }"
          >
            <span class="muted">Line {{ row.line }}</span>
            <span class="conlang">{{ row.conlang || "—" }}</span>
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
            {{ plan.additions.length }} new example{{ plan.additions.length === 1 ? "" : "s" }}
          </button>
        </header>
        <div v-if="shown.additions" class="rows">
          <div v-for="row in plan.additions" :key="row.line" class="line-row">
            <span class="english">{{ row.english || "—" }}</span>
            <span class="conlang">{{ row.conlang || "—" }}</span>
            <span class="kind" :class="row.kind">
              {{ row.kind === "passage" ? "→ Passages" : "→ Sentences" }}
            </span>
          </div>
        </div>
      </section>

      <p v-if="plan.identical" class="note">
        {{ plan.identical }} example{{ plan.identical === 1 ? " is" : "s are" }} already identical
        to this file, and {{ plan.identical === 1 ? "is" : "are" }} left alone.
      </p>

      <section v-if="plan.absent.length" class="block">
        <header>
          <button type="button" class="head" @click="toggle('absent')">
            <span class="caret">{{ shown.absent ? "▾" : "▸" }}</span>
            {{ plan.absent.length }} example{{ plan.absent.length === 1 ? "" : "s" }} in the corpus
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
          Deleting one here removes the example from the corpus.
        </p>
        <div v-if="shown.absent" class="rows">
          <div
            v-for="entry in plan.absent"
            :key="entry.id"
            class="line-row"
            :class="{ doomed: decideAbsent(decisions, entry.id) === 'delete' }"
          >
            <span v-if="entry.english" class="english">{{ entry.english }}</span>
            <span v-else class="faint">no English</span>
            <span class="conlang">{{ entry.conlang || "—" }}</span>
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
        Decide the {{ blocking.length }} repeated sentence{{ blocking.length === 1 ? "" : "s" }}
        first.
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
  max-width: 60rem;
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
  max-height: 24rem;
  overflow-y: auto;
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

.english {
  flex: 1;
  min-width: 0;
  font-size: 0.9375rem;
  overflow-wrap: anywhere;
}

.conlang {
  flex: 1;
  min-width: 0;
  color: var(--c-muted);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
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
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  /* The gap is the rule between cells: one background behind a grid of tinted cells is
     cheaper than a border on each and never doubles up. */
  background: var(--c-border);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  overflow: hidden;
}

.cell {
  background: var(--c-surface);
  padding: var(--sp-2);
  font-size: 0.875rem;
  overflow-wrap: anywhere;
}

.cell.old {
  background: var(--c-diff-old);
}

.cell.new {
  background: var(--c-diff-new);
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
