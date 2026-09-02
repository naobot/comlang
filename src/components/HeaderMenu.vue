<script setup lang="ts">
import { onClickOutside } from "@vueuse/core";
import { computed, onScopeDispose, ref, useTemplateRef } from "vue";

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

/**
 * How long the menu stays open after the pointer leaves.
 *
 * Closing on `mouseleave` alone made it a target you had to hit rather than a menu you
 * could reach for: the panel hangs below the trigger with a gap between them, so the
 * pointer is briefly over neither, and any diagonal path — the natural one, towards an
 * item that is not directly below the trigger — left the menu entirely on the way in.
 * The gap is bridged in CSS as well, but a bridge alone still punishes an overshoot.
 *
 * Only the *closing* is delayed. Opening stays immediate, because a menu that hesitates
 * before appearing feels broken in a way that one lingering for a third of a second does
 * not.
 */
const CLOSE_DELAY_MS = 300;

let closeTimer: ReturnType<typeof setTimeout> | null = null;

function cancelClose() {
  if (closeTimer === null) return;
  clearTimeout(closeTimer);
  closeTimer = null;
}

function onEnter() {
  // Coming back within the grace period is the whole point: the pending close is
  // cancelled rather than the menu being reopened, so it never blinks.
  cancelClose();
  hovering.value = true;
}

function onLeave() {
  cancelClose();
  closeTimer = setTimeout(() => {
    closeTimer = null;
    hovering.value = false;
  }, CLOSE_DELAY_MS);
}

// A timer outliving its component would fire against a dead one.
onScopeDispose(cancelClose);

onClickOutside(root, () => close());

function close() {
  cancelClose();
  pinned.value = false;
  hovering.value = false;
}

// Anything chosen inside the menu should dismiss it, so items are wrapped in a
// click handler rather than each caller remembering to close.
</script>

<template>
  <div ref="root" class="menu" @mouseenter="onEnter" @mouseleave="onLeave" @keydown.esc="close">
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
  box-shadow: 0 6px 20px var(--c-shadow);
}

/**
 * Bridges the gap between the trigger and the panel.
 *
 * The panel sits `--sp-1` below the trigger, and those few pixels belong to neither, so
 * crossing them counts as leaving the menu. An invisible strip spanning the gap keeps the
 * pointer inside the element the whole way down; the close delay then covers the sloppier
 * paths this cannot, like leaving sideways and coming back.
 */
.panel::before {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  height: var(--sp-1);
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
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
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
