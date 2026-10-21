// FINAL3 C3: the right panel's Camera section (Blender's camera properties,
// moved only by code controllers: no keyframes here). It opens when a shot
// is selected on the Camera track, or from the scene toolbar's Camera
// button with nothing selected. Cameras: add, duplicate, delete, rename;
// shots: add at the playhead, controller, presets row, parameters,
// Randomise, start and end framing; the camera's lens, sensor, shift, clip,
// depth of field, safe areas, passepartout, guides, viewport display,
// background image and Track To. Every edit is one undo step.
import { t } from '../i18n';
import type { Asset, Command, Composition, DeepReadonly } from '../core';
import {
  CAMERA_EASINGS,
  COMPOSITION_GUIDES,
  CONTROLLERS,
  LENS_PRESETS,
  SENSOR_PRESETS,
  SHOT_PRESETS,
  defaultCameraSpec,
  fieldOfView,
  focalForFov,
  randomiseShot,
  type CameraBackground,
  type CameraSpec,
  type Pose,
  type Shot,
} from '../camera/rig';
import {
  cameraShotsOf,
  camerasOf,
  isCameraLayer,
  type CameraShotEntry,
} from '../camera/shots';
import {
  addShotCommands,
  deleteCameraCommands,
  duplicateCameraCommands,
  setShotCameraCommands,
  updateCameraCommands,
  updateShotCommands,
} from '../camera/shot-commands';
import { createNumberField } from './components/number-field';
import { createSelect } from './components/select';
import { iconSvg } from './icons';
import { cameraView } from './camera-panel';

/** Transient UI state (not saved, no history). */
export const cameraUi = {
  /** Opened from the scene toolbar with nothing selected. */
  open: false,
  /** The camera shown when no shot is selected. */
  cameraId: null as string | null,
  /** The camera frame overlay on the canvas, and which framing it edits. */
  frame: true,
  edit: 'start' as 'start' | 'end',
  /** Picking the focus object on the canvas. */
  pickFocus: false,
  /** The shot whose camera gets the picked focus object. */
  pickShot: null as string | null,
};

export interface CameraSectionDeps {
  composition(): DeepReadonly<Composition>;
  assets(): readonly DeepReadonly<Asset>[];
  time(): number;
  /** The selected layer's id when it is one camera shot. */
  selectedId(): string | null;
  select(layerId: string | null): void;
  run(label: string, commands: Command[]): void;
  report(error: unknown): void;
  /** Redraws the canvas (a view toggle changed). */
  redraw(): void;
  /** Builds the section again (a transient choice changed). */
  rerender(): void;
}

/** The selected camera shot, if exactly that is selected. */
export function selectedShot(
  composition: DeepReadonly<Composition>,
  ids: readonly string[],
): CameraShotEntry | null {
  if (ids.length !== 1) return null;
  return (
    cameraShotsOf(composition as never).find(
      (entry) => entry.layer.id === ids[0],
    ) ?? null
  );
}
/** Whether a layer is a camera shot (the right panel's Camera kind). */
export const isShotLayer = (layer: {
  readonly properties: Readonly<Record<string, unknown>>;
}) => isCameraLayer(layer as never);

const POSE_KEYS = ['x', 'y', 'z', 'pan', 'tilt', 'roll', 'focal'] as const;
const POSE_UNITS: Record<(typeof POSE_KEYS)[number], string> = {
  x: 'px',
  y: 'px',
  z: 'px',
  pan: '°',
  tilt: '°',
  roll: '°',
  focal: 'mm',
};
const POSE_RANGE: Record<(typeof POSE_KEYS)[number], [number, number]> = {
  x: [-5000, 5000],
  y: [-5000, 5000],
  z: [-5000, 5000],
  pan: [-90, 90],
  tilt: [-90, 90],
  roll: [-360, 360],
  focal: [1, 500],
};
const PARAM_KEYS = ['strength', 'amount', 'speed', 'seed'] as const;
const PARAM_RANGE: Record<(typeof PARAM_KEYS)[number], [number, number]> = {
  strength: [0, 2],
  amount: [0, 100],
  speed: [0.05, 20],
  seed: [1, 99999],
};

