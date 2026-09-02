<script setup lang="ts">
import { computed, ref, watch } from "vue";

import ModalDialog from "@/components/ModalDialog.vue";
import ConsonantChart from "@/components/ipa/ConsonantChart.vue";
import VowelChart from "@/components/ipa/VowelChart.vue";
import { FEATURES_BY_IPA, MANNERS, PHONE_BY_IPA } from "@/data/ipa";
import { usePhonemesStore } from "@/stores/phonemes";
import { usePhonotacticsStore } from "@/stores/phonotactics";
import type { DraftSlot } from "@/stores/phonotactics";

/**
 * Picks the exact segments one slot allows.
 *
 * The selection is held locally rather than written through to the draft on every click,
 * so Cancel is real — the store is touched once, on Done. `open` and the slot come from
 * the caller because the template editor owns which slot is being edited.
 */
const props = defineProps<{
  open: boolean;
  templateName: string;
  slotIndex: number;
  /** Named `slotDraft`, not `slot`: `slot` is still a reserved attribute in a template. */
  slotDraft: DraftSlot;
}>();
const emit = defineEmits<{ close: [] }>();

const phonemes = usePhonemesStore();
const phonotactics = usePhonotacticsStore();

const selected = ref(new Set<string>());

/** The class the slot names, which is both its label and the seed for this selection. */
const cls = computed(() =>
  phonotactics.draft.classes.find((c) => c.symbol === props.slotDraft.class_symbol),
);
const classMembers = computed(() => cls.value?.phoneme_ipa ?? []);

// The saved inventory, like the class editor's: what the language actually has is the
// only honest thing to offer, and the chart selection that has not been saved yet has
// not happened.
const available = computed(() => phonemes.inventory.map((p) => p.ipa));
const inventoryIpa = computed(() => new Set(available.value));

/** Re-seed each time it opens, so a cancelled edit leaves nothing behind. */
watch(
  () => props.open,
  (open) => {
    if (open) selected.value = new Set(props.slotDraft.phoneme_ipa ?? classMembers.value);
  },
  { immediate: true },
);

const isSelected = (ipa: string) => selected.value.has(ipa);
const isAvailable = (ipa: string) => inventoryIpa.value.has(ipa);

function toggle(ipa: string) {
  const next = new Set(selected.value);
  if (!next.delete(ipa)) next.add(ipa);
  selected.value = next;
}

function fill(predicate: (ipa: string) => boolean) {
  selected.value = new Set(available.value.filter(predicate));
}

const isVowel = (ipa: string) => PHONE_BY_IPA.get(ipa)?.kind === "vowel";
const byManner = (manner: string) => (ipa: string) => FEATURES_BY_IPA.get(ipa)?.manner === manner;

// Only manners this project has segments for; a button that fills nothing is a dead
// control. Same rule as the class editor's quick-fills.
const availableManners = computed(() =>
  MANNERS.filter((m) => available.value.some((ipa) => FEATURES_BY_IPA.get(ipa)?.manner === m)),
);

/** In the selection but no longer in the inventory — kept, struck through, not generated. */
const missing = computed(() => [...selected.value].filter((ipa) => !inventoryIpa.value.has(ipa)));

const sorted = computed(() => [...selected.value].sort());

/**
 * True when the selection is exactly the class's membership, in which case Done stores
 * `null` and the slot goes back to *following* the class rather than freezing a copy of
 * what it happens to contain right now.
 */
const matchesClass = computed(() => {
  const members = classMembers.value;
  return members.length === selected.value.size && members.every((ipa) => selected.value.has(ipa));
});

function done() {
  phonotactics.setSlotPhonemes(
    props.templateName,
    props.slotIndex,
    matchesClass.value ? null : [...selected.value],
  );
  emit("close");
}
</script>

<template>
  <ModalDialog
    :open="open"
    :title="`Phonemes for slot ${slotIndex + 1} — ${slotDraft.role}`"
    @close="emit('close')"
  >
    <p class="hint">
      The slot still belongs to class <strong>{{ slotDraft.class_symbol }}</strong
      >, which is what the notation shows and what a class constraint matches. This narrows only
      what it draws from.
    </p>

    <div class="quick">
      <button type="button" @click="fill(() => true)">All ({{ available.length }})</button>
      <button type="button" @click="selected = new Set()">None</button>
      <button type="button" :disabled="matchesClass" @click="selected = new Set(classMembers)">
        Reset to {{ slotDraft.class_symbol }}
      </button>
      <button type="button" @click="fill((i) => !isVowel(i))">All consonants</button>
      <button type="button" @click="fill(isVowel)">All vowels</button>
      <button
        v-for="manner in availableManners"
        :key="manner"
        type="button"
        @click="fill(byManner(manner))"
      >
        {{ manner }}s
      </button>
    </div>

    <p v-if="sorted.length" class="chosen">
      <span v-for="ipa in sorted" :key="ipa" :class="{ orphan: !isAvailable(ipa) }">{{ ipa }}</span>
    </p>
    <p v-else class="warn">
      Nothing selected. A slot has to allow at least one segment — pick some, or reset to
      {{ slotDraft.class_symbol }}.
    </p>

    <p v-if="missing.length" class="warn">
      {{ missing.map((ipa) => `/${ipa}/`).join(", ") }}
      {{ missing.length === 1 ? "is" : "are" }} no longer in the inventory, so
      {{ missing.length === 1 ? "it is" : "they are" }} kept here but never generated.
      <button type="button" @click="selected = new Set(sorted.filter(isAvailable))">
        Drop missing
      </button>
    </p>

    <!-- The project's inventory laid out on the real charts, rather than a flat list:
         where a segment sits is what says which natural class it is near, and that is
         most of what choosing a slot's contents is about. -->
    <ConsonantChart :is-selected="isSelected" :is-available="isAvailable" @toggle="toggle" />
    <VowelChart :is-selected="isSelected" :is-available="isAvailable" @toggle="toggle" />

    <template #footer>
      <span class="count">{{ selected.size }} selected</span>
      <button type="button" @click="emit('close')">Cancel</button>
      <button type="submit" :disabled="selected.size === 0" @click="done">Done</button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.hint {
  max-width: 44rem;
  margin: 0 0 var(--sp-3);
  color: var(--c-muted);
  font-size: 0.8125rem;
}

.quick {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-1);
  margin-bottom: var(--sp-3);
}

.chosen {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0 0 var(--sp-3);
  font-family: var(--font-mono);
  font-size: 1rem;
}

.chosen .orphan {
  color: var(--c-danger);
  text-decoration: line-through;
}

.warn {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: 0 0 var(--sp-3);
  color: var(--c-danger);
  font-size: 0.8125rem;
}

.count {
  flex: 1;
  min-width: 0;
  color: var(--c-muted);
  font-size: 0.75rem;
}
</style>
