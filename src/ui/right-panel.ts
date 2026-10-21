// H4: the right panel (Clipchamp). I4: an always-visible icon rail with
// tabs per selection. The first tab is named after what is selected
// (Canvas, Shape, Text, Image, Video, Audio, Group or Arrange) and holds its
// controls as accordions; the Inspector's Position and size, Timing and
// Details follow it as collapsed accordions. Animate, Speed, Audio, Fade and
// Adjust colors edit the selection; tabs whose systems are not built are
// shown disabled and name their wave. The controls are the toolbar's own
// builders (one implementation), so values, ratio lock and the 2D Animation
// rules (guardCommands) are shared.
import { transitionTiles } from './right-panel/transition-tiles';
import { transitionFocus } from './transition-focus';
import {
  sceneTransitionLimit,
  setSceneTransition,
} from './scene-transition-actions';
import { defaults as fxDefaults, getAdjustment, getEffect } from '../fx';
import { resolvedTextStyle } from './text-editor';
import { textStructureSections } from './text-structure';
import {
  clipAnimation,
  clipFx,
  clipTransition,
  findClipByLayer,
  isNestedClip,
  clipAudioDetached,
  sceneTransitionOf,
  type Transition,
  DEFAULT_TRANSITION,
  findClip,
  maxTransition,
  MIN_TRANSITION,
  previousTouching,
  clipTimeEffects,
  type ClipFx,
  type Command,
  type EditorEngine,
  MAX_CLIP_SPEED,
  MIN_CLIP_SPEED,
} from '../core';
import { formatNumber, t } from '../i18n';
import { drawingOf } from '../render/drawing';
import { SYSTEM_FONTS, TEXT_ALIGNS, textStyleOf } from '../render/text-style';
import { alignSelection, canDistribute, distributeSelection } from './align';
import { flag } from './feature-flags';
import {
  colorCommand,
  tintCommand,
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
import { PIVOT_NAMES, pivotName } from '../core';
import { controlledLayer, hasControls } from './controls-panel';
import { iconSvg } from './icons';
import { documentColors } from './palette';
import { audioCommand, audioTab } from './right-panel/audio-tab';
import {
  editTtsClip,
  ttsPanel,
  ttsState,
  type TtsHooks,
} from './right-panel/tts-panel';
import { readTtsSettings } from '../audio/tts/commands';
import { readAudioSettings, registerAudioCommands } from '../audio/settings';
import type { AudioDecoder } from '../media/audio';
import { locateLayer } from '../render/adapter';
import {
  activePreset,
  applyPreset,
  EFFECT_TILES,
  effectSettings,
  FILTER_PRESETS,
  intensitySlider,
  isFilterEntry,
  presetEntries,
  sampleCanvas,
  selectedEffects,
  tileGrid,
  tileSource,
  toggleEffect,
} from './right-panel/fx-panels';
import { sceneLengthCommands } from './scene-length';
import {
  blendCommand,
  blendControl,
  chromaAccordion,
  masksAccordion,
  type LayerEffectsContext,
} from './right-panel/layer-effects';
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
  'Speech',
  'Code',
  // T1: themes (opened from the rail with nothing selected).
  'Theme',
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
  Speech: 'text',
  Theme: 'color',
  Code: 'code',
};
/** Tabs not built yet: their ledger item and wave. J15: Filters and
 *  Effects open, listing what they will hold; Transitions is the J12 panel
 *  for a clip (it stays planned for the canvas). */
// FINAL2 U9: Captions (Auto Caption) opens the Auto captions dialog.
const PLANNED: Partial<Record<RightSection, readonly [string, number]>> = {};

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
/** FINAL3 A3: the one selected layer is a nested clip. */
export function nestedSelected(session: EditorSession): boolean {
  if (kindOf(session) !== 'group') return false;
  const found = findClipByLayer(
    session.source.composition,
    session.selectedIds[0]!,
  );
  return !!found && isNestedClip(found.clip);
}
/** The first tab's name for the selection. */
export const firstTabKey = (kind: SelectionKind) =>
  `right.tab.${kind === 'none' ? 'canvas' : kind === 'multi' ? 'arrange' : kind}`;
