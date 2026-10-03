import { commands, runCommand, type CommandContext } from './registry';

export function isTyping(element: Element | null): boolean {
  return !!element?.closest(
    'input,textarea,select,[contenteditable]:not([contenteditable="false"])',
  );
}
/**
 * J2: text fields with typing that is not committed yet. A field becomes
 * dirty on input and clean again when its value is committed (Enter, change
 * or leaving it), so Ctrl+Z inside a dirty field undoes the typing (the
 * browser's own undo) and anywhere else undoes the last project edit.
 */
const dirtyFields = new WeakSet<Element>();
let trackingFields = false;
function trackFields(): void {
  if (trackingFields) return;
  trackingFields = true;
  document.addEventListener(
    'input',
    (event) => {
      if (event.target instanceof Element) dirtyFields.add(event.target);
    },
    true,
  );
  for (const type of ['change', 'focusout'])
    document.addEventListener(
      type,
      (event) => {
        if (event.target instanceof Element) dirtyFields.delete(event.target);
      },
      true,
    );
  // Enter commits a field; its own handler runs first (bubbling phase).
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.target instanceof Element)
      dirtyFields.delete(event.target);
  });
}
/** Whether a key goes to text the user is still typing. */
export function hasUncommittedTyping(element: Element | null): boolean {
  if (!element) return false;
  // Rich text editing (on-canvas text) always keeps its own undo.
  if (element.closest('[contenteditable]:not([contenteditable="false"])'))
    return true;
  const field = element.closest('input,textarea');
  return !!field && dirtyFields.has(field);
}
/** Ctrl or Cmd with Z, Shift+Z or Y: the history chords. */
function historyChord(event: KeyboardEvent): 'undo' | 'redo' | null {
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y' && !event.shiftKey) return 'redo';
  return null;
}
function matches(event: KeyboardEvent, shortcut: string): boolean {
  return shortcut.split(' / ').some((alternative) => {
    const pieces = alternative.toLowerCase().split('+');
    const key = pieces.at(-1);
    return (
      !!key &&
      (event.key.toLowerCase() === key ||
        (key === 'space' && event.key === ' ')) &&
      (event.ctrlKey || event.metaKey) === pieces.includes('ctrl') &&
      event.shiftKey === pieces.includes('shift') &&
      !event.altKey
    );
  });
}
/**
 * Whether a key's target is inside a menu, listbox or popover that is still
 * shown. A menu that has just closed can keep focus for a moment (the browser
 * moves it out on the next frame); keys pressed then must still reach the
 * shortcuts (a CI flake in KEY-002, KEY-006 and CV-040).
 */
export function insideOpenMenu(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const menu = target.closest('[role="menu"],[role="listbox"],.popover');
  if (!menu || !menu.isConnected || menu.closest('[hidden]')) return false;
  return typeof menu.checkVisibility === 'function'
    ? menu.checkVisibility()
    : true;
}
export function bindShortcuts(
  context: CommandContext,
  options: {
    cancelGesture: () => boolean;
    closeOverlay: () => boolean;
    localKey: (event: KeyboardEvent) => void;
    report: (error: unknown) => void;
  },
): () => void {
  trackFields();
  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing || event.defaultPrevented) return;
    // J2: undo and redo work right after a panel edit, wherever focus is
    // left (a committed field, a picker or a popover), but never take Ctrl+Z
    // from text that is still being typed.
    const chord = historyChord(event);
    if (
      chord &&
      !hasUncommittedTyping(document.activeElement) &&
      !hasUncommittedTyping(
        event.target instanceof Element ? event.target : null,
      )
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      try {
        if (!event.repeat) runCommand(chord, context);
      } catch (error) {
        options.report(error);
      }
      return;
    }
    // G1: menus, listboxes and popovers handle their own keys (arrows,
    // Enter, Escape) while they have focus.
    if (insideOpenMenu(event.target)) return;
    try {
      // Escape must still dismiss a palette while its search input owns focus.
      if (event.key === 'Escape') {
        if (options.cancelGesture() || options.closeOverlay()) {
          event.preventDefault();
          event.stopImmediatePropagation();
          return;
        }
        if (
          isTyping(document.activeElement) ||
          isTyping(event.target instanceof Element ? event.target : null)
        )
          return;
        // Esc first steps out of an entered group (CV-022), then deselects.
        if (!context.session.exitGroup()) context.session.select(null);
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (
        isTyping(document.activeElement) ||
        isTyping(event.target instanceof Element ? event.target : null)
      )
        return;
      // Timeline-scoped commands are dispatched by the focused timeline itself.
      const command = commands.find(
        (item) => !item.scope && matches(event, item.shortcut),
      );
      if (command) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!event.repeat) runCommand(command.id, context);
      } else options.localKey(event);
    } catch (error) {
      options.report(error);
    }
  };
  document.addEventListener('keydown', keydown, true);
  return () => document.removeEventListener('keydown', keydown, true);
}
