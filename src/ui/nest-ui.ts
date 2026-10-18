// FINAL2 U9: nested (compound) clips in the UI (D-271's engine, src/nesting).
// Nest clips and Un-nest are registered commands (timeline menu, palette);
// each is one undo step. Double-clicking a nested clip on the timeline
// enters it (transient session state: the canvas edits its children); a
// breadcrumb bar above the timeline shows the path and leaves it again.
import {
  findClipByLayer,
  isNestedClip,
  nestedInfo,
  type EditorEngine,
} from '../core';
import { formatNumber, t } from '../i18n';

const formatTime = (seconds: number) =>
  formatNumber(Math.round(seconds * 10) / 10);
import {
  absoluteChildClip,
  enterNested,
  exitNested,
  flattenNested,
  innerToOuter,
  nestClips,
  NOT_NESTED,
  resolveNestPath,
  type NestEditState,
} from '../nesting';
import { selectedClips } from './editing';
import { selectionRoots } from './selection-context';
import type { EditorSession } from './session';

type Context = { engine: EditorEngine; session: EditorSession };

/** The one selected top-level nested clip, or null. */
export function selectedNested({ session }: Pick<Context, 'session'>) {
  const roots = selectionRoots(session.source, session.selectedIds);
  if (roots.length !== 1) return null;
  const found = findClipByLayer(session.source.composition, roots[0]!.id);
  return found && isNestedClip(found.clip)
    ? { layer: roots[0]!, clip: found.clip }
    : null;
}

const nestPlan = ({ engine, session }: Context) => {
  const clips = selectedClips(session.source, session.selectedIds);
  if (clips.length < 2) return null;
  try {
    return nestClips(
      engine.state,
      session.source.composition.id,
      clips.map(({ clip }) => clip.id),
      { name: t('nest.name') },
    );
  } catch {
    return null;
  }
};
export const canNest = (context: Context) => nestPlan(context) !== null;

export function nestSelection(context: Context): void {
  const { engine, session } = context;
  const clips = selectedClips(session.source, session.selectedIds);
  // Run once more without the guard so a refusal names its reason.
  const plan = nestClips(
    engine.state,
    session.source.composition.id,
    clips.map(({ clip }) => clip.id),
    { name: t('nest.name') },
  );
  session.setPlaying(false);
  engine.commands.transaction(plan.label, plan.commands);
  session.select(plan.groupId);
}

export function unnestSelection(context: Context): void {
  const { engine, session } = context;
  const nested = selectedNested(context);
  if (!nested) throw new Error(t('nest.notNested'));
  session.setPlaying(false);
  if (session.enteredGroupId) session.enterGroup(null);
  const plan = flattenNested(
    engine.state,
    session.source.composition.id,
    nested.clip.id,
  );
  engine.commands.transaction(plan.label, plan.commands);
  session.selectMany(plan.layerIds);
}

/**
 * The breadcrumb bar above the timeline and the double-click that enters a
 * nested clip. Returns `enter` for the registered Open nested clip command.
 */