/** V4 (spec 5): the rail's sections per selection, in rail order
 *  (Clipchamp's, with our Properties first). */
const TABS: Record<SelectionKind, RightSection[]> = {
  // U5: nothing selected has no panel (the canvas bar holds the canvas).
  none: [],
  text: ['Properties', 'Animate', 'Effects', 'Adjust'],
  image: ['Properties', 'Fade', 'Filters', 'Effects', 'Adjust', 'Animate'],
  video: [
    'Properties',
    'Fade',
    'Filters',
    'Effects',
    'Adjust',
    'Speed',
    'Audio',
    // (Not in Clipchamp's video rail; kept so the presets stay reachable.)
    'Animate',
    'Captions',
  ],
  // V7 (spec 11.3): an audio clip has no position, size or timing here.
  audio: ['Audio', 'Fade', 'Speed'],
  shape: ['Properties', 'Animate', 'Effects', 'Adjust'],
  drawing: ['Properties', 'Animate', 'Effects', 'Adjust'],
  group: ['Properties', 'Fade', 'Animate'],
  multi: ['Properties', 'Fade', 'Animate'],
};
/**
 * V5 (spec 6): the cut marker whose Transition panel is open (the clip the
 * transition leads into). The rail adds Transition while that clip is the
 * selection; selecting anything else drops it.
 */
const focusedClip = (session: EditorSession) => {
  const id = transitionFocus.clipId;
  if (!id) return null;
  const found = findClip(session.source.composition, id);
  if (
    !found ||
    session.selectedIds.length !== 1 ||
    session.selectedIds[0] !== found.clip.layerId
  ) {
    transitionFocus.clipId = null;
    return null;
  }
  return found;
};
/**
 * V7 (spec 10.5): the scene whose incoming transition's panel is open; it
 * holds only while nothing is selected.
 */
export const focusedScene = (session: EditorSession) => {
  const id = transitionFocus.sceneId;
  if (!id) return null;
  if (session.selectedIds.length) {
    transitionFocus.sceneId = null;
    return null;
  }
  return id;
};
/** The selected text to speech clip, if any. */
export const ttsClip = (session: EditorSession) => {
  const roots = selectionRoots(session.source, session.selectedIds);
  if (roots.length !== 1 || roots[0]!.type !== 'audio') return null;
  const found = findClipByLayer(session.source.composition, roots[0]!.id);
  return found && readTtsSettings(found.clip) ? found.clip : null;
};
/** T1: the right panel's Theme tab is open (with nothing selected). */
export const themeState = { open: false };
/** FIX1 F5: Project audio (the Mixer) is open with nothing selected. */
export const projectAudioState = { open: false };
/** X2: the selected code animation layer, if exactly one is selected. */
export const codeLayerSelected = (session: EditorSession) => {
  const roots = selectionRoots(session.source, session.selectedIds);
  return roots.length === 1 && roots[0]!.type === 'video' && roots[0]!.code
    ? roots[0]!
    : null;
};
/** X2 and X3: a code layer's rail: Animation settings after Properties, the
 *  picture tools of a video, and no sound or captions (it has none). */
const CODE_TABS: RightSection[] = [
  'Properties',
  'Code',
  'Fade',
  'Filters',
  'Effects',
  'Adjust',
  'Speed',
  'Animate',
];
/** FINAL3 A3: a nested clip takes effects (on everything inside) and a
 *  speed that scales its inner time. */
