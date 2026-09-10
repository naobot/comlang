<script setup lang="ts">
import { computed } from "vue";

import { PHONE_BY_IPA } from "@/data/ipa";
import { usePhonemesStore } from "@/stores/phonemes";

/**
 * The project's saved phoneme inventory as a row of click-to-insert chips, for typing the
 * exact glyphs into the "Underlying phonology" field — `ɡ` not `g`, `ŋ` not `ng`, `t͡s`
 * with its tie bar. `checkLemma` tolerates the ASCII stand-ins, but the stored column is
 * meant to be the real phonemic string, and a keyboard has none of these keys.
 *
 * It reads the *saved* inventory (`phonemes.inventory`), the same rule `ClassEditor` uses:
 * a half-toggled phoneme on the inventory tab is not something to offer here. The parent
 * decides where the symbol lands (at the caret) and whether to show this at all — it is
 * hidden for read-only visitors and when the inventory is empty.
 *
 * `mousedown.prevent` keeps focus in the input so its selection survives the click; the
 * insert still fires on `click`, so keyboard activation works too (landing at the end,
 * since the input is no longer focused to report a caret).
 */
const phonemes = usePhonemesStore();
const emit = defineEmits<{ insert: [ipa: string] }>();

const consonants = computed(() => phonemes.inventory.filter((p) => p.kind !== "vowel"));
const vowels = computed(() => phonemes.inventory.filter((p) => p.kind === "vowel"));

const nameOf = (ipa: string) => PHONE_BY_IPA.get(ipa)?.name ?? ipa;
</script>

<template>
  <div class="palette" role="group" aria-label="Insert a phoneme">
    <div v-if="consonants.length" class="row">
      <button
        v-for="p in consonants"
        :key="p.ipa"
        type="button"
        class="chip"
        :title="`${p.ipa} — ${nameOf(p.ipa)}`"
        :aria-label="`Insert ${nameOf(p.ipa)}`"
        @mousedown.prevent
        @click="emit('insert', p.ipa)"
      >
        {{ p.ipa }}
      </button>
    </div>
    <div v-if="vowels.length" class="row">
      <button
        v-for="p in vowels"
        :key="p.ipa"
        type="button"
        class="chip"
        :title="`${p.ipa} — ${nameOf(p.ipa)}`"
        :aria-label="`Insert ${nameOf(p.ipa)}`"
        @mousedown.prevent
        @click="emit('insert', p.ipa)"
      >
        {{ p.ipa }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.palette {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  margin-top: var(--sp-1);
  padding: var(--sp-2);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
}

.row {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.chip {
  /* --font-mono for IPA coverage, matching the field it feeds and the IPA charts. */
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 400;
  letter-spacing: normal;
  /* Symbols, not labels: uppercasing would rewrite them (ɡ → Ɡ). */
  text-transform: none;
  line-height: 1;
  min-width: 2rem;
  padding: var(--sp-1) var(--sp-2);
  border-color: transparent;
  background: transparent;
  color: var(--c-text);
}

.chip:hover {
  background: var(--c-raised);
}
</style>
