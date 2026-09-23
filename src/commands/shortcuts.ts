import { commands, runCommand, type CommandContext } from './registry';

export function isTyping(element: Element | null): boolean {
  return !!element?.closest(
    'input,textarea,select,[contenteditable]:not([contenteditable="false"])',
  );
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
export function bindShortcuts(
  context: CommandContext,
  options: {
    cancelGesture: () => boolean;
    closeOverlay: () => boolean;
    localKey: (event: KeyboardEvent) => void;
    report: (error: unknown) => void;
  },
): () => void {
  const keydown = (event: KeyboardEvent) => {
    if (event.isComposing || event.defaultPrevented) return;
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
        context.session.select(null);
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
