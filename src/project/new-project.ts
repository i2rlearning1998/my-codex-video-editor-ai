import { createProject, createComposition, type EditorEngine } from '../core';

export const aspects = [
  '16:9',
  '9:16',
  '1:1',
  '4:5',
  '2:3',
  '21:9',
  '4:3',
  'custom',
] as const;
export const resolutions = {
  '720p': 720,
  '1080p': 1080,
  '1440p': 1440,
  '4K': 2160,
} as const;
export const frameRates = [24, 25, 30, 50, 60] as const;
export type Aspect = (typeof aspects)[number];
export type Resolution = keyof typeof resolutions;
export interface NewProjectSettings {
  name: string;
  width: number;
  height: number;
  fps: number;
  background: string;
}
export type NewProjectInput = Partial<
  Record<
    | 'name'
    | 'aspect'
    | 'resolution'
    | 'width'
    | 'height'
    | 'fps'
    | 'background',
    unknown
  >
>;
export type NewProjectResult =
  | { ok: true; settings: NewProjectSettings }
  | { ok: false; errors: Partial<Record<keyof NewProjectInput, string>> };
export function presetSize(
  aspect: Exclude<Aspect, 'custom'>,
  resolution: Resolution,
) {
  const [x, y] = aspect.split(':').map(Number) as [number, number];
  const shortSide = resolutions[resolution];
  const even = (value: number) => Math.round(value / 2) * 2;
  return {
    width: even((shortSide * x) / Math.min(x, y)),
    height: even((shortSide * y) / Math.min(x, y)),
  };
}
const numeric = (value: unknown) =>
  typeof value === 'number' ||
  (typeof value === 'string' && value.trim() !== '')
    ? Number(value)
    : NaN;
export function validateNewProject(input: NewProjectInput): NewProjectResult {
  const errors: Partial<Record<keyof NewProjectInput, string>> = {};
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 256) errors.name = 'project.error.name';
  if (!aspects.includes(input.aspect as Aspect))
    errors.aspect = 'project.error.aspect';
  let width = numeric(input.width),
    height = numeric(input.height);
  if (input.aspect !== 'custom') {
    if (!Object.hasOwn(resolutions, String(input.resolution)))
      errors.resolution = 'project.error.resolution';
    if (!errors.aspect && !errors.resolution)
      ({ width, height } = presetSize(
        input.aspect as Exclude<Aspect, 'custom'>,
        input.resolution as Resolution,
      ));
  }
  for (const [field, value] of [
    ['width', width],
    ['height', height],
  ] as const) {
    if (
      !Number.isInteger(value) ||
      value % 2 !== 0 ||
      value < 16 ||
      value > 7680
    )
      errors[field] = 'project.error.size';
  }
  const fps = numeric(input.fps);
  if (!(frameRates as readonly number[]).includes(fps))
    errors.fps = 'project.error.fps';
  const background =
    typeof input.background === 'string' ? input.background.toLowerCase() : '';
  if (!/^#[0-9a-f]{6}$/.test(background))
    errors.background = 'project.error.background';
  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, settings: { name, width, height, fps, background } };
}
/** Validated new-document boundary; ordinary editing must continue through commands. */
export function createProjectFromSettings(
  settings: NewProjectSettings,
  engine: EditorEngine,
): void {
  const result = validateNewProject({ ...settings, aspect: 'custom' });
  if (!result.ok) throw new Error('project.error.invalid');
  const normalized = result.settings;
  const project = createProject(normalized.name);
  project.settings.backgroundColor = normalized.background;
  project.compositions = [
    createComposition({
      name: normalized.name,
      width: normalized.width,
      height: normalized.height,
      fps: normalized.fps,
    }),
  ];
  engine.load(project);
}
