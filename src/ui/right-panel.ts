// H4: the right panel (Clipchamp). An icon rail lists the sections that fit
// the selection; Properties is the Inspector, Color, Fade and Speed edit the
// selection, Animate opens the Animate panel, and the sections whose systems
// are not built say which wave builds them.
import {
  clipAnimation,
  clipTimeEffects,
  type Command,
  type EditorEngine,
} from '../core';
import { formatNumber, t } from '../i18n';
import { drawingOf } from '../render/drawing';
import { colorCommand } from './context-toolbar';
import { createColorField } from './components/color-picker';
import { createNumberField } from './components/number-field';
import {
  performEdit,
  selectedClips,
  setClipSpeed,
  SPEED_PRESETS,
} from './editing';
import { guardCommands } from './editor-mode';
import { iconSvg } from './icons';
import { documentColors } from './palette';
import { describeSelection, selectionRoots } from './selection-context';
import type { EditorSession } from './session';

export const RIGHT_SECTIONS = [
  'Properties',
  'Color',
  'Fade',
  'Speed',
  'Animate',
  'Filters',
  'Effects',
  'Adjust',
  'Audio',
  'Captions',
  'Transitions',
] as const;
export type RightSection = (typeof RIGHT_SECTIONS)[number];
export const RIGHT_ICONS: Record<RightSection, string> = {
  Properties: 'properties',
  Color: 'color',
  Fade: 'transparency',
  Speed: 'speed',
  Animate: 'animate',
  Filters: 'effects',
  Effects: 'magic',
  Adjust: 'adjust',
  Audio: 'audio',
  Captions: 'captions',
  Transitions: 'transitions',
};
/** Sections not built yet: their ledger item and wave. */
const PLANNED: Partial<Record<RightSection, readonly [string, number]>> = {
  Filters: ['FX-004', 6],
  Effects: ['FX-001', 6],
  Adjust: ['CLR-001', 6],
  Audio: ['AUD-002', 7],
  Captions: ['TXT-035', 8],
  Transitions: ['TR-001', 6],
};

type Kind =
  | 'none'
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'shape'
  | 'drawing'
  | 'group'
  | 'multi';
function kindOf(session: EditorSession): Kind {
  const roots = selectionRoots(session.source, session.selectedIds);
  if (!roots.length) return 'none';
  if (roots.length > 1) return 'multi';
  const layer = roots[0]!;
  if (layer.type === 'shape') return drawingOf(layer) ? 'drawing' : 'shape';
  return layer.type as Kind;
}
/** The sections the rail shows for the current selection (Clipchamp). */
export function sectionsFor(session: EditorSession): RightSection[] {
  switch (kindOf(session)) {
    case 'none':
      return ['Properties'];
    case 'text':
      return ['Properties', 'Color', 'Fade', 'Effects', 'Animate'];
    case 'image':
      return [
        'Properties',
        'Fade',
        'Filters',
        'Effects',
        'Adjust',
        'Animate',
        'Transitions',
      ];
    case 'video':
      return [
        'Properties',
        'Captions',
        'Audio',
        'Fade',
        'Filters',
        'Effects',
        'Adjust',
        'Speed',
        'Animate',
        'Transitions',
      ];
    case 'audio':
      return ['Properties', 'Audio', 'Fade', 'Speed'];
    case 'shape':
    case 'drawing':
      return ['Properties', 'Color', 'Fade', 'Animate'];
    default:
      return ['Properties', 'Fade', 'Animate'];
  }
}
export const plannedSection = (section: RightSection) => PLANNED[section];

