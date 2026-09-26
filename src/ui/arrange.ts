// CV-026 layer order: bring to front, bring forward, send backward, send to
// back. Later layers in a sibling list paint on top. Each selected root moves
// among its own siblings, and a run is one undo step.
import type { Command, EditorEngine } from '../core';
import { locateLayer } from '../render/adapter';
import type { EditorSession } from './session';
import { selectionRoots } from './selection-context';

export const ARRANGE_ACTIONS = [
  'front',
  'forward',
  'backward',
  'back',
] as const;
export type ArrangeAction = (typeof ARRANGE_ACTIONS)[number];
export const ARRANGE_LABELS: Record<ArrangeAction, string> = {
  front: 'Bring to front',
  forward: 'Bring forward',
  backward: 'Send backward',
  back: 'Send to back',
};

/** The new sibling order (bottom to top) for one arrange action. */
export function arrangeOrder(
  order: readonly string[],
  selected: ReadonlySet<string>,
  action: ArrangeAction,
): string[] {
  const moving = order.filter((id) => selected.has(id)),
    resting = order.filter((id) => !selected.has(id));
  if (action === 'front') return [...resting, ...moving];
  if (action === 'back') return [...moving, ...resting];
  const next = [...order];
  // Forward walks from the top so a block of selected layers moves together.
  const indices = next.map((_, index) => index);
  if (action === 'forward') indices.reverse();
  for (const index of indices) {
    if (!selected.has(next[index]!)) continue;
    const target = action === 'forward' ? index + 1 : index - 1;
    if (target < 0 || target >= next.length || selected.has(next[target]!))
      continue;
    [next[index], next[target]] = [next[target]!, next[index]!];
  }
  return next;
}

export function arrangeCommands(
  session: EditorSession,
  action: ArrangeAction,
): Command[] {
  const source = session.source,
    compositionId = source.composition.id;
  const roots = selectionRoots(source, session.selectedIds);
  const byParent = new Map<string | null, Set<string>>();
  for (const layer of roots) {
    const parent =
      locateLayer(source.composition.layers, layer.id)!.parent?.id ?? null;
    byParent.set(parent, (byParent.get(parent) ?? new Set()).add(layer.id));
  }
  const commands: Command[] = [];
  for (const [parentId, selected] of byParent) {
    const siblings = parentId
      ? locateLayer(source.composition.layers, parentId)!.layer.children
      : source.composition.layers;
    const current = siblings.map((layer) => layer.id);
    const target = arrangeOrder(current, selected, action);
    for (let index = 0; index < target.length; index++) {
      if (current[index] === target[index]) continue;
      const from = current.indexOf(target[index]!);
      current.splice(from, 1);
      current.splice(index, 0, target[index]!);
      commands.push({
        type: 'MOVE_LAYER',
        compositionId,
        layerId: target[index]!,
        parentId,
        index,
      });
    }
  }
  return commands;
}

/** Whether the action would change anything for the current selection. */
export const canArrange = (session: EditorSession, action: ArrangeAction) =>
  arrangeCommands(session, action).length > 0;

export function arrangeSelection(
  engine: EditorEngine,
  session: EditorSession,
  action: ArrangeAction,
): void {
  const commands = arrangeCommands(session, action);
  if (commands.length)
    engine.commands.transaction(ARRANGE_LABELS[action], commands);
}
