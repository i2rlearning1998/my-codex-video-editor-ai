/** Intentionally unstyled temporary markup pending Claude's shell replacement. */
const stack: { close: () => void }[] = [];
export function closeTopOverlay(): boolean {
  const top = stack.at(-1);
  if (!top) return false;
  top.close();
  return true;
}
/** Lets an overlay built with a different mechanism (e.g. a backdrop-based modal)
 * participate in the same Escape-to-close stack as popover-based overlays.
 * Call the returned function when the overlay closes on its own (Enter, a button, etc.)
 * so the stack stays accurate. */
export function registerExternalOverlay(close: () => void): () => void {
  const entry = { close };
  stack.push(entry);
  return () => {
    const index = stack.indexOf(entry);
    if (index >= 0) stack.splice(index, 1);
  };
}
export function temporaryOverlay(id: string, label: () => string) {
  const element = document.createElement('div');
  element.id = id;
  element.setAttribute('role', 'dialog');
  element.setAttribute('popover', 'manual');
  element.hidden = true;
  document.body.append(element);
  let previous: HTMLElement | null = null;
  const overlay = {
    element,
    open() {
      if (!element.hidden) return;
      previous =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      element.setAttribute('aria-label', label());
      element.hidden = false;
      element.showPopover?.();
      stack.push(overlay);
    },
    close() {
      if (element.hidden) return;
      element.hidePopover?.();
      element.hidden = true;
      const index = stack.indexOf(overlay);
      if (index >= 0) stack.splice(index, 1);
      if (previous?.isConnected) previous.focus();
    },
    dispose() {
      overlay.close();
      element.remove();
    },
  };
  return overlay;
}