export function mountRightPanel(
  host: HTMLElement,
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
  hooks: { animate?: () => void } = {},
) {
  host.classList.add('right-section');
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      report(error);
    }
  };
  const run = (label: string, commands: (Command | null)[]) => {
    const list = commands.filter((command): command is Command => !!command);
    guardCommands(session, list);
    if (list.length) engine.commands.transaction(label, list);
  };
  const heading = (title: string, hint?: string) => {
    const wrap = document.createElement('header');
    wrap.className = 'right-section-header';
    const h = document.createElement('h3');
    h.textContent = title;
    wrap.append(h);
    if (hint) {
      const p = document.createElement('p');
      p.textContent = hint;
      wrap.append(p);
    }
    return wrap;
  };
  const color = () => {
    const roots = selectionRoots(session.source, session.selectedIds);
    const layer = roots.length === 1 ? roots[0]! : null;
    if (!layer) return [];
    const drawing = !!drawingOf(layer);
    const key = drawing ? 'stroke' : 'fill';
    const property = layer.properties[key];
    const value =
      property?.type === 'color' ? property.value.slice(0, 7) : '#000000';
    return [
      heading(t('panel.color'), t('right.colorHint')),
      createColorField({
        id: 'right-color',
        label: t('toolbar.color'),
        value,
        documentColors: () => documentColors(session.source.composition),
        onCommit: (next) =>
          safely(() =>
            run('Set color', [
              colorCommand(
                session.source.composition.id,
                layer,
                next,
                session.currentTime,
              ),
            ]),
          ),
      }),
    ];
  };
  const fade = () => {
    const clips = selectedClips(session.source, session.selectedIds);
    if (!clips.length)
      return [heading(t('panel.fade'), t('right.fadeNeedsClip'))];
    const first = clipAnimation(clips[0]!.clip);
    const field = (slot: 'in' | 'out') => {
      const current = first[slot];
      return createNumberField({
        id: `right-fade-${slot}`,
        label: t(slot === 'in' ? 'right.fadeIn' : 'right.fadeOut'),
        value: current?.preset === 'fade' ? current.duration : 0,
        unit: 's',
        decimals: 1,
        step: 0.1,
        min: 0,
        max: 5,
        slider: true,
        presets: [0, 0.5, 1, 2],
        onCommit: (seconds) =>
          safely(() =>
            run(
              slot === 'in' ? 'Fade in' : 'Fade out',
              clips.map(({ clip }) => ({
                type: 'SET_CLIP_ANIMATION',
                compositionId: session.source.composition.id,
                clipId: clip.id,
                slot,
                value:
                  seconds <= 0
                    ? null
                    : { preset: 'fade', duration: Math.max(0.1, seconds) },
              })) as Command[],
            ),
          ),
      });
    };
    return [
      heading(t('panel.fade'), t('right.fadeHint')),
      field('in'),
      field('out'),
    ];
  };
  const speed = () => {
    const clips = selectedClips(session.source, session.selectedIds);
    const selection = describeSelection(session.source, session.selectedIds);
    if (!clips.length || !selection.every('time-effects'))
      return [heading(t('panel.speed'), t('right.speedNeedsClip'))];
    const current = clips[0]!.clip.speed;
    const list = document.createElement('div');
    list.className = 'segmented right-speed';
    list.setAttribute('role', 'radiogroup');
    list.setAttribute('aria-label', t('panel.speed'));
    for (const value of SPEED_PRESETS) {
      const item = document.createElement('button');
      item.type = 'button';
      item.setAttribute('role', 'radio');
      item.dataset.speed = String(value);
      item.setAttribute('aria-checked', String(value === current));
      item.textContent = t('clip.speedValue', { speed: formatNumber(value) });
      item.onclick = () => safely(() => setClipSpeed(engine, session, value));
      list.append(item);
    }
    const toggle = (action: 'reverse' | 'freeze') => {
      const on = clips.every(({ clip }) =>
        action === 'reverse'
          ? clipTimeEffects(clip).reversed
          : clipTimeEffects(clip).freezeFrame !== null,
      );
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'switch-row';
      item.dataset.action = `right-${action}`;
      item.setAttribute('role', 'switch');
      item.setAttribute('aria-checked', String(on));
      item.innerHTML = `${iconSvg(action, 16)}<span></span>`;
      item.querySelector('span')!.textContent = t(
        action === 'reverse' ? 'command.reverse' : 'command.freeze',
      );
      item.onclick = () => safely(() => performEdit(engine, session, action));
      return item;
    };
    return [
      heading(t('panel.speed'), t('right.speedHint')),
      list,
      toggle('reverse'),
      toggle('freeze'),
    ];
  };
  const animate = () => {
    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'primary';
    open.dataset.action = 'right-open-animate';
    open.textContent = t('right.openAnimate');
    open.disabled = !hooks.animate || session.selectedIds.length !== 1;
    open.onclick = () => hooks.animate?.();
    const keyframes = document.createElement('button');
    keyframes.type = 'button';
    keyframes.className = 'secondary';
    keyframes.dataset.action = 'right-open-2d';
    keyframes.textContent = t('mode.open2d');
    keyframes.hidden = session.mode === 'animation2d';
    keyframes.onclick = () => session.setMode('animation2d');
    return [
      heading(t('panel.animate'), t('right.animateHint')),
      open,
      keyframes,
    ];
  };
  const planned = (section: RightSection) => {
    const [id, wave] = PLANNED[section]!;
    const tag = document.createElement('span');
    tag.className = 'quiet-tag';
    tag.textContent = t('toolbar.later', { wave: String(wave), id });
    return [
      heading(
        t(`panel.${section.toLowerCase()}`),
        t(`right.${section.toLowerCase()}Hint`),
      ),
      tag,
    ];
  };
  return {
    render(section: RightSection) {
      host.dataset.section = section;
      const content =
        section === 'Color'
          ? color()
          : section === 'Fade'
            ? fade()
            : section === 'Speed'
              ? speed()
              : section === 'Animate'
                ? animate()
                : PLANNED[section]
                  ? planned(section)
                  : [];
      host.replaceChildren(...content);
    },
  };
}
