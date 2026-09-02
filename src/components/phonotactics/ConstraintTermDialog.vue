<script setup lang="ts">
import { computed, ref, watch } from "vue";

import ModalDialog from "@/components/ModalDialog.vue";
import ConsonantChart from "@/components/ipa/ConsonantChart.vue";
import VowelChart from "@/components/ipa/VowelChart.vue";
import { usePhonemesStore } from "@/stores/phonemes";
import { usePhonotacticsStore } from "@/stores/phonotactics";
import type { DraftTerm } from "@/stores/phonotactics";

/**
 * Picks one constraint term.
 *
 * Single-select, unlike the slot dialog: a constraint term is still "a class or a
 * segment", exactly what the database's `a_is_one_thing` check allows. This changes how
 * the choice is made, not what can be said.
 */
const props = defineProps<{ open: boolean; title: string; term: DraftTerm }>();
const emit = defineEmits<{ pick: [term: DraftTerm]; close: [] }>();

const phonemes = usePhonemesStore();
const phonotactics = usePhonotacticsStore();

const chosen = ref<DraftTerm>({ class_symbol: null, phoneme_ipa: null });

watch(
  () => props.open,
  (open) => {
    if (open) chosen.value = { ...props.term };
  },
  { immediate: true },
);

const inventoryIpa = computed(() => new Set(phonemes.inventory.map((p) => p.ipa)));
const isAvailable = (ipa: string) => inventoryIpa.value.has(ipa);
const isSelected = (ipa: string) => chosen.value.phoneme_ipa === ipa;

function pickClass(symbol: string) {
  chosen.value = { class_symbol: symbol, phoneme_ipa: null };
}

/** Clicking the chosen segment again clears it, so the dialog can be emptied. */
function pickPhoneme(ipa: string) {
  chosen.value =
    chosen.value.phoneme_ipa === ipa
      ? { class_symbol: null, phoneme_ipa: null }
      : { class_symbol: null, phoneme_ipa: ipa };
}

const empty = computed(() => !chosen.value.class_symbol && !chosen.value.phoneme_ipa);

function done() {
  emit("pick", { ...chosen.value });
  emit("close");
}
</script>

<template>
  <ModalDialog :open="open" :title="title" @close="emit('close')">
    <p class="hint">A class, or one segment. Choosing either clears the other.</p>

    <div v-if="phonotactics.draft.classes.length" class="quick">
      <button
        v-for="cls in phonotactics.draft.classes"
        :key="cls.symbol"
        type="button"
        class="cls"
        :class="{ on: chosen.class_symbol === cls.symbol }"
        :aria-pressed="chosen.class_symbol === cls.symbol"
        @click="pickClass(cls.symbol)"
      >
        {{ cls.symbol }}
        <span class="members">{{ cls.phoneme_ipa.length }}</span>
      </button>
    </div>
    <p v-else class="hint">No classes defined yet — pick a segment below.</p>

    <ConsonantChart :is-selected="isSelected" :is-available="isAvailable" @toggle="pickPhoneme" />
    <VowelChart :is-selected="isSelected" :is-available="isAvailable" @toggle="pickPhoneme" />

    <template #footer>
      <span class="count">
        {{ chosen.class_symbol ?? (chosen.phoneme_ipa ? `/${chosen.phoneme_ipa}/` : "nothing") }}
        selected
      </span>
      <button type="button" @click="emit('close')">Cancel</button>
      <button type="submit" :disabled="empty" @click="done">Done</button>
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
  margin-bottom: var(--sp-4);
}

.cls {
  gap: var(--sp-2);
}

.cls.on {
  background: var(--c-accent);
  color: var(--c-accent-text);
  border-color: var(--c-accent);
}

.members {
  font-weight: 400;
  letter-spacing: normal;
  opacity: 0.7;
}

.count {
  flex: 1;
  min-width: 0;
  color: var(--c-muted);
  font-size: 0.75rem;
}
</style>
