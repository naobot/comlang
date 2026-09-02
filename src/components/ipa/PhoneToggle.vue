<script setup lang="ts">
import type { Phone } from "@/data/ipa";

/**
 * `readOnly` renders the symbol as a plain, unclickable chip. It is what a published
 * conlang's visitor sees: the chart is still the clearest way to read an inventory, and
 * only the toggling goes away.
 */
defineProps<{ phone: Phone; selected: boolean; readOnly?: boolean }>();
defineEmits<{ toggle: [ipa: string] }>();
</script>

<template>
  <button
    type="button"
    class="phone"
    :aria-pressed="selected"
    :aria-label="phone.name"
    :title="`${phone.ipa} — ${phone.name}`"
    :aria-disabled="readOnly || undefined"
    :class="{ on: selected, still: readOnly }"
    @click="!readOnly && $emit('toggle', phone.ipa)"
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

/**
 * Read-only: the symbol still reads, it just does not respond.
 *
 * `aria-disabled` rather than `disabled` — a disabled button is skipped by the keyboard
 * and loses its tooltip, and the tooltip is the symbol's name. These rules come last
 * because the hover rules above match at the same specificity, so source order is what
 * decides them.
 */
.phone.still {
  cursor: default;
}

.phone.still:hover {
  background: transparent;
  color: var(--c-faint);
}

.phone.still.on:hover {
  background: transparent;
  color: var(--c-text);
}
</style>