const NESTED_TABS: RightSection[] = [
  'Properties',
  'Fade',
  'Effects',
  'Speed',
  'Animate',
];
/** The tabs the rail shows for the current selection. */
export function sectionsFor(session: EditorSession): RightSection[] {
  // V7 (spec 11.5): Text to speech, opened from Record & create.
  if (session.selectedIds.length) {
    ttsState.open = false;
    themeState.open = false;
    projectAudioState.open = false;
  }
  // FIX1 F5: Project audio and Theme both stay on the rail, so either can be
  // reached while the other is open.
  if (kindOf(session) === 'none' && projectAudioState.open)
    return ['Audio', 'Theme'];
  // FIX1 F3: the old right-hand Text to speech panel is off by default.
  if (kindOf(session) === 'none' && ttsState.open && flag('legacyTtsPanel'))
    return ['Speech'];
  if (kindOf(session) === 'none' && themeState.open) return ['Audio', 'Theme'];
  if (kindOf(session) === 'none' && focusedScene(session))
    return ['Transitions'];
  if (kindOf(session) === 'audio' && ttsClip(session) && flag('legacyTtsPanel'))
    return [...TABS.audio, 'Speech'];
  let tabs = codeLayerSelected(session)
    ? CODE_TABS
    : nestedSelected(session)
      ? NESTED_TABS
      : TABS[kindOf(session)];
  // P3 (spec 5.1b): Controls follow Properties when the layer has keyframes
  // or a Creator preset (only what it really has).
  const controlled = controlledLayer(session);
  if (controlled && hasControls(controlled) && !tabs.includes('Code'))
    tabs = [tabs[0]!, 'Code', ...tabs.slice(1)];
  return focusedClip(session) ? [...tabs, 'Transitions'] : tabs;
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
  if (
    section === 'Transitions' &&
    (!session || (kindOf(session) === 'none' && !focusedScene(session)))
  )
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
  /** X2: the Animation settings of the selected code layer. */
  codeBody?: () => readonly (HTMLElement | null)[];
  /** FIX1 F5: the Mixer (master volume and lanes), shown with nothing selected. */
  projectAudio?: () => HTMLElement | null;
  /** T1: the Theme panel. */
  themeBody?: () => HTMLElement;
  /** V7: Text to speech's Save. */
  tts?: TtsHooks;
  /** V7: decodes clip sound for the Audio tab's loudness analysis. */
  audioDecoder?: AudioDecoder;
  /** V4: the selection alone, without effects, fitted on black. */
  sample?: (width: number, height: number) => HTMLCanvasElement | null;
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
          options: [
            ...SYSTEM_FONTS.map(([name]) => name as string),
            // FINAL2 U6: a downloaded catalog font stays listed.
            ...(SYSTEM_FONTS.some(([name]) => name === style.family)
              ? []
              : [style.family]),
          ].map((name) => ({
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
      // FINAL2 U6: direction, lists and tables (text engine).
      ...textStructureSections({
        compositionId,
        layer: () => {
          const item = single();
          return item?.type === 'text' ? item : null;
        },
        run: (label, commands) => safely(() => run(label, commands)),
        align: (value) => styleRun('Set alignment', 'textAlign', value),
        accordion,
      }),
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
          video ? null : iconColorField(),
        ],
      ),
    ];
  };
  /** FIX1 F2: an SVG picture (an icon or sticker) can be recoloured. */
  const iconColorField = () => {
    const layer = single();
    if (!layer || layer.type !== 'image') return null;
    const asset = session.source.assets.find((a) => a.id === layer.assetId);
    const mime = (asset?.metadata as { mimeType?: unknown } | undefined)
      ?.mimeType;
    if (mime !== 'image/svg+xml') return null;
    const tint = layer.properties.tint;
    return createColorField({
      id: 'right-icon-color',
      label: t('right.iconColor'),
      value: tint?.type === 'color' ? tint.value.slice(0, 7) : '#000000',
      documentColors: () => documentColors(session.source.composition),
      onCommit: (next) =>
        safely(() =>
          run('Icon colour', [
            tintCommand(session.source.composition.id, single() ?? layer, next),
          ]),
        ),
    });
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
            audioTab(
              engine,
              session,
              run,
              report,
              hooks.audioDecoder,
              rerender,
            ),
          ),
        ];
      default:
        return groupTab();
    }
  };

  /** Q3: the anchor (pivot) of the selected layer, a 9-point grid. */
  const anchorAccordion = () => {
    const roots = selectionRoots(session.source, session.selectedIds);
    if (roots.length !== 1 || roots[0]!.type === 'audio') return null;
    const layer = roots[0]!;
    const current = pivotName(layer.properties) ?? 'center';
    const grid = document.createElement('div');
    grid.className = 'anchor-grid';
    grid.id = 'right-anchor';
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', t('right.anchor'));
    for (const name of PIVOT_NAMES) {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'anchor-cell';
      cell.dataset.pivot = name;
      cell.setAttribute('role', 'radio');
      cell.setAttribute('aria-checked', String(name === current));
      cell.title = t(`right.anchor.${name}`);
      cell.setAttribute('aria-label', cell.title);
      cell.onclick = () =>
        safely(() =>
          run(t('right.anchorStep'), [
            {
              type: 'SET_PROPERTY',
              compositionId: session.source.composition.id,
              layerId: layer.id,
              target: { kind: 'property', key: 'pivot' },
              property: {
                type: 'string',
                value: name,
                animated: false,
                keyframes: [],
                constraints: [],
              },
            } as Command,
          ]),
        );
      grid.append(cell);
    }
    const note = document.createElement('p');
    note.className = 'right-note';
    note.textContent = t('right.anchorHint');
    return accordion('layer-anchor', t('right.anchor'), [grid, note]);
  };

  // --- Other tabs --------------------------------------------------------------
  const fade = () => {
    const clips = selectedClips(session.source, session.selectedIds);
    if (!clips.length)
      return [heading(t('panel.fade'), t('right.fadeNeedsClip'))];
    // V7 (spec 11.3): an audio clip's fades are its sound's, 0 to 5 s.
    if (kindOf(session) === 'audio') {
      registerAudioCommands(engine);
      const { clip } = clips[0]!;
      const settings = readAudioSettings(clip);
      const audioField = (slot: 'fadeIn' | 'fadeOut') =>
        createNumberField({
          id: `right-fade-${slot === 'fadeIn' ? 'in' : 'out'}`,
          label: t(slot === 'fadeIn' ? 'right.fadeIn' : 'right.fadeOut'),
          value: Math.min(5, settings[slot]),
          unit: 's',
          decimals: 1,
          step: 0.1,
          min: 0,
          max: 5,
          slider: true,
          presets: [0, 0.5, 1, 2],
          onCommit: (seconds) =>
            safely(() =>
              run(slot === 'fadeIn' ? 'Fade in' : 'Fade out', [
                audioCommand(session.source.composition.id, clip.id, {
                  ...settings,
                  [slot]: Math.max(0, seconds),
                }),
              ]),
            ),
        });
      return [
        heading(t('panel.fade'), t('audio.fadeHint')),
        audioField('fadeIn'),
        audioField('fadeOut'),
      ];
    }
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
              clips.flatMap(({ clip }) => {
                const commands = [
                  {
                    type: 'SET_CLIP_ANIMATION',
                    compositionId: session.source.composition.id,
                    clipId: clip.id,
                    slot,
                    value:
                      seconds <= 0
                        ? null
                        : { preset: 'fade', duration: Math.max(0.1, seconds) },
                  } as Command,
                ];
                // V7 (spec 11.3): a video's Fade is one control for its
                // picture and its sound, in the same step.
                const layer = locateLayer(
                  session.source.composition.layers,
                  clip.layerId,
                )?.layer;
                if (
                  layer?.type === 'video' &&
                  layer.assetId &&
                  !clipAudioDetached(clip)
                ) {
                  registerAudioCommands(engine);
                  commands.push(
                    audioCommand(session.source.composition.id, clip.id, {
                      ...readAudioSettings(clip),
                      [slot === 'in' ? 'fadeIn' : 'fadeOut']: Math.max(
                        0,
                        seconds,
                      ),
                    }),
                  );
                }
                return commands;
              }),
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
      heading(
        t('panel.speed'),
        kindOf(session) === 'audio' || kindOf(session) === 'video'
          ? `${t('right.speedHint')} ${t('audio.speedHint')}`
          : t('right.speedHint'),
      ),
      slider,
      list,
      // FINAL3 A3: a nested clip's speed scales its inner time only.
      ...(nestedSelected(session) ? [] : [toggle('reverse'), toggle('freeze')]),
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
  /** Adjust colors: Transparency and the FX library's colour adjustments. */
  const adjust = () => {
    // T-ALL P6: the colour adjustments of the FX library, one step each.
    const clips = fxClips();
    const fx = clips.length ? fxOf(clips[0]!.clip) : null;
    const adjustField = (key: string) => {
      const id = `adjust.${key}`;
      // (A filter preset's own adjustments are not these sliders.)
      const entry = fx?.stack.find(
        (item) => item.id === id && !isFilterEntry(item),
      );
      // Spec 5: a label over a slider, no number box; bipolar sliders keep
      // their thumb centred at 0.
      const block = document.createElement('div');
      block.className = 'fx-adjust';
      const label = document.createElement('label');
      label.className = 'fx-setting-label';
      label.htmlFor = `right-adjust-${key}`;
      label.textContent = t(`right.adjust.${key}`);
      const range = document.createElement('input');
      range.type = 'range';
      range.id = `right-adjust-${key}`;
      range.className = `fx-slider fx-slider-${key}`;
      range.min = '-100';
      range.max = '100';
      range.step = '1';
      range.disabled = !fx;
      range.value = String(Math.round(Number(entry?.params.amount ?? 0) * 100));
      range.addEventListener('change', () => {
        const value = Number(range.value);
        safely(() =>
          setFx('Adjust colors', (next) => {
            const at = next.stack.findIndex(
              (item) => item.id === id && !isFilterEntry(item),
            );
            const replacement = {
              id,
              params: {
                ...fxDefaults(getAdjustment(id)!),
                amount: value / 100,
              },
            };
            if (at >= 0) {
              if (value === 0) next.stack.splice(at, 1);
              else next.stack[at] = replacement;
            } else if (value !== 0) next.stack.unshift(replacement);
          }),
        );
      });
      block.append(label, range);
      return block;
    };
    // FINAL2 U7: one blend control, the layer's own blend mode (all 16,
    // grouped); a V4 clip-FX blend is shown until replaced, then cleared.
    const legacyClear = () =>
      clips
        .filter(({ clip }) => fxOf(clip).blendMode !== undefined)
        .map(({ clip }) => {
          const next = fxOf(clip);
          delete next.blendMode;
          return {
            type: 'SET_CLIP_FX',
            compositionId: session.source.composition.id,
            clipId: clip.id,
            fx: next,
          } as Command;
        });
    const blend = blendControl(layerFx(), {
      legacy: fx?.blendMode,
      clearLegacy: legacyClear,
    });
    return [
      heading(t('panel.adjust'), t('right.adjustHint')),
      accordion('adjust-transparency', t('toolbar.transparency'), [
        hooks.build?.('transparency'),
      ]),
      accordion('adjust-colors', t('right.adjust.colors'), [
        ...(['exposure', 'contrast', 'saturation', 'temperature'] as const).map(
          adjustField,
        ),
        blend,
        button(
          'right-adjust-reset',
          'undo',
          t('right.adjust.reset'),
          fx
            ? () => {
                const layer = single();
                run('Reset colors', [
                  ...clips.map(({ clip }) => {
                    const next = fxOf(clip);
                    next.stack = next.stack.filter(
                      (item) =>
                        !item.id.startsWith('adjust.') || isFilterEntry(item),
                    );
                    delete next.blendMode;
                    return {
                      type: 'SET_CLIP_FX',
                      compositionId: session.source.composition.id,
                      clipId: clip.id,
                      fx: next,
                    } as Command;
                  }),
                  layer && layer.blendMode !== undefined
                    ? blendCommand(engine, session, layer.id, 'normal')
                    : null,
                ]);
              }
            : null,
          fx ? undefined : { reason: t('right.fadeNeedsClip') },
        ),
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
  // --- T-ALL P6: the FX library (filters, effects, adjustments) -------------
  const fxClips = () => selectedClips(session.source, session.selectedIds);
  const fxOf = (clip: unknown): ClipFx =>
    structuredClone(
      clipFx(clip as Parameters<typeof clipFx>[0]) ?? { version: 1, stack: [] },
    ) as ClipFx;
  /** Changes every selected clip's effect stack, one undo step. */
  const setFx = (label: string, change: (fx: ClipFx) => void) => {
    const clips = fxClips();
    run(
      label,
      clips.map(({ clip }) => {
        const next = fxOf(clip);
        change(next);
        return {
          type: 'SET_CLIP_FX',
          compositionId: session.source.composition.id,
          clipId: clip.id,
          fx: next,
        } as Command;
      }),
    );
  };
  /** V4: the last clicked tile per panel (its settings open under it). */
  const lastTile: { filters: string | null; effects: string | null } = {
    filters: null,
    effects: null,
  };
  const tileQuery = { filters: { value: '' }, effects: { value: '' } };
  const source = () => tileSource(hooks.sample?.(160, 90) ?? sampleCanvas());
  /** Spec 5: Filters, one at a time, with an Intensity slider. */
  const filters = () => {
    const clips = fxClips();
    if (!clips.length)
      return [heading(t('panel.filters'), t('right.fadeNeedsClip'))];
    const fx = fxOf(clips[0]!.clip);
    const active = activePreset(fx);
    const current = active?.preset.key ?? 'none';
    const intensity = active?.intensity ?? 1;
    return [
      heading(t('panel.filters')),
      tileGrid({
        name: t('panel.filters'),
        search: t('fx.searchFilters'),
        query: tileQuery.filters,
        source: source(),
        tiles: [
          { key: 'none', label: t('fx.none'), stack: [] },
          ...FILTER_PRESETS.map((preset) => ({
            key: preset.key,
            label: t(`fx.preset.${preset.key}`),
            stack: presetEntries(preset, 1),
          })),
        ],
        selected: (key) => key === current,
        onClick: (key) =>
          safely(() => {
            lastTile.filters = key;
            if (key === current) {
              rerender();
              return;
            }
            setFx(key === 'none' ? 'Remove filter' : 'Apply filter', (next) =>
              applyPreset(next, key, intensity),
            );
          }),
        settingsFor: current === 'none' ? null : current,
        settings: () =>
          intensitySlider(intensity, (value) =>
            safely(() =>
              setFx('Filter intensity', (next) => {
                for (const entry of next.stack)
                  if (isFilterEntry(entry))
                    entry.params = { ...entry.params, intensity: value };
              }),
            ),
          ),
      }),
    ];
  };
  /** Spec 5: Effects, several at once; a click toggles one. */
  const fxEffects = () => {
    const clips = fxClips();
    if (!clips.length) return [];
    const fx = fxOf(clips[0]!.clip);
    const on = selectedEffects(fx);
    const pictures = ['video', 'image'].includes(kindOf(session));
    const tiles = EFFECT_TILES.filter((tile) => pictures || !tile.pictures);
    const shown =
      lastTile.effects && on.has(lastTile.effects)
        ? lastTile.effects
        : ([...on].at(-1) ?? null);
    return [
      tileGrid({
        name: t('panel.effects'),
        search: t('fx.searchEffects'),
        query: tileQuery.effects,
        source: source(),
        tiles: [
          { key: 'none', label: t('fx.none'), stack: [] },
          ...tiles.map((tile) => ({
            key: tile.id,
            label: t(`fx.${tile.id}`),
            stack: [{ id: tile.id, params: fxDefaults(getEffect(tile.id)!) }],
            animated: true,
            badge: getEffect(tile.id)!.params.length > 1,
            group: tile.more ? t('fx.more') : undefined,
          })),
        ],
        selected: (key) => (key === 'none' ? on.size === 0 : on.has(key)),
        onClick: (key) =>
          safely(() => {
            lastTile.effects = key === 'none' ? null : key;
            if (key === 'none') {
              if (on.size)
                setFx('Remove effects', (next) => {
                  next.stack = next.stack.filter(
                    (item) => !item.id.startsWith('effect.'),
                  );
                });
              return;
            }
            setFx(on.has(key) ? 'Remove effect' : 'Add effect', (next) =>
              toggleEffect(next, key),
            );
          }),
        settingsFor: shown,
        settings: () => {
          const entry = fx.stack.find((item) => item.id === shown);
          return entry
            ? effectSettings(entry.id, entry.params, (name, value) =>
                safely(() =>
                  setFx('Effect settings', (next) => {
                    const target = next.stack.find(
                      (item) => item.id === entry.id,
                    );
                    if (target)
                      target.params = { ...target.params, [name]: value };
                  }),
                ),
              )
            : null;
        },
      }),
    ];
  };
  const SHADOW: readonly (readonly [string, number, number])[] = [
    ['blur', 0, 100],
    ['distance', 0, 100],
    ['angle', -180, 180],
  ];
  // FINAL2 U7: masks, chroma key and the layer blend mode.
  const layerFx = (): LayerEffectsContext => ({
    engine,
    session,
    accordion,
    run,
    safely,
    report,
    rerender,
  });
  const effects = () => {
    const kind = kindOf(session);
    // FINAL3 A3: a nested clip's effects apply to everything inside it.
    if (nestedSelected(session))
      return [
        heading(t('panel.effects'), t('right.nestedEffectsHint')),
        ...fxEffects(),
      ];
    if (kind === 'video' || kind === 'image')
      return [
        heading(t('panel.effects'), t('right.effectsHint')),
        ...fxEffects(),
        masksAccordion(layerFx()),
        chromaAccordion(layerFx()),
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
      accordion(`${kind}-effect-fx`, t('panel.effects'), fxEffects()),
      masksAccordion(layerFx()),
    ];
  };
  const transitionQuery = { value: '' };
  /** V5 (spec 6): the Transition panel of the selected cut marker. */
  /** V7: the Transition panel of a scene-to-scene transition. */
  const sceneTransitionPanel = (sceneId: string) => {
    const scene = engine.state.compositions.find((item) => item.id === sceneId);
    if (!scene) return [heading(t('transition.title'))];
    const current = sceneTransitionOf(scene);
    const limit = sceneTransitionLimit(engine, sceneId);
    const set = (label: string, transition: Transition | null) =>
      safely(() => setSceneTransition(engine, sceneId, transition, label));
    return [
      heading(
        t('transition.title'),
        t('transition.sceneHint', { name: scene.name }),
      ),
      tileGrid({
        name: t('transition.title'),
        search: t('transition.search'),
        query: transitionQuery,
        source: source(),
        tiles: transitionTiles(),
        selected: (key) => key === (current?.type ?? 'none'),
        onClick: (key) => {
          if (key === 'none') {
            if (current) set('Remove transition', null);
            return;
          }
          if (key === current?.type) return;
          set(current ? 'Change transition' : 'Add transition', {
            type: key as Transition['type'],
            duration: Math.min(current?.duration ?? DEFAULT_TRANSITION, limit),
          });
        },
        settingsFor: current?.type ?? null,
        settings: () => {
          if (!current) return null;
          const block = document.createElement('div');
          block.append(
            createNumberField({
              id: 'transition-duration',
              label: t('transition.duration'),
              value: Math.round(current.duration * 100) / 100,
              unit: 's',
              min: MIN_TRANSITION,
              max: Math.round(limit * 100) / 100,
              step: 0.1,
              decimals: 1,
              slider: true,
              onCommit: (value) => {
                if (value !== current.duration)
                  set('Transition duration', { ...current, duration: value });
              },
              onInvalid: (message) => report(new RangeError(message)),
            }),
          );
          return block;
        },
      }),
    ];
  };
  const transitions = () => {
    const sceneId = focusedScene(session);
    if (sceneId && kindOf(session) === 'none')
      return sceneTransitionPanel(sceneId);
    const found = focusedClip(session);
    if (!found)
      return [
        heading(t('panel.transitions')),
        plannedNoteText(t('right.transitionNeedsCut')),
      ];
    const composition = session.source.composition;
    const clip = found.clip as unknown as Parameters<
      typeof maxTransition
    >[1] & {
      id: string;
      transitionMetadata: Record<string, unknown>;
    };
    const before = previousTouching(
      found.track.clips as unknown as Parameters<typeof previousTouching>[0],
      clip,
    );
    const current = clipTransition(clip);
    const limit = before ? maxTransition(before, clip) : DEFAULT_TRANSITION;
    const set = (
      label: string,
      transition: { type: string; duration: number } | null,
    ) =>
      safely(() =>
        run(label, [
          {
            type: 'SET_CLIP_TRANSITION',
            compositionId: composition.id,
            clipId: clip.id,
            transition,
          } as Command,
        ]),
      );
    return [
      heading(t('transition.title')),
      tileGrid({
        name: t('transition.title'),
        search: t('transition.search'),
        query: transitionQuery,
        source: source(),
        tiles: transitionTiles(),
        selected: (key) => key === (current?.type ?? 'none'),
        onClick: (key) => {
          if (key === 'none') {
            if (current) set('Remove transition', null);
            return;
          }
          if (key === current?.type) return;
          set(current ? 'Change transition' : 'Add transition', {
            type: key,
            duration: Math.min(current?.duration ?? DEFAULT_TRANSITION, limit),
          });
        },
        settingsFor: current?.type ?? null,
        settings: () => {
          if (!current) return null;
          const block = document.createElement('div');
          block.append(
            createNumberField({
              id: 'transition-duration',
              label: t('transition.duration'),
              value: Math.round(current.duration * 100) / 100,
              unit: 's',
              min: MIN_TRANSITION,
              max: Math.round(limit * 100) / 100,
              step: 0.1,
              decimals: 1,
              slider: true,
              onCommit: (value) => {
                if (value !== current.duration)
                  set('Transition duration', {
                    type: current.type,
                    duration: value,
                  });
              },
              onInvalid: (message) => report(new RangeError(message)),
            }),
          );
          return block;
        },
      }),
    ];
  };
  /** V7 (spec 11.5): Text to speech, for a new clip or the selected one. */
  const speech = () => {
    const clip = ttsClip(session);
    if (clip) editTtsClip(clip);
    else if (!ttsState.open) return [heading(t('tts.title'))];
    else if (ttsState.clipId) {
      ttsState.clipId = null;
      ttsState.draft = null;
      ttsState.saved = null;
    }
    return hooks.tts
      ? ttsPanel(hooks.tts, rerender)
      : [heading(t('tts.title'))];
  };
  const plannedNoteText = (text: string) => {
    const p = document.createElement('p');
    p.className = 'right-note';
    p.textContent = text;
    return p;
  };

  let lastSection: RightSection = 'Properties';
  const rerender = () => api.render(lastSection);
  const api = {
    render(section: RightSection) {
      lastSection = section;
      host.dataset.section = section;
      host.dataset.kind = kindOf(session);
      const content =
        section === 'Properties'
          ? [...firstTab(), anchorAccordion()]
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
                        : section === 'Code'
                          ? [
                              heading(t('panel.code')),
                              ...(hooks.codeBody?.() ?? []),
                            ]
                          : section === 'Theme'
                            ? [hooks.themeBody?.() ?? null].filter(
                                (item): item is HTMLElement => !!item,
                              )
                            : section === 'Speech'
                              ? speech()
                              : section === 'Transitions'
                                ? transitions()
                                : section === 'Audio' &&
                                    kindOf(session) === 'none'
                                  ? [
                                      heading(
                                        t('mixer.projectAudio'),
                                        t('mixer.projectAudioHint'),
                                      ),
                                      hooks.projectAudio?.() ?? null,
                                    ]
                                  : section === 'Audio'
                                    ? [
                                        heading(
                                          t('panel.audio'),
                                          t('right.audioHint'),
                                        ),
                                        ...audioTab(
                                          engine,
                                          session,
                                          run,
                                          report,
                                          hooks.audioDecoder,
                                          rerender,
                                        ),
                                      ]
                                    : [];
      host.replaceChildren(
        ...content.filter((item): item is HTMLElement => !!item),
      );
    },
  };
  return api;
}
