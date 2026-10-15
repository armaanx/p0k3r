/**
 * Focus helpers that never yank the page around.
 * A plain `autoFocus` (or `el.focus()`) scrolls the page to centre the element, which made screens jump on every
 * feedback panel and landed people half-way down a page. These helpers are stable module-level callback refs.
 */

/** Focus without scrolling at all (use when a screen opens). */
export function focusQuiet(el: HTMLElement | null): void {
  if (el) el.focus({ preventScroll: true });
}

/** Focus, then scroll only as far as needed to keep the element on screen (use for in-flow "Next" buttons). */
export function focusInView(el: HTMLElement | null): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' as ScrollBehavior });
}
