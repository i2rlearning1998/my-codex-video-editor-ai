// H4: the right panel (Clipchamp). I4: an always-visible icon rail with
// tabs per selection. The first tab is named after what is selected
// (Canvas, Shape, Text, Image, Video, Audio, Group or Arrange) and holds its
// controls as accordions; the Inspector's Position and size, Timing and
// Details follow it as collapsed accordions. Animate, Speed, Audio, Fade and
// Adjust colors edit the selection; tabs whose systems are not built are
// shown disabled and name their wave. The controls are the toolbar's own
// builders (one implementation), so values, ratio lock and the 2D Animation
// rules (guardCommands) are shared.
import { buildTransitionPanel } from './transition-panel';
import { resolvedTextStyle } from './text-editor';
import {
  clipAnimation,
  clipTimeEffects,
  type Command,
  type EditorEngine,
  MAX_CLIP_SPEED,
  MIN_CLIP_SPEED,
} from '../core';
import { formatNumber, t } from '../i18n';
import { drawingOf } from '../render/drawing';
import { SYSTEM_FONTS, TEXT_ALIGNS, textStyleOf } from '../render/text-style';
import { alignSelection, canDistribute, distributeSelection } from './align';
import {
  colorCommand,
  fontSizeCommand,
  textStyleCommands,
} from './context-toolbar';
import { createColorField } from './components/color-picker';
import { createNumberField } from './components/number-field';
import { createSelect } from './components/select';
import {
  contextActions,
  performEdit,
  selectedClips,
  setClipSpeed,
  SPEED_PRESETS,
} from './editing';
import { guardCommands } from './editor-mode';
import { iconSvg } from './icons';
import { documentColors } from './palette';
import { audioTab } from './right-panel/audio-tab';
import { sceneLengthCommands } from './scene-length';
import { describeSelection, selectionRoots } from './selection-context';
import type { EditorSession } from './session';
import { BOOLEAN_OPS, canCombine, combineShapes } from './shapes';

