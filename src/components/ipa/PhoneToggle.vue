<script setup lang="ts">
import type { Phone } from "@/data/ipa";

defineProps<{ phone: Phone; selected: boolean }>();
defineEmits<{ toggle: [ipa: string] }>();
</script>

<template>
  <button
    type="button"
    class="phone"
    :class="{ on: selected }"
    :aria-pressed="selected"
    :aria-label="phone.name"
    :title="`${phone.ipa} — ${phone.name}`"
    @click="$emit('toggle', phone.ipa)"
  >
    {{ phone.ipa }}
  </button>
</template>

<style scoped>
.phone {
  /* --font-mono is the stack chosen for IPA coverage; the UI stack drops glyphs. */
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 400;
  letter-spacing: normal;
  /* These are symbols, not labels: uppercasing would rewrite them (ɡ becomes Ɡ). */
  text-transform: none;
  line-height: 1;
  min-width: 2rem;
  padding: var(--sp-2) var(--sp-1);
  border-color: transparent;
  background: transparent;
  /* Unselected symbols recede: most of the chart is not in any given language, and at
     full contrast the few that are get lost in it. */
  color: var(--c-faint);
}

.phone:hover:not(:disabled) {
  background: var(--c-raised);
  color: var(--c-text);
}

/* Selection reads as weight and contrast, not as a fill: the chart is dense, and a
   grid of filled cells competes with the symbols it is meant to be showing. */
.phone.on {
  background: transparent;
  color: var(--c-text);
  font-weight: 700;
}

.phone.on:hover:not(:disabled) {
  background: var(--c-raised);
}
</style>
