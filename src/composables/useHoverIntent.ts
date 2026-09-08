import { computed, onScopeDispose, ref } from "vue";

/**
 * Open-on-hover, close-after-a-grace-period, with a click/keyboard *pin* alongside.
 *
 * Extracted from `HeaderMenu.vue`, which was the only place this lived; the corpus word
 * preview (`CorpusText.vue`) is the second caller. Behaviour is unchanged from the menu's:
 *
 * - Opening is immediate. A popup that hesitates before appearing feels broken in a way
 *   one that lingers for a third of a second does not.
 * - Closing waits `CLOSE_DELAY_MS`, cancelled by re-entry. The trigger and the panel
 *   usually have a gap between them, so the pointer is briefly over neither; without the
 *   delay any diagonal path toward an item leaves the popup on the way in.
 * - A click *pins* it open: hovering away no longer closes it. `Escape`, a click outside,
 *   or a second click releases the pin. This is the only path on touch, where there is no
 *   hover state at all, and the keyboard path for the same reason.
 *
 * `onEnter` / `onLeave` are wired to both pointer (`mouseenter` / `mouseleave`) and focus
 * (`focusin` / `focusout`) events by the caller.
 */
export const CLOSE_DELAY_MS = 300;

export function useHoverIntent() {
  const hovering = ref(false);
  const pinned = ref(false);
  const open = computed(() => hovering.value || pinned.value);

  let closeTimer: ReturnType<typeof setTimeout> | null = null;

  function cancelClose() {
    if (closeTimer === null) return;
    clearTimeout(closeTimer);
    closeTimer = null;
  }

  function onEnter() {
    // Re-entry within the grace period cancels the pending close rather than reopening, so
    // the popup never blinks.
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

  function pin() {
    cancelClose();
    pinned.value = true;
  }

  function togglePin() {
    if (pinned.value) close();
    else pin();
  }

  function close() {
    cancelClose();
    pinned.value = false;
    hovering.value = false;
  }

  // A timer outliving its component would fire against a dead one.
  onScopeDispose(cancelClose);

  return { open, hovering, pinned, onEnter, onLeave, pin, togglePin, close, cancelClose };
}