export const RIGHT_SECTIONS = [
  'Properties',
  'Speed',
  'Audio',
  'Fade',
  'Animate',
  'Effects',
  'Adjust',
  'Filters',
  'Captions',
  'Transitions',
] as const;
export type RightSection = (typeof RIGHT_SECTIONS)[number];
export const RIGHT_ICONS: Record<RightSection, string> = {
  Properties: 'properties',
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
/** Tabs not built yet: their ledger item and wave. J15: Filters and
 *  Effects open, listing what they will hold; Transitions is the J12 panel
 *  for a clip (it stays planned for the canvas). */
const PLANNED: Partial<Record<RightSection, readonly [string, number]>> = {
  Captions: ['TXT-035', 8],
};

export type SelectionKind =
  | 'none'
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'shape'
  | 'drawing'
  | 'group'
  | 'multi';
export function kindOf(session: EditorSession): SelectionKind {
  const roots = selectionRoots(session.source, session.selectedIds);
  if (!roots.length) return 'none';
  if (roots.length > 1) return 'multi';
  const layer = roots[0]!;
  if (layer.type === 'shape') return drawingOf(layer) ? 'drawing' : 'shape';
  return layer.type as SelectionKind;
}
/** The first tab's name for the selection. */
export const firstTabKey = (kind: SelectionKind) =>
  // J15: a picture's own controls, the Inspector and Animate are Advanced,
  // after the Clipchamp sections.
  kind === 'video' || kind === 'image'
    ? 'right.tab.advanced'
    : `right.tab.${kind === 'none' ? 'canvas' : kind === 'multi' ? 'arrange' : kind}`;
/** J15: the rail's sections per selection, in rail order (Clipchamp). */
const TABS: Record<SelectionKind, RightSection[]> = {
  // U5: nothing selected has no panel (the canvas bar holds the canvas).
  none: [],
  text: ['Properties', 'Animate', 'Effects', 'Adjust'],
  image: [
    'Fade',
    'Animate',
    'Filters',
    'Effects',
    'Adjust',
    'Transitions',
    'Properties',
  ],
  video: [
    'Captions',
    'Audio',
    'Fade',
    'Animate',
    'Filters',
    'Effects',
    'Adjust',
    'Speed',
    'Transitions',
    'Properties',
  ],
  audio: ['Properties', 'Speed', 'Fade'],
  shape: ['Properties', 'Animate', 'Effects', 'Adjust'],
  drawing: ['Properties', 'Animate', 'Effects', 'Adjust'],
  group: ['Properties', 'Animate'],
  multi: ['Properties'],
};
/** The tabs the rail shows for the current selection. */
export function sectionsFor(session: EditorSession): RightSection[] {
  return TABS[kindOf(session)];
}
/**
 * A shown tab that cannot be used yet: its ledger item and wave. Audio fades
 * wait for the audio engine (AUD-003, Wave 7); a video's Fade is the visual
 * fade preset and works.
 */
export function plannedSection(
  section: RightSection,
  session?: EditorSession,
): readonly [string, number] | undefined {
  if (section === 'Fade' && session && kindOf(session) === 'audio')
    return ['AUD-003', 7];
  if (section === 'Transitions' && (!session || kindOf(session) === 'none'))
    return ['TR-001', 6];
  return PLANNED[section];
}

const ALIGN_ICONS = {
  left: 'alignLeft',
  center: 'alignCenter',
  right: 'alignRight',
  top: 'arrowUp',
  middle: 'minus',
  bottom: 'arrowDown',
} as const;
/** Accordions remember being open or folded for the session. */
const folded = new Set<string>();

export interface RightPanelHooks {
  /** U5: the Animate tab's presets (the former left Animate panel). */
  animateBody?: () => HTMLElement;
  crop?: () => void;
  /** The toolbar's popover contents, for the same controls here. */
  build?: (
    id:
      | 'transparency'
      | 'flip'
      | 'corners'
      | 'stroke'
      | 'border'
      | 'spacing'
      | 'canvas-size',
  ) => HTMLElement | null;
}

export function mountRightPanel(
  host: HTMLElement,
  engine: EditorEngine,
  session: EditorSession,
  report: (error: unknown) => void,
  hooks: RightPanelHooks = {},
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
  /** One accordion: a header that folds its body (open by default). */
  const accordion = (
    id: string,
    title: string,
    content: readonly (HTMLElement | null | undefined)[],
  ) => {
    const section = document.createElement('section');
    section.className = 'right-accordion';
    section.dataset.accordion = id;
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'right-accordion-head';
    head.dataset.accordionToggle = id;
    const open = !folded.has(id);
    head.setAttribute('aria-expanded', String(open));
    head.innerHTML = `<span></span>${iconSvg(open ? 'chevronDown' : 'chevronRight', 14)}`;
    head.querySelector('span')!.textContent = title;
    const body = document.createElement('div');
    body.className = 'right-accordion-body';
    body.hidden = !open;
    body.append(...content.filter((item): item is HTMLElement => !!item));
    head.onclick = () => {
      if (folded.has(id)) folded.delete(id);
      else folded.add(id);
      const now = !folded.has(id);
      head.setAttribute('aria-expanded', String(now));
      head.querySelector('svg')!.outerHTML = iconSvg(
        now ? 'chevronDown' : 'chevronRight',
        14,
      );
      body.hidden = !now;
    };
    section.append(head, body);
    return section;
  };
  const single = () => {
    const roots = selectionRoots(session.source, session.selectedIds);
    return roots.length === 1 ? roots[0]! : null;
  };
  const button = (
    id: string,
    icon: string,
    label: string,
    action: (() => void) | null,
    options: { pressed?: boolean; reason?: string } = {},
  ) => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'button sm right-button';
    item.dataset.action = id;
    item.innerHTML = `${iconSvg(icon, 16)}<span></span>`;
    item.querySelector('span')!.textContent = label;
    item.title = options.reason ?? label;
    if (options.pressed !== undefined)
      item.setAttribute('aria-pressed', String(options.pressed));
    if (!action) item.setAttribute('aria-disabled', 'true');
    else item.onclick = () => safely(action);
    return item;
  };
  const row = (...items: HTMLElement[]) => {
    const wrap = document.createElement('div');
    wrap.className = 'right-button-row';
    wrap.append(...items);
    return wrap;
  };
  const colorField = (id: string) => {
    const layer = single();
    if (!layer) return null;
    const key = drawingOf(layer) ? 'stroke' : 'fill';
    const property = layer.properties[key];
    return createColorField({
      id,
      label: t('toolbar.color'),
      value:
        property?.type === 'color' ? property.value.slice(0, 7) : '#000000',
      documentColors: () => documentColors(session.source.composition),
      onCommit: (next) =>
        safely(() =>
          run('Set color', [
            colorCommand(
              session.source.composition.id,
              single() ?? layer,
              next,
              session.currentTime,
            ),
          ]),
        ),
    });
  };

  // --- First tab, per selection ---------------------------------------------
  const canvasTab = () => {
    const composition = session.source.composition;
    return [
      accordion('canvas-size', t('right.size'), [hooks.build?.('canvas-size')]),
      accordion('canvas-background', t('toolbar.canvasBackground'), [
        createColorField({
          id: 'right-canvas-background',
          label: t('toolbar.canvasBackground'),
          value: session.source.background.slice(0, 7),
          documentColors: () => documentColors(composition),
          onCommit: (color) =>
            safely(() =>
              run('Set background', [
                {
                  type: 'SET_COMPOSITION_BACKGROUND',
                  compositionId: session.source.composition.id,
                  color,
                } as Command,
              ]),
            ),
        }),
      ]),
      accordion('scene-length', t('scene.length'), [
        createNumberField({
          id: 'right-scene-length',
          label: t('scene.length'),
          value: Math.round(composition.duration * 100) / 100,
          unit: 's',
          min: 0.1,
          max: 3600,
          decimals: 2,
          step: 0.1,
          presets: [3, 5, 10, 15, 30],
          onCommit: (value) =>
            safely(() =>
              run(
                'Set scene length',
                sceneLengthCommands(session.source, value),
              ),
            ),
        }),
      ]),
    ];
  };
  const shapeTab = (drawing: boolean) => {
    const ids = session.selectedIds;
    const combine = canCombine(session.source, ids);
    return [
      accordion('shape-color', t(drawing ? 'right.ink' : 'panel.color'), [
        colorField('right-color'),
      ]),
      drawing
        ? null
        : accordion('shape-outline', t('right.outline'), [
            hooks.build?.('stroke'),
          ]),
      drawing
        ? null
        : accordion('shape-corners', t('toolbar.corners'), [
            hooks.build?.('corners'),
          ]),
      drawing
        ? null
        : accordion('shape-combine', t('toolbar.boolean'), [
            row(
              ...BOOLEAN_OPS.map((op) =>
                button(
                  `right-combine-${op}`,
                  'combine',
                  t(`command.${op}`),
                  combine ? () => combineShapes(engine, session, op) : null,
                  combine ? {} : { reason: t('shape.combineHint') },
                ),
              ),
            ),
          ]),
    ];
  };
  const textTab = () => {
    const layer = single();
    if (!layer || layer.type !== 'text') return [];
    const style = textStyleOf(layer);
    const look = resolvedTextStyle(layer);
    const compositionId = session.source.composition.id;
    const styleRun = (
      label: string,
      key: Parameters<typeof textStyleCommands>[2],
      value: number | string,
    ) =>
      safely(() =>
        run(
          label,
          textStyleCommands(compositionId, single() ?? layer, key, value),
        ),
      );
    const size = layer.properties.fontSize;
    const decoration = (underline: boolean, strike: boolean) =>
      underline && strike
        ? 'underline line-through'
        : underline
          ? 'underline'
          : strike
            ? 'line-through'
            : 'none';
    return [
      accordion('text-text', t('right.tab.text'), [
        createSelect({
          id: 'right-font',
          label: t('toolbar.font'),
          value: style.family,
          options: SYSTEM_FONTS.map(([name]) => ({
            value: name,
            label: name,
            font: name,
          })),
          onChange: (value) => styleRun('Set font', 'fontFamily', value),
        }),
        createNumberField({
          id: 'right-font-size',
          label: t('toolbar.size'),
          value: size?.type === 'number' ? size.value : 32,
          unit: 'px',
          min: 1,
          max: 4096,
          decimals: 0,
          presets: [12, 16, 24, 32, 48, 64, 96, 128],
          onCommit: (value) =>
            safely(() =>
              run('Set font size', [
                fontSizeCommand(
                  compositionId,
                  single() ?? layer,
                  value,
                  session.currentTime,
                ),
              ]),
            ),
        }),
        row(
          button(
            'right-bold',
            'bold',
            t('toolbar.bold'),
            () =>
              styleRun(
                'Set bold',
                'fontWeight',
                (look.weight ?? 0) >= 700 ? 400 : 700,
              ),
            // J5: the resolved weight (runs included) decides.
            { pressed: (look.weight ?? 0) >= 700 },
          ),
          button(
            'right-italic',
            'italic',
            t('toolbar.italic'),
            () =>
              styleRun(
                'Set italic',
                'fontStyle',
                style.italic ? 'normal' : 'italic',
              ),
            { pressed: style.italic },
          ),
          button(
            'right-underline',
            'underline',
            t('toolbar.underline'),
            () =>
              styleRun(
                'Set underline',
                'textDecoration',
                decoration(!style.underline, style.strike),
              ),
            { pressed: style.underline },
          ),
          button(
            'right-strike',
            'strike',
            t('toolbar.strike'),
            () =>
              styleRun(
                'Set strikethrough',
                'textDecoration',
                decoration(style.underline, !style.strike),
              ),
            { pressed: style.strike },
          ),
          button(
            'right-uppercase',
            'uppercase',
            t('toolbar.uppercase'),
            () =>
              styleRun(
                'Set case',
                'textCase',
                style.textCase === 'upper' ? 'none' : 'upper',
              ),
            { pressed: style.textCase === 'upper' },
          ),
        ),
        createSelect({
          id: 'right-align',
          label: t('toolbar.textAlign'),
          value: style.align,
          options: TEXT_ALIGNS.map((align) => ({
            value: align,
            label: t(`text.align.${align}`),
          })),
          onChange: (value) => styleRun('Set alignment', 'textAlign', value),
        }),
        colorField('right-color'),
      ]),
      accordion('text-spacing', t('toolbar.advanced'), [
        hooks.build?.('spacing'),
      ]),
    ];
  };
  const pictureTab = (video: boolean) => {
    return [
      heading(t('right.tab.advanced'), t('right.advancedHint')),
      accordion(
        video ? 'video-video' : 'image-image',
        t(video ? 'right.tab.video' : 'right.tab.image'),
        [
          row(
            button('right-crop', 'crop', t('toolbar.crop'), hooks.crop ?? null),
          ),
          hooks.build?.('flip'),
          hooks.build?.('corners'),
          video ? null : hooks.build?.('border'),
        ],
      ),
    ];
  };
  const groupTab = () => {
    const actions = contextActions(
      session.source,
      session.selectedIds,
      session.currentTime,
    );
    const can = (action: 'group' | 'ungroup') =>
      actions.some((entry) => entry === action);
    const alignRow = row(
      ...(['left', 'center', 'right', 'top', 'middle', 'bottom'] as const).map(
        (edge) =>
          button(
            `right-align-${edge}`,
            ALIGN_ICONS[edge],
            t(`command.align${edge[0]!.toUpperCase()}${edge.slice(1)}`),
            () => alignSelection(engine, session, edge),
          ),
      ),
    );
    const multi = session.selectedIds.length > 1;
    return [
      accordion(
        multi ? 'arrange-arrange' : 'group-group',
        t(multi ? 'right.tab.arrange' : 'right.tab.group'),
        [
          row(
            button(
              'right-group',
              'group',
              t('command.group'),
              can('group') ? () => performEdit(engine, session, 'group') : null,
            ),
            button(
              'right-ungroup',
              'ungroup',
              t('command.ungroup'),
              can('ungroup')
                ? () => performEdit(engine, session, 'ungroup')
                : null,
            ),
          ),
        ],
      ),
      accordion(multi ? 'arrange-align' : 'group-align', t('command.align'), [
        alignRow,
        multi
          ? row(
              ...(['horizontal', 'vertical'] as const).map((axis) =>
                button(
                  `right-distribute-${axis}`,
                  'spacing',
                  t(
                    `command.distribute${axis[0]!.toUpperCase()}${axis.slice(1)}`,
                  ),
                  canDistribute(session)
                    ? () => distributeSelection(engine, session, axis)
                    : null,
                ),
              ),
            )
          : null,
      ]),
    ];
  };
  const firstTab = () => {
    const kind = kindOf(session);
    switch (kind) {
      case 'none':
        return canvasTab();
      case 'shape':
        return shapeTab(false);
      case 'drawing':
        return shapeTab(true);
      case 'text':
        return textTab();
      case 'image':
        return pictureTab(false);
      case 'video':
        return pictureTab(true);
      case 'audio':
        return [
          accordion(
            'audio-audio',
            t('right.tab.audio'),
            audioTab(engine, session, run, report),
          ),
        ];
      default:
        return groupTab();
    }
  };

  // --- Other tabs --------------------------------------------------------------
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
    // J15: a slider on a log scale from 0.1x to 16x with ticks at 0.1, 1,
    // 2, 4 and 16; it commits on release (one step).
    const LOW = Math.log10(MIN_CLIP_SPEED),
      HIGH = Math.log10(MAX_CLIP_SPEED);
    const toPosition = (value: number) =>
      Math.round(((Math.log10(value) - LOW) / (HIGH - LOW)) * 1000);
    const toSpeed = (position: number) =>
      Math.round(10 ** (LOW + (position / 1000) * (HIGH - LOW)) * 100) / 100;
    const slider = document.createElement('div');
    slider.className = 'right-speed-slider';
    const range = document.createElement('input');
    range.type = 'range';
    range.id = 'right-speed-slider';
    range.min = '0';
    range.max = '1000';
    range.step = '1';
    range.value = String(toPosition(current));
    range.setAttribute('aria-label', t('panel.speed'));
    const readout = document.createElement('output');
    readout.htmlFor.add(range.id);
    const show = (value: number) => {
      const text = t('clip.speedValue', { speed: formatNumber(value) });
      readout.textContent = text;
      range.setAttribute('aria-valuetext', text);
    };
    show(current);
    range.oninput = () => show(toSpeed(Number(range.value)));
    range.onchange = () =>
      safely(() => setClipSpeed(engine, session, toSpeed(Number(range.value))));
    const ticks = document.createElement('div');
    ticks.className = 'right-speed-ticks';
    ticks.setAttribute('aria-hidden', 'true');
    for (const tick of [0.1, 1, 2, 4, 16]) {
      const mark = document.createElement('span');
      mark.dataset.tick = String(tick);
      mark.style.insetInlineStart = `${toPosition(tick) / 10}%`;
      mark.textContent = t('clip.speedValue', { speed: formatNumber(tick) });
      ticks.append(mark);
    }
    slider.append(range, readout, ticks);
    return [
      heading(t('panel.speed'), t('right.speedHint')),
      slider,
      list,
      toggle('reverse'),
      toggle('freeze'),
    ];
  };
  const animate = () => {
    // U5: the Animate tab holds the In, Out, Loop (and Ken Burns) presets
    // with their durations; it replaced the left Animate side panel.
    const keyframes = document.createElement('button');
    keyframes.type = 'button';
    keyframes.className = 'secondary';
    keyframes.dataset.action = 'right-open-2d';
    keyframes.textContent = t('mode.open2d');
    keyframes.hidden = session.mode === 'animation2d';
    keyframes.onclick = () => session.setMode('animation2d');
    const clips = selectedClips(session.source, session.selectedIds);
    return [
      heading(t('panel.animate'), t('right.animateHint')),
      clips.length === 1
        ? (hooks.animateBody?.() ?? null)
        : plannedNoteText(t('right.fadeNeedsClip')),
      keyframes,
    ];
  };
  /** Adjust colors: Transparency works; the colour controls wait for W6. */
  const adjust = () => {
    const planned = (key: string, id: string) => {
      // J3: the shared NumberField with its slider, disabled until Wave 6.
      const item = createNumberField({
        id: `right-adjust-${key}`,
        label: t(`right.adjust.${key}`),
        value: 0,
        min: -100,
        max: 100,
        decimals: 0,
        slider: true,
        disabled: true,
        className: 'right-row right-row-planned',
        onCommit: () => undefined,
      });
      item.title = t('toolbar.later', { wave: '6', id });
      return item;
    };
    const blend = createSelect({
      id: 'right-blend-mode',
      label: t('right.adjust.blend'),
      value: 'normal',
      options: [{ value: 'normal', label: t('right.adjust.normal') }],
      disabled: true,
      onChange: () => undefined,
    });
    blend.title = t('toolbar.later', { wave: '6', id: 'MSK-001' });
    return [
      heading(t('panel.adjust'), t('right.adjustHint')),
      accordion('adjust-transparency', t('toolbar.transparency'), [
        hooks.build?.('transparency'),
      ]),
      accordion('adjust-colors', t('right.adjust.colors'), [
        planned('exposure', 'CLR-001'),
        planned('contrast', 'CLR-001'),
        planned('saturation', 'CLR-001'),
        planned('temperature', 'CLR-001'),
        blend,
        button('right-adjust-reset', 'undo', t('right.adjust.reset'), null, {
          reason: t('toolbar.later', { wave: '6', id: 'CLR-001' }),
        }),
      ]),
    ];
  };
  const planned = (section: RightSection) => {
    const [id, wave] = plannedSection(section, session)!;
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
  // --- J15 sections -----------------------------------------------------------
  const plannedNote = (wave: string, id: string) => {
    const tag = document.createElement('span');
    tag.className = 'quiet-tag';
    tag.textContent = t('toolbar.later', { wave, id });
    return tag;
  };
  /** A grid of choices; planned ones are disabled and name their wave. */
  const choiceGrid = (
    name: string,
    items: readonly {
      id: string;
      label: string;
      pressed?: boolean;
      action?: () => void;
      planned?: readonly [string, string];
    }[],
  ) => {
    const grid = document.createElement('div');
    grid.className = 'right-choice-grid';
    grid.setAttribute('role', 'group');
    grid.setAttribute('aria-label', name);
    for (const item of items) {
      const choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'right-choice';
      choice.dataset.choice = item.id;
      choice.innerHTML = `<span class="right-choice-preview" data-preview="${item.id}"></span><span></span>`;
      choice.lastElementChild!.textContent = item.label;
      if (item.pressed !== undefined)
        choice.setAttribute('aria-pressed', String(item.pressed));
      if (item.planned) {
        choice.setAttribute('aria-disabled', 'true');
        choice.title = t('toolbar.later', {
          wave: item.planned[0],
          id: item.planned[1],
        });
      } else {
        choice.title = item.label;
        if (item.action) {
          const action = item.action;
          choice.onclick = () => safely(action);
        }
      }
      grid.append(choice);
    }
    return grid;
  };
  /** Disabled settings of a planned effect (the shared NumberField). */
  const plannedFields = (
    id: string,
    fields: readonly (readonly [string, number, number])[],
    wave: string,
    ledger: string,
  ) =>
    fields.map(([key, min, max]) => {
      const field = createNumberField({
        id: `right-${id}-${key}`,
        label: t(`right.effect.${key}`),
        value: 0,
        min,
        max,
        decimals: 0,
        slider: true,
        disabled: true,
        className: 'right-row right-row-planned',
        onCommit: () => undefined,
      });
      field.title = t('toolbar.later', { wave, id: ledger });
      return field;
    });
  const FILTERS = [
    'original',
    'vintage',
    'mono',
    'warm',
    'cool',
    'vivid',
    'noir',
    'dream',
  ] as const;
  const filters = () => [
    heading(t('panel.filters'), t('right.filtersHint')),
    choiceGrid(
      t('panel.filters'),
      FILTERS.map((id) =>
        id === 'original'
          ? { id, label: t(`right.filter.${id}`), pressed: true }
          : {
              id,
              label: t(`right.filter.${id}`),
              planned: ['6', 'FX-004'] as const,
            },
      ),
    ),
    ...plannedFields('filter', [['intensity', 0, 100]], '6', 'FX-004'),
  ];
  const SHADOW: readonly (readonly [string, number, number])[] = [
    ['blur', 0, 100],
    ['distance', 0, 100],
    ['angle', -180, 180],
  ];
  const effects = () => {
    const kind = kindOf(session);
    if (kind === 'video' || kind === 'image')
      return [
        heading(t('panel.effects'), t('right.effectsHint')),
        choiceGrid(
          t('panel.effects'),
          ['blur', 'glow', 'vignette', 'chroma', 'pixelate', 'grain'].map(
            (id) => ({
              id,
              label: t(`right.effect.${id}`),
              planned: ['6', 'FX-001'] as const,
            }),
          ),
        ),
      ];
    // Shapes: the outline is the stroke (live); shadows are planned. Text
    // outline and shadow come with the text effects (TXT-019, Wave 3).
    const [wave, ledger] = kind === 'text' ? ['3', 'TXT-019'] : ['6', 'FX-001'];
    return [
      heading(t('panel.effects'), t('right.effectsHint')),
      accordion(
        `${kind}-effect-outline`,
        t('right.outline'),
        kind === 'shape'
          ? [hooks.build?.('stroke')]
          : [plannedNote(wave, ledger)],
      ),
      accordion(`${kind}-effect-shadow`, t('right.effect.shadow'), [
        ...plannedFields('shadow', SHADOW, wave, ledger),
      ]),
    ];
  };
  const transitionState = { query: '' };
  /** J15: the transition into the selected clip (the J12 panel). */
  const transitions = () => {
    const clips = selectedClips(session.source, session.selectedIds);
    const panel =
      clips.length === 1
        ? buildTransitionPanel(
            clips[0]!.clip.id,
            engine,
            session,
            report,
            transitionState,
          )
        : null;
    return [
      heading(t('panel.transitions'), t('right.transitionHint')),
      panel ?? plannedNoteText(t('right.transitionNeedsCut')),
    ];
  };
  const plannedNoteText = (text: string) => {
    const p = document.createElement('p');
    p.className = 'right-note';
    p.textContent = text;
    return p;
  };

  return {
    render(section: RightSection) {
      host.dataset.section = section;
      host.dataset.kind = kindOf(session);
      const content =
        section === 'Properties'
          ? firstTab()
          : plannedSection(section, session)
            ? planned(section)
            : section === 'Fade'
              ? fade()
              : section === 'Speed'
                ? speed()
                : section === 'Animate'
                  ? animate()
                  : section === 'Adjust'
                    ? adjust()
                    : section === 'Filters'
                      ? filters()
                      : section === 'Effects'
                        ? effects()
                        : section === 'Transitions'
                          ? transitions()
                          : section === 'Audio'
                            ? [
                                heading(t('panel.audio'), t('right.audioHint')),
                                ...audioTab(engine, session, run, report),
                              ]
                            : [];
      host.replaceChildren(
        ...content.filter((item): item is HTMLElement => !!item),
      );
    },
  };
}
