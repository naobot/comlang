import { useEventListener } from "@vueuse/core";
import { ref } from "vue";

/**
 * Drag-to-reorder for one list, over the native HTML5 drag events.
 *
 * No dependency, for the reason `ModalDialog` is a native `<dialog>`: the browser already
 * does the hard part. What a library would add here is a pointer-driven animation, and
 * what it would cost is a reordering model of its own beside the store's.
 *
 * Two things this deliberately does **not** try to be:
 *
 * - **The keyboard path.** HTML5 drag is mouse-only — it does not fire for a keyboard, and
 *   it does not fire for touch. Every list that uses this keeps its move buttons, which
 *   are the accessible and the touch route; the handle is therefore `aria-hidden` at each
 *   call site rather than pretending to be an operable control.
 * - **A cross-list channel.** Each list holds its own instance, and a drag it did not
 *   start is ignored (`dragging === null`), so dragging a word class over the categories
 *   beside it does nothing rather than something surprising.
 *
 * Dropping *on* an item moves the dragged item to that item's index — the same splice the
 * move buttons do, so both routes go through the store's one reordering function.
 */
/** What a list hands its item components so they can render the handle themselves. */
export type DragHandleProps = { onPointerdown: () => void };

export function useDragReorder(move: (from: number, to: number) => void) {
  /** The index being dragged, or null when no drag of ours is in flight. */
  const dragging = ref<number | null>(null);
  /** The index under the pointer, so the drop target can be shown before the drop. */
  const over = ref<number | null>(null);
  /**
   * Which item, if any, has its handle held down. An item is `draggable` only while its
   * own handle is pressed: a permanently draggable row swallows text selection in the
   * inputs it contains, and these rows are mostly inputs.
   */
  const armed = ref<number | null>(null);

  function end() {
    dragging.value = null;
    over.value = null;
    armed.value = null;
  }

  // A handle pressed and released without a drag would otherwise leave the row armed.
  useEventListener(window, "pointerup", () => {
    if (dragging.value === null) armed.value = null;
  });

  function start(index: number, event: DragEvent) {
    if (!event.dataTransfer) return;
    // Firefox starts no drag at all unless something is written to the transfer.
    event.dataTransfer.setData("text/plain", String(index));
    event.dataTransfer.effectAllowed = "move";
    dragging.value = index;
  }

  function over_(index: number, event: DragEvent) {
    if (dragging.value === null) return;
    // Without preventDefault the element is not a drop target and no drop event fires.
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    over.value = index;
  }

  function drop(index: number, event: DragEvent) {
    const from = dragging.value;
    if (from === null) return;
    event.preventDefault();
    end();
    if (from !== index) move(from, index);
  }

  /** Spread onto each item: `v-bind="reorder.item(i)"`. Merges with the element's class. */
  const item = (index: number) => ({
    draggable: armed.value === index,
    onDragstart: (event: DragEvent) => start(index, event),
    onDragover: (event: DragEvent) => over_(index, event),
    onDrop: (event: DragEvent) => drop(index, event),
    onDragend: end,
    class: {
      "drag-source": dragging.value === index,
      "drag-target": over.value === index && dragging.value !== index,
    },
  });

  /** Spread onto the item's handle: `v-bind="reorder.handle(i)"`. */
  const handle = (index: number): DragHandleProps => ({
    onPointerdown: () => {
      armed.value = index;
    },
  });

  return { dragging, over, item, handle };
}