export function cameraSection(deps: CameraSectionDeps): HTMLElement[] {
  const scene = deps.composition();
  const entries = cameraShotsOf(scene as never);
  const cameras = camerasOf(scene as never);
  const selected =
    entries.find((entry) => entry.layer.id === deps.selectedId()) ?? null;
  const spec =
    selected?.spec ??
    cameras.find((camera) => camera.id === cameraUi.cameraId) ??
    cameras[0] ??
    null;
  cameraUi.cameraId = spec?.id ?? null;
  const safely = (action: () => void) => {
    try {
      action();
    } catch (error) {
      deps.report(error);
    }
  };
  const run = (label: string, commands: Command[]) =>
    safely(() => {
      if (commands.length) deps.run(label, commands);
    });

  // --- small builders --------------------------------------------------
  const button = (
    action: string,
    label: string,
    onClick: () => void,
    icon?: string,
    className = 'button secondary sm',
  ) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = className;
    el.dataset.action = action;
    el.innerHTML = icon ? iconSvg(icon, 14) : '';
    el.append(document.createTextNode(label));
    el.onclick = () => safely(onClick);
    return el;
  };
  const toggle = (
    action: string,
    label: string,
    on: boolean,
    onChange: (on: boolean) => void,
  ) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'switch-row';
    el.dataset.action = action;
    el.setAttribute('role', 'switch');
    el.setAttribute('aria-checked', String(on));
    el.innerHTML = '<span></span>';
    el.querySelector('span')!.textContent = label;
    el.onclick = () => safely(() => onChange(!on));
    return el;
  };
  const num = (
    id: string,
    label: string,
    value: number,
    range: readonly [number, number],
    onCommit: (value: number) => void,
    options: { unit?: string; step?: number; decimals?: number } = {},
  ) =>
    createNumberField({
      id,
      label,
      value,
      min: range[0],
      max: range[1],
      step: options.step ?? 1,
      decimals: options.decimals ?? 2,
      ...(options.unit ? { unit: options.unit } : {}),
      slider: true,
      className: 'camera-number',
      onCommit: (next) => safely(() => onCommit(next)),
      onInvalid: (message) => deps.report(new RangeError(message)),
    });
  const select = (
    id: string,
    label: string,
    value: string,
    options: readonly { value: string; label: string }[],
    onChange: (value: string) => void,
  ) =>
    createSelect({
      id,
      label,
      value,
      options,
      onChange: (next) => safely(() => onChange(next)),
    });
  const row = (...children: (HTMLElement | null)[]) => {
    const el = document.createElement('div');
    el.className = 'camera-row';
    el.append(...children.filter((child): child is HTMLElement => !!child));
    return el;
  };
  const group = (
    id: string,
    title: string,
    content: readonly (HTMLElement | null)[],
    open = false,
  ) => {
    const section = document.createElement('section');
    section.className = 'right-accordion camera-group';
    section.dataset.accordion = `camera-${id}`;
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'right-accordion-head';
    head.dataset.accordionToggle = `camera-${id}`;
    const shown = opened.has(id) || (open && !closed.has(id));
    head.setAttribute('aria-expanded', String(shown));
    head.innerHTML = `<span></span>${iconSvg(shown ? 'chevronDown' : 'chevronRight', 14)}`;
    head.querySelector('span')!.textContent = title;
    const body = document.createElement('div');
    body.className = 'right-accordion-body';
    body.hidden = !shown;
    body.append(...content.filter((item): item is HTMLElement => !!item));
    head.onclick = () => {
      const now = body.hidden;
      if (now) {
        opened.add(id);
        closed.delete(id);
      } else {
        opened.delete(id);
        closed.add(id);
      }
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
  const layers = scene.layers.filter((layer) => !isCameraLayer(layer as never));
  const layerOptions = [
    { value: '', label: t('cam.none') },
    ...layers.map((layer) => ({ value: layer.id, label: layer.name })),
  ];

  // --- header ----------------------------------------------------------
  const header = document.createElement('header');
  header.className = 'right-section-header';
  const h = document.createElement('h3');
  h.textContent = t('cam.title');
  const hint = document.createElement('p');
  hint.textContent = t('cam.hint');
  header.append(h, hint);

  const sceneLike = scene as never;
  const now = deps.time();
  const addCamera = () => {
    const spec = defaultCameraSpec(
      `camera-${Date.now().toString(36)}`,
      t('cam.defaultName', { n: String(cameras.length + 1) }),
    );
    const added = addShotCommands(sceneLike, {
      start: now,
      duration: Math.min(5, Math.max(1, scene.duration - now || 5)),
      spec,
    });
    cameraUi.cameraId = spec.id;
    run('Add camera', added.commands);
    deps.select(added.layerId);
  };
  const addShot = (preset?: keyof typeof SHOT_PRESETS) => {
    const added = addShotCommands(sceneLike, {
      start: now,
      duration: 3,
      ...(spec ? { spec } : {}),
      ...(preset ? { shot: SHOT_PRESETS[preset] } : {}),
    });
    run('Add shot', added.commands);
    deps.select(added.layerId);
  };
  const actions = row(
    button('camera-add', t('cam.addCamera'), addCamera, 'plus'),
    button('camera-add-shot', t('cam.addShot'), () => addShot(), 'camera'),
  );
  const parts: (HTMLElement | null)[] = [header, actions];
  // An older project's scene camera (FINAL1, keyframed): it still plays and
  // exports; here it can only be removed (no keyframe UI).
  if ((scene as { camera?: unknown }).camera) {
    const legacy = document.createElement('p');
    legacy.className = 'right-note';
    legacy.textContent = t('cam.legacy');
    parts.push(
      legacy,
      button('camera-legacy-remove', t('cam.legacyRemove'), () =>
        run('Remove camera', [
          {
            type: 'SET_COMPOSITION_CAMERA',
            compositionId: scene.id,
            camera: null,
          } as unknown as Command,
        ]),
      ),
    );
  }
  if (!spec) {
    const empty = document.createElement('p');
    empty.className = 'right-note';
    empty.textContent = t('cam.empty');
    parts.push(empty);
    return parts.filter((item): item is HTMLElement => !!item);
  }

  const setSpec = (label: string, next: CameraSpec) =>
    run(label, updateCameraCommands(sceneLike, next));
  const patch = <K extends keyof CameraSpec>(
    key: K,
    value: CameraSpec[K],
    label = 'Camera settings',
  ) => setSpec(label, { ...spec, [key]: value });

  // --- cameras ---------------------------------------------------------
  const cameraPicker = select(
    'camera-select',
    t('cam.camera'),
    spec.id,
    cameras.map((camera) => ({ value: camera.id, label: camera.name })),
    (id) => {
      const camera = cameras.find((item) => item.id === id);
      if (!camera) return;
      if (selected)
        run(
          'Shot camera',
          setShotCameraCommands(
            sceneLike,
            selected.layer.id,
            camera,
            selected.shot,
          ),
        );
      else {
        cameraUi.cameraId = id;
        deps.rerender();
      }
    },
  );
  const name = document.createElement('input');
  name.type = 'text';
  name.id = 'camera-name';
  name.className = 'camera-name';
  name.value = spec.name;
  name.maxLength = 80;
  name.setAttribute('aria-label', t('cam.name'));
  name.onchange = () => {
    const value = name.value.trim();
    if (value && value !== spec.name) patch('name', value, 'Rename camera');
    else name.value = spec.name;
  };
  const cameraActions = row(
    button(
      'camera-duplicate',
      t('cam.duplicate'),
      () => {
        const shot =
          selected?.shot ?? entries.find((e) => e.spec.id === spec.id)!.shot;
        const copy = duplicateCameraCommands(sceneLike, spec, shot, 3);
        run('Duplicate camera', copy.commands);
        deps.select(copy.layerId);
      },
      'duplicate',
    ),
    button(
      'camera-delete',
      t('cam.delete'),
      () => {
        deps.select(null);
        run('Delete camera', deleteCameraCommands(sceneLike, spec.id));
        cameraUi.cameraId = null;
      },
      'delete',
      'button ghost sm',
    ),
  );
  parts.push(row(cameraPicker), row(name), cameraActions);

  // --- view toggles ----------------------------------------------------
  const frameEdit = document.createElement('div');
  frameEdit.className = 'segmented camera-edit';
  frameEdit.setAttribute('role', 'radiogroup');
  frameEdit.setAttribute('aria-label', t('cam.editFraming'));
  for (const which of ['start', 'end'] as const) {
    const el = document.createElement('button');
    el.type = 'button';
    el.dataset.cameraEdit = which;
    el.setAttribute('role', 'radio');
    el.setAttribute('aria-checked', String(cameraUi.edit === which));
    el.textContent = t(`cam.${which}`);
    el.onclick = () => {
      cameraUi.edit = which;
      deps.redraw();
      deps.rerender();
    };
    frameEdit.append(el);
  }
  parts.push(
    toggle('camera-preview', t('cam.preview'), cameraView.preview, (on) => {
      cameraView.preview = on;
      deps.redraw();
      deps.rerender();
    }),
    toggle('camera-frame', t('cam.frame'), cameraUi.frame, (on) => {
      cameraUi.frame = on;
      deps.redraw();
      deps.rerender();
    }),
    frameEdit,
  );

  // --- shots -----------------------------------------------------------
  const list = document.createElement('ul');
  list.className = 'camera-shots';
  list.setAttribute('aria-label', t('cam.shots'));
  for (const entry of entries) {
    const item = document.createElement('li');
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'camera-shot';
    pick.dataset.shotId = entry.layer.id;
    pick.setAttribute(
      'aria-pressed',
      String(entry.layer.id === selected?.layer.id),
    );
    pick.textContent = `${entry.spec.name} · ${t(`cam.controller.${entry.shot.controller}`)} · ${formatTime(entry.clip.startTime)}–${formatTime(entry.clip.startTime + entry.clip.duration)}`;
    pick.onclick = () => deps.select(entry.layer.id);
    item.append(pick);
    list.append(item);
  }
  const presets = document.createElement('div');
  presets.className = 'camera-presets';
  presets.setAttribute('aria-label', t('cam.presets'));
  for (const key of Object.keys(SHOT_PRESETS) as (keyof typeof SHOT_PRESETS)[])
    presets.append(
      button(
        `camera-preset-${key}`,
        t(`cam.preset.${key}`),
        () => {
          if (!selected) return addShot(key);
          run(
            'Camera preset',
            updateShotCommands(sceneLike, selected.layer.id, {
              ...selected.shot,
              ...SHOT_PRESETS[key],
              cameraId: selected.spec.id,
            } as Shot),
          );
        },
        undefined,
        'button secondary sm camera-preset',
      ),
    );
  parts.push(group('shots', t('cam.shots'), [list, presets], true));

  if (selected) {
    const shot = selected.shot;
    const setShot = (label: string, next: Shot) =>
      run(label, updateShotCommands(sceneLike, selected.layer.id, next));
    const controller = select(
      'camera-controller',
      t('cam.controllerLabel'),
      shot.controller,
      CONTROLLERS.map((id) => ({
        value: id,
        label: t(`cam.controller.${id}`),
      })),
      (value) =>
        setShot('Camera controller', {
          ...shot,
          controller: value as Shot['controller'],
        }),
    );
    const easing = select(
      'camera-easing',
      t('cam.easing'),
      shot.easing,
      CAMERA_EASINGS.map((id) => ({ value: id, label: t(`cam.ease.${id}`) })),
      (value) =>
        setShot('Camera easing', { ...shot, easing: value as Shot['easing'] }),
    );
    const params = PARAM_KEYS.map((key) =>
      num(
        `camera-${key}`,
        t(`cam.param.${key}`),
        shot[key],
        PARAM_RANGE[key],
        (value) =>
          setShot('Camera shot', {
            ...shot,
            [key]: key === 'seed' ? Math.round(value) : value,
          }),
        {
          step: key === 'seed' ? 1 : 0.1,
          decimals: key === 'seed' ? 0 : 2,
        },
      ),
    );
    const direction = select(
      'camera-direction',
      t('cam.direction'),
      String(shot.direction),
      [
        { value: '1', label: t('cam.dir.forward') },
        { value: '-1', label: t('cam.dir.back') },
      ],
      (value) =>
        setShot('Camera shot', {
          ...shot,
          direction: value === '-1' ? -1 : 1,
        }),
    );
    const target = select(
      'camera-target',
      t('cam.target'),
      shot.target ?? '',
      layerOptions,
      (value) => setShot('Camera shot', { ...shot, target: value || null }),
    );
    const randomise = button(
      'camera-randomise',
      t('cam.randomise'),
      () => setShot('Randomise shot', randomiseShot(shot, Math.random)),
      'magic',
    );
    parts.push(
      group(
        'controller',
        t('cam.controllerLabel'),
        [controller, easing, ...params, direction, target, randomise],
        true,
      ),
    );
    // Start and end framing (each value is optional; empty is at rest).
    const framing = (which: 'from' | 'to') => {
      const part = shot[which] ?? {};
      const base: Record<string, number> = {
        x: 0,
        y: 0,
        z: 0,
        pan: 0,
        tilt: 0,
        roll: 0,
        focal: spec.focal,
      };
      const block = document.createElement('div');
      block.className = 'camera-framing';
      block.dataset.framing = which;
      const title = document.createElement('h4');
      title.textContent = t(which === 'from' ? 'cam.start' : 'cam.end');
      block.append(title);
      for (const key of POSE_KEYS)
        block.append(
          num(
            `camera-${which}-${key}`,
            t(`cam.pose.${key}`),
            (part as Partial<Pose>)[key] ?? base[key]!,
            POSE_RANGE[key],
            (value) =>
              setShot('Camera framing', {
                ...shot,
                [which]: { ...part, [key]: value },
              }),
            { unit: POSE_UNITS[key], step: key === 'focal' ? 1 : 1 },
          ),
        );
      block.append(
        button(`camera-${which}-reset`, t('cam.resetFraming'), () => {
          const next = { ...shot } as { -readonly [K in keyof Shot]: Shot[K] };
          delete next[which];
          setShot('Camera framing', next);
        }),
      );
      return block;
    };
    parts.push(
      group('framing', t('cam.framing'), [framing('from'), framing('to')]),
    );
  }

  // --- the camera's Blender settings ------------------------------------
  const fov = fieldOfView(spec, spec.focal);
  const lens = [
    select(
      'camera-type',
      t('cam.type'),
      spec.type,
      [
        { value: 'persp', label: t('cam.persp') },
        { value: 'ortho', label: t('cam.ortho') },
      ],
      (value) => patch('type', value as CameraSpec['type']),
    ),
    select(
      'camera-lens-unit',
      t('cam.lensUnit'),
      spec.lensUnit,
      [
        { value: 'mm', label: t('cam.mm') },
        { value: 'fov', label: t('cam.fov') },
      ],
      (value) => patch('lensUnit', value as CameraSpec['lensUnit']),
    ),
    spec.type === 'ortho'
      ? num(
          'camera-ortho-scale',
          t('cam.orthoScale'),
          spec.orthoScale,
          [0.01, 100],
          (value) => patch('orthoScale', value),
          { step: 0.05 },
        )
      : spec.lensUnit === 'fov'
        ? num(
            'camera-fov',
            t('cam.fov'),
            fov,
            [1, 175],
            (value) => patch('focal', focalForFov(spec, value)),
            { unit: '°', step: 1 },
          )
        : num(
            'camera-focal',
            t('cam.focal'),
            spec.focal,
            [1, 500],
            (value) => patch('focal', value),
            { unit: 'mm' },
          ),
    (() => {
      const wrap = document.createElement('div');
      wrap.className = 'camera-presets';
      wrap.setAttribute('aria-label', t('cam.lensPresets'));
      for (const mm of LENS_PRESETS)
        wrap.append(
          button(
            `camera-lens-${mm}`,
            `${mm} mm`,
            () => patch('focal', mm),
            undefined,
            `button ${spec.focal === mm ? 'primary' : 'secondary'} sm`,
          ),
        );
      return wrap;
    })(),
    select(
      'camera-sensor-fit',
      t('cam.sensorFit'),
      spec.sensorFit,
      (['auto', 'horizontal', 'vertical'] as const).map((value) => ({
        value,
        label: t(`cam.fit.${value}`),
      })),
      (value) => patch('sensorFit', value as CameraSpec['sensorFit']),
    ),
    num(
      'camera-sensor',
      t('cam.sensor'),
      spec.sensor,
      [1, 200],
      (value) => patch('sensor', value),
      { unit: 'mm', step: 0.1 },
    ),
    select(
      'camera-sensor-preset',
      t('cam.sensorPreset'),
      SENSOR_PRESETS.find(([, mm]) => mm === spec.sensor)?.[0] ?? '',
      [
        { value: '', label: t('cam.custom') },
        ...SENSOR_PRESETS.map(([id, mm]) => ({
          value: id,
          label: `${t(`cam.sensorName.${id}`)} (${mm} mm)`,
        })),
      ],
      (value) => {
        const found = SENSOR_PRESETS.find(([id]) => id === value);
        if (found) patch('sensor', found[1]);
      },
    ),
    num(
      'camera-shift-x',
      t('cam.shiftX'),
      spec.shiftX,
      [-2, 2],
      (value) => patch('shiftX', value),
      { step: 0.01, decimals: 3 },
    ),
    num(
      'camera-shift-y',
      t('cam.shiftY'),
      spec.shiftY,
      [-2, 2],
      (value) => patch('shiftY', value),
      { step: 0.01, decimals: 3 },
    ),
    num(
      'camera-clip-start',
      t('cam.clipStart'),
      spec.clipStart,
      [0.001, 1e6],
      (value) => patch('clipStart', value),
      { step: 1 },
    ),
    num(
      'camera-clip-end',
      t('cam.clipEnd'),
      spec.clipEnd,
      [0.01, 1e7],
      (value) => patch('clipEnd', value),
      { step: 100 },
    ),
    toggle('camera-limits', t('cam.limits'), spec.showLimits, (on) =>
      patch('showLimits', on),
    ),
  ];
  parts.push(group('lens', t('cam.lens'), lens, true));

  const dof = spec.dof;
  const setDof = (next: Partial<CameraSpec['dof']>) =>
    patch('dof', { ...dof, ...next }, 'Depth of field');
  const pick = button(
    'camera-pick-focus',
    t(cameraUi.pickFocus ? 'cam.picking' : 'cam.pickFocus'),
    () => {
      cameraUi.pickFocus = !cameraUi.pickFocus;
      cameraUi.pickShot = selected?.layer.id ?? null;
      deps.rerender();
    },
    'eyedropper',
  );
  pick.setAttribute('aria-pressed', String(cameraUi.pickFocus));
  parts.push(
    group('dof', t('cam.dof'), [
      toggle('camera-dof', t('cam.dofOn'), dof.enabled, (on) =>
        setDof({ enabled: on }),
      ),
      row(
        select(
          'camera-focus-object',
          t('cam.focusObject'),
          dof.focusLayer ?? '',
          layerOptions,
          (value) => setDof({ focusLayer: value || null }),
        ),
        pick,
      ),
      num(
        'camera-focus-distance',
        t('cam.focusDistance'),
        dof.distance,
        [-1e5, 1e5],
        (value) => setDof({ distance: value }),
        { step: 10 },
      ),
      num(
        'camera-fstop',
        t('cam.fStop'),
        dof.fStop,
        [0.5, 128],
        (value) => setDof({ fStop: value }),
        { step: 0.1, decimals: 1 },
      ),
      num(
        'camera-blades',
        t('cam.blades'),
        dof.blades,
        [0, 16],
        (value) =>
          setDof({ blades: value > 0 && value < 3 ? 3 : Math.round(value) }),
        { decimals: 0 },
      ),
      num(
        'camera-aperture-rotation',
        t('cam.apertureRotation'),
        dof.rotation,
        [-180, 180],
        (value) => setDof({ rotation: value }),
        { unit: '°' },
      ),
      num(
        'camera-aperture-ratio',
        t('cam.apertureRatio'),
        dof.ratio,
        [0.01, 2],
        (value) => setDof({ ratio: value }),
        { step: 0.05 },
      ),
    ]),
  );

  const safe = spec.safeAreas;
  const setSafe = (next: Partial<CameraSpec['safeAreas']>) =>
    patch('safeAreas', { ...safe, ...next }, 'Safe areas');
  const pairFields = (
    id: string,
    label: string,
    value: readonly [number, number],
    onCommit: (next: [number, number]) => void,
  ) =>
    row(
      num(
        `camera-${id}-x`,
        `${label} X`,
        value[0] * 100,
        [0, 50],
        (x) => onCommit([x / 100, value[1]]),
        { unit: '%', step: 0.5, decimals: 1 },
      ),
      num(
        `camera-${id}-y`,
        `${label} Y`,
        value[1] * 100,
        [0, 50],
        (y) => onCommit([value[0], y / 100]),
        { unit: '%', step: 0.5, decimals: 1 },
      ),
    );
  parts.push(
    group('overlays', t('cam.overlays'), [
      toggle('camera-safe-areas', t('cam.safeAreas'), safe.show, (on) =>
        setSafe({ show: on }),
      ),
      pairFields('title-safe', t('cam.titleSafe'), safe.title, (title) =>
        setSafe({ title }),
      ),
      pairFields('action-safe', t('cam.actionSafe'), safe.action, (action) =>
        setSafe({ action }),
      ),
      toggle('camera-center-cut', t('cam.centerCut'), safe.centerCut, (on) =>
        setSafe({ centerCut: on }),
      ),
      toggle(
        'camera-passepartout',
        t('cam.passepartout'),
        spec.passepartout.show,
        (on) =>
          patch(
            'passepartout',
            { ...spec.passepartout, show: on },
            'Passepartout',
          ),
      ),
      num(
        'camera-passepartout-alpha',
        t('cam.alpha'),
        spec.passepartout.alpha * 100,
        [0, 100],
        (value) =>
          patch(
            'passepartout',
            { ...spec.passepartout, alpha: value / 100 },
            'Passepartout',
          ),
        { unit: '%', decimals: 0 },
      ),
      ...COMPOSITION_GUIDES.map((guide) =>
        toggle(
          `camera-guide-${guide}`,
          t(`cam.guide.${guide}`),
          spec.guides[guide],
          (on) =>
            patch(
              'guides',
              { ...spec.guides, [guide]: on },
              'Composition guides',
            ),
        ),
      ),
      num(
        'camera-display-size',
        t('cam.displaySize'),
        spec.display.size,
        [0.1, 5],
        (value) =>
          patch('display', { ...spec.display, size: value }, 'Camera display'),
        { step: 0.1 },
      ),
      toggle(
        'camera-show-name',
        t('cam.showName'),
        spec.display.showName,
        (on) =>
          patch('display', { ...spec.display, showName: on }, 'Camera display'),
      ),
      toggle(
        'camera-show-sensor',
        t('cam.showSensor'),
        spec.display.showSensor,
        (on) =>
          patch(
            'display',
            { ...spec.display, showSensor: on },
            'Camera display',
          ),
      ),
    ]),
  );

  // Background image (a reference on the camera view, exported only when
  // Include in render is on).
  const media = deps
    .assets()
    .filter((asset) => asset.type === 'image' || asset.type === 'video');
  const bg = spec.background;
  const setBg = (next: Partial<CameraBackground> | null) =>
    patch(
      'background',
      next === null || !(next.assetId ?? bg?.assetId)
        ? null
        : ({
            alpha: 0.5,
            depth: 'back',
            frame: 'fit',
            offset: [0, 0],
            rotation: 0,
            scale: 1,
            flipX: false,
            flipY: false,
            render: false,
            ...bg,
            ...next,
          } as CameraBackground),
      'Camera background',
    );
  const background: (HTMLElement | null)[] = [
    select(
      'camera-bg-asset',
      t('cam.bgImage'),
      bg?.assetId ?? '',
      [
        { value: '', label: t('cam.none') },
        ...media.map((asset) => ({ value: asset.id, label: asset.name })),
      ],
      (value) => setBg(value ? { assetId: value } : null),
    ),
  ];
  if (bg)
    background.push(
      num(
        'camera-bg-alpha',
        t('cam.alpha'),
        bg.alpha * 100,
        [0, 100],
        (value) => setBg({ alpha: value / 100 }),
        { unit: '%', decimals: 0 },
      ),
      select(
        'camera-bg-depth',
        t('cam.bgDepth'),
        bg.depth,
        [
          { value: 'back', label: t('cam.back') },
          { value: 'front', label: t('cam.front') },
        ],
        (value) => setBg({ depth: value as CameraBackground['depth'] }),
      ),
      select(
        'camera-bg-frame',
        t('cam.frameMethod'),
        bg.frame,
        (['stretch', 'fit', 'crop'] as const).map((value) => ({
          value,
          label: t(`cam.method.${value}`),
        })),
        (value) => setBg({ frame: value as CameraBackground['frame'] }),
      ),
      row(
        num(
          'camera-bg-offset-x',
          t('cam.offsetX'),
          bg.offset[0],
          [-2, 2],
          (x) => setBg({ offset: [x, bg.offset[1]] }),
          { step: 0.01, decimals: 3 },
        ),
        num(
          'camera-bg-offset-y',
          t('cam.offsetY'),
          bg.offset[1],
          [-2, 2],
          (y) => setBg({ offset: [bg.offset[0], y] }),
          { step: 0.01, decimals: 3 },
        ),
      ),
      num(
        'camera-bg-rotation',
        t('cam.rotation'),
        bg.rotation,
        [-360, 360],
        (value) => setBg({ rotation: value }),
        { unit: '°' },
      ),
      num(
        'camera-bg-scale',
        t('cam.scale'),
        bg.scale,
        [0.01, 20],
        (value) => setBg({ scale: value }),
        { step: 0.05 },
      ),
      toggle('camera-bg-flip-x', t('cam.flipX'), bg.flipX, (on) =>
        setBg({ flipX: on }),
      ),
      toggle('camera-bg-flip-y', t('cam.flipY'), bg.flipY, (on) =>
        setBg({ flipY: on }),
      ),
      toggle('camera-bg-render', t('cam.includeInRender'), bg.render, (on) =>
        setBg({ render: on }),
      ),
    );
  parts.push(group('background', t('cam.background'), background));

  parts.push(
    group('track-to', t('cam.trackTo'), [
      select(
        'camera-track-target',
        t('cam.target'),
        spec.trackTo.layerId ?? '',
        layerOptions,
        (value) =>
          patch(
            'trackTo',
            { ...spec.trackTo, layerId: value || null },
            'Track To',
          ),
      ),
      select(
        'camera-track-up',
        t('cam.upAxis'),
        spec.trackTo.up,
        (['Y', '-Y', 'X', '-X'] as const).map((value) => ({
          value,
          label: value,
        })),
        (value) =>
          patch(
            'trackTo',
            { ...spec.trackTo, up: value as CameraSpec['trackTo']['up'] },
            'Track To',
          ),
      ),
    ]),
  );
  return parts.filter((item): item is HTMLElement => !!item);
}

/** Accordions opened or closed by the user (transient). */
const opened = new Set<string>();
const closed = new Set<string>();
const formatTime = (seconds: number) => `${Math.round(seconds * 10) / 10}s`;
