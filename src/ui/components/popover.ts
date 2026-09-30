// G1: the one anchored popover. Selects, number-field presets, the colour
// picker and toolbar choices all open through it, so positioning, outside
// clicks, Escape and nesting behave the same everywhere. It floats in the
// document (position: fixed), so it never pushes the layout. A popover opened
// from inside another (a select in the Spacing popover) nests; any other new
// popover closes the open ones.

export interface PopoverHandle {
  readonly element: HTMLElement;
  close(): void;
  /** Re-measures after the content changed size. */
  reposition(): void;
  /** Follows a new anchor element (its owner re-rendered). */
  retarget(anchor: HTMLElement): void;
}

interface Entry {
  handle: PopoverHandle;
  anchor: HTMLElement;
}
const stack: Entry[] = [];

/** The top popover's anchor, if any (used to toggle on a second click). */
export const openAnchor = () => stack.at(-1)?.anchor ?? null;

/** Closes the top popover. */
export function closePopover(): void {
  stack.at(-1)?.handle.close();
}
/**
 * H3: Escape with focus outside a popover (on the toolbar button that opened
 * it) closes the popover and returns focus, instead of deselecting.
 */
export function escapeTopPopover(): boolean {
  const top = stack.at(-1);
  if (!top) return false;
  top.handle.close();
  if (top.anchor.isConnected) top.anchor.focus();
  return true;
}

const insideAny = (target: Node, from: number) =>
  stack
    .slice(from)
    .some(
      (entry) =>
        entry.handle.element.contains(target) || entry.anchor.contains(target),
    );

/**
 * Opens `content` in a popover under `anchor` (above it when there is no room
 * below), clamped to the viewport. Closes on an outside pointerdown, Escape,
 * or when an unrelated popover opens.
 */
export function openPopover(
  initialAnchor: HTMLElement,
  content: HTMLElement,
  options: {
    label: string;
    role?: 'dialog' | 'listbox';
    onClose?: () => void;
    className?: string;
  },
): PopoverHandle {
  // Close every open popover that does not contain the new anchor.
  while (stack.length && !stack.at(-1)!.handle.element.contains(initialAnchor))
    stack.at(-1)!.handle.close();
  let anchor = initialAnchor;
  const element = document.createElement('div');
  element.className = `popover ${options.className ?? ''}`.trim();
  element.setAttribute('role', options.role ?? 'dialog');
  element.setAttribute('aria-label', options.label);
  element.append(content);
  document.body.append(element);
  const place = () => {
    if (!anchor.isConnected) return;
    const box = anchor.getBoundingClientRect();
    const width = element.offsetWidth,
      height = element.offsetHeight;
    const margin = 8;
    const below = box.bottom + 4;
    const top =
      below + height + margin > window.innerHeight &&
      box.top - 4 - height > margin
        ? box.top - 4 - height
        : Math.min(
            below,
            Math.max(margin, window.innerHeight - height - margin),
          );
    const left = Math.min(
      Math.max(margin, box.left),
      window.innerWidth - width - margin,
    );
    element.style.left = `${Math.round(left)}px`;
    element.style.top = `${Math.round(top)}px`;
  };
  const entry: Entry = { handle: undefined as never, anchor };
  const outside = (event: PointerEvent) => {
    const at = stack.indexOf(entry);
    if (at >= 0 && !insideAny(event.target as Node, at)) handle.close();
  };
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || stack.at(-1) !== entry) return;
    event.stopPropagation();
    event.preventDefault();
    handle.close();
    if (anchor.isConnected) anchor.focus();
  };
  let closed = false;
  const handle: PopoverHandle = {
    element,
    close() {
      if (closed) return;
      closed = true;
      // Children close first.
      while (stack.length && stack.at(-1) !== entry)
        stack.at(-1)!.handle.close();
      const at = stack.indexOf(entry);
      if (at >= 0) stack.splice(at, 1);
      document.removeEventListener('pointerdown', outside, true);
      document.removeEventListener('keydown', escape, true);
      element.remove();
      anchor.setAttribute('aria-expanded', 'false');
      options.onClose?.();
    },
    reposition: place,
    retarget(next) {
      anchor = next;
      entry.anchor = next;
      next.setAttribute('aria-expanded', 'true');
      place();
    },
  };
  entry.handle = handle;
  stack.push(entry);
  anchor.setAttribute('aria-expanded', 'true');
  place();
  document.addEventListener('pointerdown', outside, true);
  document.addEventListener('keydown', escape, true);
  return handle;
}
