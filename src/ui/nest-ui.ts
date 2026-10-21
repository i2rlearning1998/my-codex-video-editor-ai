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
  type Project,
  type TimedClip,
} from '../core';
import { t } from '../i18n';

import {
  flattenNested,
  innerToOuter,
  MAX_NEST_DEPTH,
  nestClips,
  nestedAnchor,
  nestedTimeAt,
  unpackPath,
} from '../nesting';
import type { NestEngine } from './nest-engine';
import { iconSvg } from './icons';
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
 * FIX1 F6: the breadcrumb bar above the timeline ("Main timeline › <nest>"
 * with Back to main timeline) and the double-click that opens a nested
 * clip. Inside, the whole editor shows the nested clip's real lanes and
 * clips (createNestEngine); the playhead is mapped into the nest's own time
 * and back on leaving. Esc with nothing selected leaves one level.
 */
export function mountNestBar(
  section: HTMLElement,
  foundation: HTMLElement,
  engine: NestEngine,
  session: EditorSession,
  report: (error: unknown) => void,
) {
  const bar = document.createElement('nav');
  bar.className = 'nest-bar';
  bar.id = 'nest-bar';
  bar.hidden = true;
  bar.setAttribute('aria-label', t('nest.breadcrumb'));
  section.insertBefore(bar, foundation);
  let rendered = '';

  /** The nested clip of `path[depth]` and the project that holds it. */
  const levelClip = (path: readonly string[], depth: number) => {
    const real = engine.real;
    const compositionId =
      engine.nest?.compositionId ?? session.source.composition.id;
    const holder =
      depth === 0
        ? (real.state as unknown as Project)
        : unpackPath(real.state, compositionId, path.slice(0, depth)).at(-1)!;
    const composition = holder.compositions.find(
      (c) => c.id === compositionId,
    )!;
    const found = findClipByLayer(
      composition as unknown as Parameters<typeof findClipByLayer>[0],
      path[depth]!,
    );
    const group = composition.layers.find((l) => l.id === path[depth]);
    return found && group
      ? { clip: found.clip as unknown as TimedClip, name: group.name }
      : null;
  };
  /** Outer (main timeline) time → the time inside `path`. */
  const inward = (path: readonly string[], time: number) => {
    let t = time;
    path.forEach((_, depth) => {
      const level = levelClip(path, depth);
      if (level) t = nestedTimeAt(level.clip, t) - nestedAnchor(level.clip);
    });
    return Math.max(0, t);
  };
  /** The time inside `path` → outer (main timeline) time. */
  const outward = (path: readonly string[], time: number) => {
    let t = time;
    for (let depth = path.length - 1; depth >= 0; depth--) {
      const level = levelClip(path, depth);
      if (level) t = innerToOuter(level.clip, t + nestedAnchor(level.clip));
    }
    return Math.max(0, t);
  };
  const go = (path: readonly string[]) => {
    const from = engine.nest?.path ?? [];
    const outer = outward(from, session.currentTime);
    session.setPlaying(false);
    session.select(null);
    if (session.enteredGroupId) session.enterGroup(null);
    const compositionId = session.source.composition.id;
    engine.setNest(path.length ? { compositionId, path } : null);
    session.setCurrentTime(inward(path, outer));
    render();
  };
  const leaveAll = () => {
    const top = engine.nest?.path[0];
    go([]);
    if (top) session.select(top);
  };
  const leaveOne = () => {
    const path = engine.nest?.path ?? [];
    const left = path.at(-1);
    go(path.slice(0, -1));
    if (left) session.select(left);
  };
  const render = () => {
    const nest = engine.nest;
    const path = nest?.path ?? [];
    const names = path.map(
      (_, depth) => levelClip(path, depth)?.name ?? t('nest.name'),
    );
    const key = JSON.stringify([path, names]);
    section.classList.toggle('nest-entered', path.length > 0);
    if (key === rendered) return;
    rendered = key;
    bar.hidden = !path.length;
    if (!path.length) {
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
    names.forEach((name, index) => {
      items.push(sep());
      const last = index === names.length - 1;
      items.push(
        crumb(
          name,
          last
            ? undefined
            : () => {
                try {
                  go(path.slice(0, index + 1));
                } catch (error) {
                  report(error);
                }
              },
        ),
      );
    });
    const exit = document.createElement('button');
    exit.type = 'button';
    exit.className = 'button sm nest-exit';
    exit.dataset.action = 'nest-exit';
    exit.innerHTML = `${iconSvg('back', 16)}<span></span>`;
    exit.querySelector('span')!.textContent = t('nest.backToMain');
    exit.title = `${t('nest.backToMain')} (Esc)`;
    exit.onclick = () => {
      try {
        leaveAll();
      } catch (error) {
        report(error);
      }
    };
    const spacer = document.createElement('span');
    spacer.className = 'nest-spacer';
    bar.replaceChildren(...items, spacer, exit);
  };

  const enter = (layerId: string) => {
    const found = findClipByLayer(session.source.composition, layerId);
    if (!found || !nestedInfo(found.clip)) throw new Error(t('nest.notNested'));
    const path = [...(engine.nest?.path ?? []), layerId];
    if (path.length > MAX_NEST_DEPTH) throw new Error(t('nest.tooDeep'));
    go(path);
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
  // Esc with nothing selected (and no menu, dialog or field open) leaves
  // one level. Capture phase: the first Esc still clears the selection.
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !engine.nest) return;
    if (session.selectedIds.length) return;
    if (
      document.querySelector(
        '.modal-backdrop, .popover, [role="menu"]:not([hidden])',
      )
    )
      return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]'))
      return;
    try {
      leaveOne();
    } catch (error) {
      report(error);
    }
  };
  document.addEventListener('keydown', onKey, true);
  const offEngine = engine.on('state:changed', () => render());
  return {
    enter,
    leaveAll,
    get state() {
      return engine.nest;
    },
    dispose() {
      offEngine();
      document.removeEventListener('keydown', onKey, true);
      foundation.removeEventListener('pointerdown', onDown, true);
      foundation.removeEventListener('pointerup', onUp, true);
      bar.remove();
    },
  };
}
