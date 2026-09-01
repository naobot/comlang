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

.phone.on {
  background: var(--c-accent);
  color: var(--c-accent-text);
  font-weight: 600;
}

/* Lighter than the resting fill, not darker — hover should lift a selected symbol
   rather than push it toward black. */
.phone.on:hover:not(:disabled) {
  background: var(--c-accent-soft);
  color: var(--c-accent-text);
}
</style>
