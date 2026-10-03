// J12: the Transition panel for one cut (the clip a transition leads into).
// A search field, the transitions in groups as a grid (the built ones live,
// the rest disabled with their wave), a Duration field (default 1 s,
// clamped to what the two clips allow, with a message) and Remove. Each
// change is one undo step through SET_CLIP_TRANSITION.
import {
  DEFAULT_TRANSITION,
  MIN_TRANSITION,
  clipTransition,
  findClip,
  maxTransition,
  previousTouching,
  type Command,
  type EditorEngine,
  type TransitionType,
} from '../core';
import { t } from '../i18n';
import { createNumberField } from './components/number-field';
import { iconSvg } from './icons';
import type { EditorSession } from './session';

interface Entry {
  readonly id: string;
  /** A built transition, or null when it is planned. */
  readonly type: TransitionType | null;
}
const GROUPS: readonly { readonly id: string; readonly items: Entry[] }[] = [
  {
    id: 'fades',
    items: [
      { id: 'crossfade', type: 'crossfade' },
      { id: 'fade-black', type: 'fade-black' },
      { id: 'fade-white', type: 'fade-white' },
      { id: 'blur', type: null },
    ],
  },
  {
    id: 'wipes',
    items: [
      { id: 'wipe-left', type: 'wipe-left' },
      { id: 'wipe-right', type: 'wipe-right' },
      { id: 'wipe-up', type: null },
      { id: 'iris', type: null },
    ],
  },
  {
    id: 'slides',
    items: [
      { id: 'slide-left', type: 'slide-left' },
      { id: 'slide-right', type: 'slide-right' },
      { id: 'push-up', type: null },
    ],
  },
  {
    id: 'cartoon',
    items: [
      { id: 'pop', type: null },
      { id: 'zoom-burst', type: null },
    ],
  },
  {
    id: 'glitch',
    items: [
      { id: 'glitch', type: null },
      { id: 'rgb-split', type: null },
    ],
  },
  {
    id: '3d',
    items: [
      { id: 'flip', type: null },
      { id: 'cube', type: null },
      { id: 'page-turn', type: null },
    ],
  },
];

/** Builds the panel for the cut into `clipId`, or null when it no longer
 *  applies (the clips moved apart or went away). */
export function buildTransitionPanel(
  clipId: string,
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
  state: { query: string },
): HTMLElement | null {
  const composition = session.source.composition;
  const found = findClip(composition, clipId);
  if (!found) return null;
  const clips = found.track.clips as unknown as Parameters<
    typeof previousTouching
  >[0];
  const clip = found.clip as unknown as Parameters<typeof maxTransition>[1] & {
    transitionMetadata: Record<string, unknown>;
  };
  const before = previousTouching(clips, clip);
  if (!before) return null;
  const current = clipTransition(clip);
  const limit = maxTransition(before, clip);
  const run = (
    label: string,
    transition: { type: TransitionType; duration: number } | null,
  ) => {
    try {
      engine.commands.transaction(label, [
        {
          type: 'SET_CLIP_TRANSITION',
          compositionId: composition.id,
          clipId,
          transition,
        } as Command,
      ]);
    } catch (error) {
      report(error);
    }
  };
  const root = document.createElement('div');
  root.className = 'transition-panel';
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'transition-search';
  search.placeholder = t('transition.search');
  search.setAttribute('aria-label', t('transition.search'));
  search.value = state.query;
  const groups = document.createElement('div');
  groups.className = 'transition-groups';
  const draw = () => {
    const query = search.value.trim().toLowerCase();
    groups.replaceChildren();
    for (const group of GROUPS) {
      const items = group.items.filter((item) =>
        t(`transition.type.${item.id}`).toLowerCase().includes(query),
      );
      if (!items.length) continue;
      const section = document.createElement('section');
      section.className = 'transition-group';
      section.dataset.group = group.id;
      const title = document.createElement('h4');
      title.textContent = t(`transition.group.${group.id}`);
      const grid = document.createElement('div');
      grid.className = 'transition-grid';
      grid.setAttribute('role', 'group');
      grid.setAttribute('aria-label', title.textContent);
      for (const item of items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'transition-option';
        button.dataset.transition = item.id;
        const name = t(`transition.type.${item.id}`);
        button.innerHTML = `<span class="transition-preview" data-kind="${item.id}">${iconSvg('transitions', 18)}</span><span></span>`;
        button.lastElementChild!.textContent = name;
        if (!item.type) {
          button.setAttribute('aria-disabled', 'true');
          button.title = t('transition.planned');
        } else {
          button.title = name;
          button.setAttribute(
            'aria-pressed',
            String(current?.type === item.type),
          );
          const type = item.type;
          button.onclick = () =>
            run(current ? 'Change transition' : 'Add transition', {
              type,
              duration: Math.min(
                current?.duration ?? DEFAULT_TRANSITION,
                limit,
              ),
            });
        }
        grid.append(button);
      }
      section.append(title, grid);
      groups.append(section);
    }
    if (!groups.childElementCount) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = t('transition.none');
      groups.append(empty);
    }
  };
  search.oninput = () => {
    state.query = search.value;
    draw();
  };
  draw();
  const duration = createNumberField({
    id: 'transition-duration',
    label: t('transition.duration'),
    value: Math.round((current?.duration ?? DEFAULT_TRANSITION) * 100) / 100,
    unit: 's',
    min: MIN_TRANSITION,
    max: Math.round(limit * 100) / 100,
    step: 0.1,
    decimals: 2,
    slider: true,
    disabled: !current,
    onCommit: (value) => {
      if (current && value !== current.duration)
        run('Transition duration', { type: current.type, duration: value });
    },
    onInvalid: (message) => report(new RangeError(message)),
  });
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'transition-remove';
  remove.dataset.action = 'transition-remove';
  remove.textContent = t('transition.remove');
  remove.disabled = !current;
  remove.onclick = () => run('Remove transition', null);
  root.append(search, groups, duration, remove);
  return root;
}
