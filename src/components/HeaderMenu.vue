<script setup lang="ts">
import { onClickOutside } from "@vueuse/core";
import { computed, ref, useTemplateRef } from "vue";

/**
 * Hover-opened dropdown with a click/keyboard path alongside it.
 *
 * Hover alone would make this unreachable by keyboard and unusable on touch, where
 * there is no hover state at all. So a click *pins* it: hovering away no longer closes
 * it, and Escape or a click outside releases the pin.
 */
const hovering = ref(false);
const pinned = ref(false);
const root = useTemplateRef<HTMLElement>("root");

const open = computed(() => hovering.value || pinned.value);

onClickOutside(root, () => {
  pinned.value = false;
  hovering.value = false;
});

function close() {
  pinned.value = false;
  hovering.value = false;
}

// Anything chosen inside the menu should dismiss it, so items are wrapped in a
// click handler rather than each caller remembering to close.
</script>

<template>
  <div
    ref="root"
    class="menu"
    @mouseenter="hovering = true"
    @mouseleave="hovering = false"
    @keydown.esc="close"
  >
    <button
      type="button"
      class="trigger"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="pinned = !pinned"
    >
      <slot name="trigger" />
    </button>

    <div v-if="open" class="panel" role="menu" @click="close">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.menu {
  position: relative;
  display: inline-flex;
}

.trigger {
  display: inline-flex;
  align-items: center;
  padding: var(--sp-1);
  border-color: transparent;
  background: transparent;
  color: var(--c-muted);
  line-height: 0;
}

.trigger:hover:not(:disabled),
.menu:has(.panel) .trigger {
  background: var(--c-raised);
  color: var(--c-text);
}

.panel {
  position: absolute;
  top: calc(100% + var(--sp-1));
  left: 0;
  z-index: 20;
  min-width: 12rem;
  padding: var(--sp-1);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  background: var(--c-surface);
  box-shadow: 0 6px 20px rgb(22 35 63 / 12%);
}

/* Items are supplied by the caller; style them from here so every menu matches. */
.panel :deep(a),
.panel :deep(button) {
  display: block;
  width: 100%;
  padding: var(--sp-2) var(--sp-3);
  border: 0;
  border-radius: calc(var(--radius) - 2px);
  background: transparent;
  color: var(--c-text);
  font-size: 0.875rem;
  text-align: left;
  text-decoration: none;
}

.panel :deep(a:hover),
.panel :deep(button:hover) {
  background: var(--c-raised);
}

.panel :deep(.label) {
  padding: var(--sp-2) var(--sp-3);
  color: var(--c-muted);
  font-size: 0.8125rem;
  overflow-wrap: anywhere;
}

.panel :deep(hr) {
  margin: var(--sp-1) 0;
  border: 0;
  border-top: 1px solid var(--c-border);
}
</style>
