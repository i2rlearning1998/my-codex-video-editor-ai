// J: builds every composition of a Creator Pack (the AI's whole answer).
// The pack's own style and theme are used, and its native items (shape,
// background, text, template) are library items under `pack/item` as well as
// the ids the caller's library knows. The AI connector and the CLI
// (`npm run composition:build`) both call this.
import { packSchema, type CreatorItem } from '../creator-pack/schemas';
import { parsePack } from '../creator-pack/parser';
import { libraryItemSchema, type LibraryItem } from '../library/schema';
import { themeSchema, type Theme } from '../themes/themes';
import {
  buildProjectFromComposition,
  type BuildOptions,
  type BuildResult,
} from './build';

export interface PackBuild {
  readonly itemId: string;
  readonly name: string;
  readonly result: BuildResult;
}

export async function buildCompositionsFromPack(
  input: unknown,
  options: Omit<BuildOptions, 'style'> = {},
): Promise<PackBuild[]> {
  const pack = packSchema.parse(parsePack(input));
  const own = new Map<string, LibraryItem>();
  for (const item of pack.items) {
    const parsed = libraryItemSchema.safeParse({
      id: item.id,
      name: item.name,
      tags: item.tags,
      type: item.type,
      data: item.data,
    });
    if (parsed.success) own.set(`${pack.pack.id}/${item.id}`, parsed.data);
  }
  const style = pack.items.find(
    (item): item is Extract<CreatorItem, { type: 'style' }> =>
      item.type === 'style',
  );
  const themeItem = pack.items.find(
    (item): item is Extract<CreatorItem, { type: 'theme' }> =>
      item.type === 'theme',
  );
  const theme: Theme | null = themeItem
    ? themeSchema.parse({
        id: themeItem.id,
        name: themeItem.name.en.slice(0, 40),
        ...themeItem.data,
      })
    : null;
  const builds: PackBuild[] = [];
  for (const item of pack.items) {
    if (item.type !== 'composition') continue;
    builds.push({
      itemId: item.id,
      name: item.name.en,
      result: await buildProjectFromComposition(item.data, {
        ...options,
        ...(style ? { style: style.data } : {}),
        theme: options.theme ?? theme,
        library: (id) => own.get(id) ?? options.library?.(id),
      }),
    });
  }
  return builds;
}

/** Plain-text report of one build: what is missing and every warning. */
export function buildReport(build: PackBuild): string {
  const { result } = build;
  const lines = [`Composition ${build.itemId} (${build.name})`];
  if (result.errors.length) {
    lines.push('  Invalid:');
    for (const error of result.errors) lines.push(`    - ${error}`);
    return lines.join('\n');
  }
  const project = result.project!;
  lines.push(
    `  Built: ${project.compositions.length} scene(s), ${project.compositions.reduce((n, c) => n + c.layers.length, 0)} layer(s), ${project.assets.length} asset(s).`,
  );
  lines.push(result.missing.length ? '  Missing:' : '  Missing: none');
  for (const item of result.missing)
    lines.push(
      `    - ${
        item.kind === 'slot'
          ? `slot ${item.slot.id} (${item.slot.type}): ${item.slot.hint}`
          : item.kind === 'voice-over'
            ? `voice-over (${item.request.lang}): ${item.request.text.slice(0, 80)}`
            : item.kind === 'captions'
              ? `captions: ${item.reason}`
              : `${item.path}: ${item.reason}`
      }`,
    );
  lines.push(result.warnings.length ? '  Warnings:' : '  Warnings: none');
  for (const warning of result.warnings)
    lines.push(`    - [${warning.code}] ${warning.message}`);
  return lines.join('\n');
}
