<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from "vue";

/**
 * The app's modal shell, and its first: nothing in `src` used a dialog, an overlay or a
 * teleport before this.
 *
 * It is a native `<dialog>` opened with `showModal()`, which is what makes it worth having
 * at all — Escape, the top layer, the inert background and the focus trap are all the
 * browser's, and none of them has to be written or kept correct here. The one thing
 * `showModal()` does not give is dismissal by clicking outside, so that is done by hand
 * against the dialog's own box, since the backdrop is the element's own padding box as far
 * as a click is concerned.
 *
 * `open` is a prop rather than internal state because the caller owns which slot or term
 * is being edited; the dialog only reports that it wants to close.
 */
const props = defineProps<{ open: boolean; title: string }>();
const emit = defineEmits<{ close: [] }>();

const dialog = useTemplateRef<HTMLDialogElement>("dialog");

function sync() {
  const el = dialog.value;
  if (!el) return;
  // Guarded both ways: calling showModal() on an already-open dialog throws.
  if (props.open && !el.open) el.showModal();
  if (!props.open && el.open) el.close();
}

// onMounted as well as the watcher, and this is the path that actually matters: callers
// render the dialog behind a `v-if`, so it mounts already open and the watcher — which
// only fires on a *change* — would never run. A `<dialog>` that was never shown is
// `display: none`, so getting this wrong is an invisible dialog rather than an error.
onMounted(sync);
watch(() => props.open, sync, { flush: "post" });

/**
 * A click landing on the dialog element itself rather than on anything inside it is a
 * click on the backdrop — the panel fills the element, so its own children cover every
 * pixel that is not backdrop.
 */
function onClick(event: MouseEvent) {
  if (event.target === dialog.value) emit("close");
}
</script>

<template>
  <dialog ref="dialog" @cancel.prevent="emit('close')" @click="onClick">
    <div class="panel">
      <header>
        <h2>{{ title }}</h2>
        <button type="button" class="close" aria-label="Close" @click="emit('close')">×</button>
      </header>

      <div class="body">
        <slot />
      </div>

      <footer>
        <slot name="footer" />
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
dialog {
  /* The element is the whole viewport so a click anywhere outside the panel reaches
     onClick; the panel below is what actually looks like a dialog. */
  width: 100%;
  max-width: 100%;
  height: 100%;
  max-height: 100%;
  padding: var(--sp-4);
  border: 0;
  background: transparent;
  color: var(--c-text);
  overflow: hidden;
}

/* ::backdrop inherits nothing from the page, so the token has to be restated here. */
dialog::backdrop {
  background: rgb(0 0 0 / 45%);
}

.panel {
  display: flex;
  flex-direction: column;
  /* Definite, not max-height: .body is a flex child that scrolls, and against an
     indefinite height it would resolve to its full content and spill instead. Same trap
     the lexicon's list pane hit. */
  height: 100%;
  max-width: 72rem;
  margin: 0 auto;
  background: var(--c-surface);
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  box-shadow: 0 12px 40px var(--c-shadow);
}

header,
footer {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  flex: none;
}

header {
  border-bottom: 1px solid var(--c-border);
}

footer {
  border-top: 1px solid var(--c-border);
  justify-content: flex-end;
}

h2 {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 0.875rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--c-muted);
}

.close {
  /* Content, not a label: the glyph must not be tracked out or uppercased. */
  font-size: 1.125rem;
  line-height: 1;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  padding: 0 var(--sp-2);
  border-color: transparent;
  background: transparent;
  color: var(--c-muted);
}

.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--sp-4);
}
</style>