export function mountNestBar(
  section: HTMLElement,
  foundation: HTMLElement,
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
) {
  let state: NestEditState = NOT_NESTED;
  const bar = document.createElement('nav');
  bar.className = 'nest-bar';
  bar.id = 'nest-bar';
  bar.hidden = true;
  bar.setAttribute('aria-label', t('nest.breadcrumb'));
  section.insertBefore(bar, foundation);
  let rendered = '';

  const leaveAll = () => {
    const top = state.path[0];
    state = NOT_NESTED;
    if (session.enteredGroupId) session.enterGroup(null);
    if (top) session.select(top);
    render();
  };
  const leaveOne = () => {
    const left = state.path.at(-1);
    state = exitNested(state);
    const parent = state.path.at(-1) ?? null;
    session.enterGroup(parent);
    if (left) session.select(left);
    render();
  };
  const render = () => {
    const composition = session.source.composition;
    if (state.path.length && state.compositionId !== composition.id)
      state = NOT_NESTED;
    let levels: ReturnType<typeof resolveNestPath> = [];
    if (state.path.length)
      try {
        levels = resolveNestPath(engine.state, composition.id, state.path);
      } catch {
        state = NOT_NESTED;
      }
    const key = JSON.stringify([
      state.path,
      levels.map((level) => [level.group.name, level.clip]),
      session.selectedIds,
    ]);
    if (key === rendered) return;
    rendered = key;
    bar.hidden = !levels.length;
    section.classList.toggle('nest-entered', levels.length > 0);
    if (!levels.length) {
      bar.replaceChildren();
      return;
    }
    const crumb = (label: string, onClick?: () => void) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'nest-crumb';
      item.textContent = label;
      if (onClick) item.onclick = () => onClick();
      else item.setAttribute('aria-current', 'location');
      return item;
    };
    const sep = () => {
      const span = document.createElement('span');
      span.className = 'nest-sep';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = '›';
      return span;
    };
    const items: HTMLElement[] = [
      crumb(t('nest.main'), () => {
        try {
          leaveAll();
        } catch (error) {
          report(error);
        }
      }),
    ];
    levels.forEach((level, index) => {
      items.push(sep());
      const last = index === levels.length - 1;
      items.push(
        crumb(
          level.group.name,
          last
            ? undefined
            : () => {
                while (state.path.length > index + 1) leaveOne();
              },
        ),
      );
    });
    // The children of the innermost nested clip, with their place on the
    // parent timeline; a click selects one (the canvas edits it).
    const inner = levels.at(-1)!;
    const list = document.createElement('div');
    list.className = 'nest-children';
    list.setAttribute('role', 'list');
    for (const child of inner.group.children) {
      const kept = absoluteChildClip(inner.clip, child.id);
      const start = kept ? innerToOuter(inner.clip, kept.startTime) : null;
      const end = kept
        ? innerToOuter(inner.clip, kept.startTime + kept.duration)
        : null;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'nest-child';
      chip.setAttribute('role', 'listitem');
      chip.dataset.id = child.id;
      chip.setAttribute(
        'aria-pressed',
        String(session.selectedIds.includes(child.id)),
      );
      chip.textContent =
        start !== null && end !== null
          ? t('nest.child', {
              name: child.name,
              start: formatTime(Math.min(start, end)),
              end: formatTime(Math.max(start, end)),
            })
          : child.name;
      chip.onclick = () => session.select(child.id);
      list.append(chip);
    }
    const exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'nest-exit';
    exit.dataset.action = 'nest-exit';
    exit.textContent = t('nest.exit');
    exit.onclick = () => {
      try {
        leaveOne();
      } catch (error) {
        report(error);
      }
    };
    bar.replaceChildren(...items, list, exit);
  };

  const enter = (layerId: string) => {
    const composition = session.source.composition;
    const found = findClipByLayer(composition, layerId);
    if (!found || !nestedInfo(found.clip)) throw new Error(t('nest.notNested'));
    session.setPlaying(false);
    state = enterNested(engine.state, state, composition.id, layerId);
    session.enterGroup(layerId);
    session.select(null);
    render();
  };

  // A double click on a nested clip enters it. The first click re-renders
  // the timeline, so the pair is detected here (capture phase), and only
  // for a press that did not move (a drag still moves the clip).
  let down: { id: string; x: number; y: number } | null = null;
  let last: { id: string; at: number } | null = null;
  const onDown = (event: PointerEvent) => {
    const clip = (event.target as HTMLElement).closest<HTMLElement>(
      '.timeline-clip[data-action="clip"][data-id]',
    );
    down =
      clip && event.button === 0
        ? { id: clip.dataset.id!, x: event.clientX, y: event.clientY }
        : null;
  };
  const onUp = (event: PointerEvent) => {
    const press = down;
    down = null;
    if (
      !press ||
      Math.hypot(event.clientX - press.x, event.clientY - press.y) > 4
    ) {
      last = null;
      return;
    }
    const now = performance.now();
    if (last && last.id === press.id && now - last.at < 450) {
      last = null;
      const found = findClipByLayer(session.source.composition, press.id);
      if (found && isNestedClip(found.clip))
        try {
          enter(press.id);
        } catch (error) {
          report(error);
        }
      return;
    }
    last = { id: press.id, at: now };
  };
  foundation.addEventListener('pointerdown', onDown, true);
  foundation.addEventListener('pointerup', onUp, true);
  const off = session.onChange(() => {
    // Escape on the canvas leaves the entered group: follow it.
    if (state.path.length && session.enteredGroupId !== state.path.at(-1)) {
      state = NOT_NESTED;
      if (session.enteredGroupId) session.enterGroup(null);
    }
    render();
  });
  return {
    enter,
    get state() {
      return state;
    },
    dispose() {
      off();
      foundation.removeEventListener('pointerdown', onDown, true);
      foundation.removeEventListener('pointerup', onUp, true);
      bar.remove();
    },
  };
}
