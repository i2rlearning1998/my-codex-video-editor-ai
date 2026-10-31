import { openMediaStore, type MediaStore } from '../media/store';
import type { EditorEngine } from '../core/engine';
import type { Command } from '../core/commands';
import type { DeepReadonly, Project } from '../core/model';
import {
  BUILT_IN_THEMES,
  applyThemeCommands,
  decodeTheme,
  projectThemes,
  themeSchema,
  isManualColor,
  slotOf,
  colorOf,
  type Theme,
  type ThemeLayer,
} from './themes';

export type ThemeErrorCode =
  | 'NAME_REQUIRED'
  | 'NAME_TAKEN'
  | 'NAME_TOO_LONG'
  | 'NOT_FOUND'
  | 'STORAGE_UNAVAILABLE';
export class ThemeError extends Error {
  constructor(
    readonly code: ThemeErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ThemeError';
  }
}
export interface ThemeApplyResult {
  changed: number;
  keptManual: number;
  overridden: number;
}
export interface ApplyThemeOptions {
  overrideManual?: boolean;
}
type ThemeStore = Pick<MediaStore, 'read' | 'write' | 'remove' | 'keys'>;
const layersOf = (project: DeepReadonly<Project>): ThemeLayer[] => {
  const result: ThemeLayer[] = [];
  const visit = (layers: readonly ThemeLayer[]) => {
    for (const layer of layers) {
      result.push(layer);
      visit(layer.children);
    }
  };
  for (const scene of project.compositions) visit(scene.layers);
  return result;
};

