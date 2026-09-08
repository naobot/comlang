/**
 * Click a word in a read-only tokenized layer (`CorpusText`) and land the caret at that
 * point in a textarea underneath it. Shared by the corpus grid and the passage list, which
 * both stack the two in one cell and swap them on `:focus-within`.
 *
 * The point→offset mapping is best-effort: `CorpusText`'s rendered text content equals the
 * field's value exactly (the `tokenizeConlang` invariant), so walking its text nodes to
 * the caret node gives the index. If the browser hands back nothing usable, the caret goes
 * to the end of the field.
 */
export function editFromPoint(event: MouseEvent, textareaSelector = "textarea"): void {
  const layer = event.currentTarget;
  if (!(layer instanceof HTMLElement)) return;
  const textarea = layer.parentElement?.querySelector(textareaSelector);
  if (!(textarea instanceof HTMLTextAreaElement)) return;

  event.preventDefault();
  const index = caretIndexFromPoint(layer, event.clientX, event.clientY) ?? textarea.value.length;
  textarea.focus();
  textarea.setSelectionRange(index, index);
}

function caretIndexFromPoint(root: HTMLElement, x: number, y: number): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const pos = doc.caretPositionFromPoint?.(x, y);
  const range = pos ? null : doc.caretRangeFromPoint?.(x, y);
  const node = pos?.offsetNode ?? range?.startContainer ?? null;
  const offset = pos?.offset ?? range?.startOffset ?? 0;
  if (!node || !root.contains(node)) return null;

  let index = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let text = walker.nextNode();
  while (text) {
    if (text === node) return index + offset;
    index += text.textContent?.length ?? 0;
    text = walker.nextNode();
  }
  return null;
}
