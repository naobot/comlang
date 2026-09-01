<script setup lang="ts">
import { useEventListener } from "@vueuse/core";
import { computed } from "vue";
import { onBeforeRouteLeave } from "vue-router";

import ConsonantChart from "@/components/ipa/ConsonantChart.vue";
import VowelChart from "@/components/ipa/VowelChart.vue";
import { impactOfRemoving } from "@/lib/phonotactics";
import { usePhonemesStore } from "@/stores/phonemes";
import { usePhonotacticsStore } from "@/stores/phonotactics";

const props = defineProps<{ projectId: string }>();

const phonemes = usePhonemesStore();
const phonotactics = usePhonotacticsStore();

// Passed down rather than letting each chart reach for the store, so the charts stay
// pure reference renderers and can be reused wherever a phone picker is needed.
const isSelected = (ipa: string) => phonemes.has(ipa);

const summary = computed(() => {
  const c = phonemes.consonants.length;
  const v = phonemes.vowels.length;
  return `${c} consonant${c === 1 ? "" : "s"}, ${v} vowel${v === 1 ? "" : "s"}`;
});

/**
 * What this save would take with it.
 *
 * Removing a phoneme cascades into the phonotactics, and the worst of it is invisible:
 * `phonotactic_constraints` rows naming the segment are **deleted outright**, so a rule
 * like "ŋ cannot be an onset" just disappears. Measured against what is *saved* in the
 * phonotactics, not its draft — the saved rows are what the database will actually drop.
 */
const removing = computed(
  () => new Set(phonemes.inventory.map((p) => p.ipa).filter((ipa) => !phonemes.has(ipa))),
);

const impact = computed(() => impactOfRemoving(phonotactics.persisted, removing.value));

const destructive = computed(
  () =>
    impact.value.classes.length > 0 ||
    impact.value.constraints.length > 0 ||
    impact.value.templates.length > 0,
);

function describeConstraint(c: (typeof impact.value.constraints)[number]) {
  const term = (cls: string | null, ipa: string | null) => cls ?? (ipa ? `/${ipa}/` : "?");
  if (c.kind === "forbid_in_role") {
    return `${term(c.a_class_symbol, c.a_phoneme_ipa)} cannot be a ${c.role}`;
  }
  return `${term(c.a_class_symbol, c.a_phoneme_ipa)}${term(c.b_class_symbol, c.b_phoneme_ipa)} not allowed`;
}

async function save() {
  // The panel above the button already spells this out, but the button is sticky and
  // the panel is not, so a long chart can put them on different screens.
  if (destructive.value) {
    const bits = [
      impact.value.constraints.length
        ? `delete ${impact.value.constraints.length} phonotactic rule${impact.value.constraints.length === 1 ? "" : "s"}`
        : null,
      impact.value.classes.length
        ? `change ${impact.value.classes.length} phoneme class${impact.value.classes.length === 1 ? "" : "es"}`
        : null,
    ].filter(Boolean);
    if (!window.confirm(`This will also ${bits.join(" and ")}. Continue?`)) return;
  }
  await phonemes.save(props.projectId);
  // The cascade already happened in the database; re-read so the phonotactics page is
  // not still showing rules that no longer exist.
  if (destructive.value) await phonotactics.fetchFor(props.projectId);
}

// This page saves explicitly, so losing a draft to a stray click is a real hazard —
// more so than on an autosaving page, not less.
onBeforeRouteLeave(() => {
  if (!phonemes.dirty) return true;
  return window.confirm("You have unsaved changes to the inventory. Leave anyway?");
});

useEventListener(window, "beforeunload", (event: BeforeUnloadEvent) => {
  if (!phonemes.dirty) return;
  event.preventDefault();
});
</script>

<template>
  <section>
    <header>
      <div>
        <h1>Phoneme inventory</h1>
        <p class="muted">
          Toggle the segments this language uses. Everything downstream — phonotactics, the lexicon,
          grammar rules — is built from what you pick here.
        </p>
      </div>
    </header>

    <!-- Realtime notifies but never patches: applying a collaborator's change to the
         draft would rewrite an edit in progress, then save it back as if it were the
         user's own choice. -->
    <p v-if="phonemes.changedElsewhere" class="notice" role="status">
      Someone else changed this inventory. Your draft is untouched.
      <button type="button" @click="phonemes.fetchFor(projectId)">Load their version</button>
    </p>

    <p v-if="phonemes.error" class="error" role="alert">{{ phonemes.error }}</p>

    <!-- Deliberately above the action bar rather than inside it: the specifics matter
         more than the summary, and they do not fit on one sticky line. -->
    <div v-if="destructive" class="impact" role="alert">
      <p class="impact-head">Removing these will change the phonotactics.</p>
      <ul>
        <li v-if="impact.constraints.length">
          <strong
            >{{ impact.constraints.length }} rule{{
              impact.constraints.length === 1 ? "" : "s"
            }}
            deleted:</strong
          >
          <span v-for="(c, i) in impact.constraints" :key="i" class="rule">
            {{ describeConstraint(c) }}
          </span>
        </li>
        <li v-for="cls in impact.classes" :key="cls.symbol">
          class <code>{{ cls.symbol }}</code> loses
          <span v-for="ipa in cls.ipa" :key="ipa" class="rule">{{ ipa }}</span>
          <em v-if="impact.emptied.includes(cls.symbol)"> — leaving it empty</em>
        </li>
        <li v-if="impact.templates.length">
          <strong>
            template{{ impact.templates.length === 1 ? "" : "s" }}
            {{ impact.templates.join(", ") }}
          </strong>
          would stop generating: a required slot's class would be empty.
        </li>
      </ul>
    </div>

    <div class="bar">
      <span class="muted">{{ summary }}<em v-if="phonemes.dirty"> · unsaved changes</em></span>
      <div class="actions">
        <button
          type="button"
          :disabled="!phonemes.dirty || phonemes.saving"
          @click="phonemes.discard()"
        >
          Discard
        </button>
        <button type="submit" :disabled="!phonemes.dirty || phonemes.saving" @click="save">
          {{ phonemes.saving ? "Saving…" : "Save" }}
        </button>
      </div>
    </div>

    <ConsonantChart :is-selected="isSelected" @toggle="phonemes.toggle" />
    <VowelChart :is-selected="isSelected" @toggle="phonemes.toggle" />
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

/* Sticks below the app header so Save is reachable from anywhere in a long chart. */
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
  border-left-width: 3px;
  border-radius: var(--radius);
  font-size: 0.875rem;
}

.impact-head {
  margin: 0 0 var(--sp-2);
  color: var(--c-danger);
  font-weight: 600;
}

.impact ul {
  margin: 0;
  padding-left: var(--sp-4);
  display: grid;
  gap: var(--sp-1);
}

.impact code,
.impact .rule {
  font-family: var(--font-mono);
  padding: 0 var(--sp-1);
  border-radius: 3px;
  background: var(--c-raised);
}

.impact em {
  font-style: normal;
  color: var(--c-danger);
}

.muted {
  color: var(--c-muted);
  font-size: 0.875rem;
}

.error {
  color: var(--c-danger);
}
</style>