/** A single library instance per editor; injected storage also supports headless tests. */
export function createThemeLibrary(store: ThemeStore) {
  let pending: Promise<unknown> = Promise.resolve();
  const serial = <T>(action: () => Promise<T>): Promise<T> => {
    const result = pending.then(action, action);
    pending = result.catch(() => undefined);
    return result;
  };
  const read = async (): Promise<Theme[]> => {
    const saved: Theme[] = [];
    for (const key of await store.keys()) {
      if (!key.startsWith('theme/')) continue;
      const blob = await store.read(key);
      if (!blob) continue;
      try {
        const parsed = themeSchema.safeParse(JSON.parse(await blob.text()));
        if (parsed.success && key === `theme/${parsed.data.id}`)
          saved.push(parsed.data);
      } catch {
        /* Invalid saved content is not a theme. */
      }
    }
    return saved;
  };
  const write = (value: Theme) =>
    store.write(
      `theme/${value.id}`,
      new Blob([JSON.stringify(themeSchema.parse(value))], {
        type: 'application/json',
      }),
    );
  const checkedName = async (name: string, id?: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new ThemeError('NAME_REQUIRED', 'Enter a theme name.');
    if (trimmed.length > 40)
      throw new ThemeError('NAME_TOO_LONG', 'Use at most 40 characters.');
    if (
      [...BUILT_IN_THEMES, ...(await read())].some(
        (theme) =>
          theme.id !== id && theme.name.toLowerCase() === trimmed.toLowerCase(),
      )
    )
      throw new ThemeError('NAME_TAKEN', 'A theme already uses this name.');
    return trimmed;
  };
  const listThemes = () =>
    serial(async () => [
      ...structuredClone(BUILT_IN_THEMES),
      ...(await read()),
    ]);
  const saveTheme = (name: string, fromProject: DeepReadonly<Project>) => {
    const snapshot = structuredClone(fromProject);
    return serial(async () => {
      const validName = await checkedName(name);
      const current = projectThemes(
        snapshot.compositions[0]?.markers ?? [],
      ).current;
      const base =
        [...BUILT_IN_THEMES, ...(await read())].find(
          (theme) => theme.id === current,
        ) ?? BUILT_IN_THEMES[0]!;
      const layers = layersOf(snapshot);
      const props = (layer: ThemeLayer) =>
        layer.properties as Record<string, { value?: unknown } | undefined>;
      const colors = (type: string) =>
        layers
          .filter((layer) => layer.type === type)
          .flatMap((layer) => {
            const value = props(layer).fill?.value;
            return typeof value === 'string' && /^#[a-f\d]{6}$/i.test(value)
              ? [value]
              : [];
          });
      const shapes = [...new Set(colors('shape'))];
      const texts = colors('text');
      const fonts = layers
        .filter((layer) => layer.type === 'text')
        .flatMap((layer) => {
          const value = props(layer).fontFamily?.value;
          return typeof value === 'string'
            ? [{ value, heading: Number(props(layer).fontSize?.value) >= 48 }]
            : [];
        });
      const palette = {
        ...base.palette,
        background:
          snapshot.compositions[0]?.backgroundColor ??
          snapshot.settings.backgroundColor,
        primary: shapes[0] ?? base.palette.primary,
        accent: shapes[1] ?? shapes[0] ?? base.palette.accent,
        text: texts[0] ?? base.palette.text,
      };
      const value: Theme = {
        id: `my-${crypto.randomUUID()}`,
        name: validName,
        palette,
        fonts: {
          heading:
            fonts.find((font) => font.heading)?.value ??
            fonts[0]?.value ??
            base.fonts.heading,
          body:
            fonts.find((font) => !font.heading)?.value ??
            fonts[0]?.value ??
            base.fonts.body,
        },
        motion: base.motion,
      };
      await write(value);
      return value;
    });
  };
  const renameTheme = (id: string, name: string) =>
    serial(async () => {
      const theme = (await read()).find((theme) => theme.id === id);
      if (!theme) throw new ThemeError('NOT_FOUND', 'Saved theme not found.');
      const next = { ...theme, name: await checkedName(name, id) };
      await write(next);
      return next;
    });
  const deleteTheme = (id: string) =>
    serial(async () => {
      if (!(await read()).some((theme) => theme.id === id)) return;
      await store.remove(`theme/${id}`);
      if ((await store.keys()).includes(`feel/${id}`))
        await store.remove(`feel/${id}`);
    });
  /**
   * FINAL3 V4: a plan's feel saved as a theme. The theme record keeps the
   * palette, fonts, motion and caption style; the rest of the feel
   * (transition, camera tendency, pacing) is kept beside it as
   * `feel/<id>`, so themes stay one schema.
   */
  const saveFeelTheme = (
    name: string,
    feel: Omit<Theme, 'id' | 'name'>,
    extras: FeelExtras,
  ) =>
    serial(async () => {
      const validName = await checkedName(name);
      const value: Theme = {
        ...feel,
        id: `feel-${Date.now().toString(36)}`,
        name: validName,
      };
      await write(value);
      await store.write(
        `feel/${value.id}`,
        new Blob([JSON.stringify(extras)], { type: 'application/json' }),
      );
      return value;
    });
  /** The feel extras saved with a theme, or null. */
  const feelOf = (id: string) =>
    serial(async (): Promise<FeelExtras | null> => {
      const blob = (await store.keys()).includes(`feel/${id}`)
        ? await store.read(`feel/${id}`)
        : null;
      if (!blob) return null;
      try {
        return JSON.parse(await blob.text()) as FeelExtras;
      } catch {
        return null;
      }
    });
  const migrateThemes = (
    project: EditorEngine,
    onMoved?: (id: string) => void,
  ) =>
    serial(async () => {
      // Existing library values win; never overwrite a newer rename with an old marker.
      const existing = new Set((await read()).map((theme) => theme.id));
      let moved = 0;
      for (const scene of project.state.compositions)
        for (const marker of scene.markers) {
          const theme = decodeTheme(marker.label);
          if (!theme || existing.has(theme.id)) continue;
          await write(theme);
          onMoved?.(theme.id);
          existing.add(theme.id);
          moved++;
        }
      if (
        project.state.compositions.some((scene) =>
          scene.markers.some((marker) =>
            marker.label.startsWith('aive:theme '),
          ),
        )
      )
        project.removeLegacyThemeMarkers();
      return moved;
    });
  const applyTheme = async (
    project: EditorEngine,
    themeId: string,
    options: ApplyThemeOptions = {},
  ): Promise<ThemeApplyResult> => {
    const theme = (await listThemes()).find((theme) => theme.id === themeId);
    if (!theme) throw new ThemeError('NOT_FOUND', 'Theme not found.');
    const result: ThemeApplyResult = {
      changed: 0,
      keptManual: 0,
      overridden: 0,
    };
    for (const layer of layersOf(project.state)) {
      const fill = (
        layer.properties as Record<string, { type?: string; value?: unknown }>
      ).fill;
      if (fill?.type !== 'color' || !['shape', 'text'].includes(layer.type))
        continue;
      const slot = slotOf(layer.properties);
      if (!slot && layer.type !== 'text' && !options.overrideManual) continue;
      if (isManualColor(layer, 'fill')) {
        if (!options.overrideManual) {
          result.keptManual++;
          continue;
        }
        result.overridden++;
      }
      if (
        fill.value !==
        colorOf(
          theme.palette,
          slot ?? (layer.type === 'text' ? 'text' : 'primary'),
        )
      )
        result.changed++;
    }
    project.commands.transaction('Apply theme', [
      { type: 'SET_PROJECT_BACKGROUND', color: theme.palette.background },
      ...(applyThemeCommands(project.state.compositions, theme, {
        override: options.overrideManual ?? false,
      }) as Command[]),
    ]);
    return result;
  };
  return {
    listThemes,
    saveTheme,
    renameTheme,
    deleteTheme,
    migrateThemes,
    applyTheme,
    saveFeelTheme,
    feelOf,
  };
}
/** FINAL3 V4: what a feel adds to a theme. */
export interface FeelExtras {
  readonly transition?: string;
  readonly cameraTendency?: string;
  readonly pacing?: string;
}
export type ThemeLibrary = ReturnType<typeof createThemeLibrary>;
let library: Promise<ThemeLibrary> | undefined;
const defaultLibrary = () =>
  (library ??= openMediaStore()
    .then((store) => {
      if (!store)
        throw new ThemeError(
          'STORAGE_UNAVAILABLE',
          'Theme storage is unavailable.',
        );
      return createThemeLibrary(store);
    })
    .catch((error) => {
      library = undefined;
      throw error;
    }));
export const listThemes = async () => (await defaultLibrary()).listThemes();
export const saveTheme = async (
  name: string,
  fromProject: DeepReadonly<Project>,
) => (await defaultLibrary()).saveTheme(name, fromProject);
export const renameTheme = async (id: string, name: string) =>
  (await defaultLibrary()).renameTheme(id, name);
export const deleteTheme = async (id: string) =>
  (await defaultLibrary()).deleteTheme(id);
export const migrateThemes = async (project: EditorEngine) =>
  (await defaultLibrary()).migrateThemes(project);
export const applyTheme = async (
  project: EditorEngine,
  themeId: string,
  options: ApplyThemeOptions = {},
) => (await defaultLibrary()).applyTheme(project, themeId, options);
