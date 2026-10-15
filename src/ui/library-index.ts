// P4 (CREATOR-PACK-SPEC 8): "Copy library index for AI". A compact plain
// text of what an AI may refer to when it writes a creator pack: every
// library and Creator item (id, English name, tags, kind, control names), the
// Blocks, the Animate presets, the effect, filter, adjustment and transition
// ids, the fonts and the open scene's size and frame rate. It stays under
// 40 KB: when the full list is larger, items are grouped by pack with names
// only, and as a last resort the longest groups are cut with a count.
export const INDEX_LIMIT = 40 * 1024;

export interface IndexItem {
  readonly id: string;
  readonly name: string;
  readonly kind: string;
  readonly tags?: readonly string[];
  readonly controls?: readonly string[];
}
export interface IndexGroup {
  /** "Built-in library", or the creator pack's id and version. */
  readonly title: string;
  readonly items: readonly IndexItem[];
}
export interface IndexInput {
  readonly canvas: { width: number; height: number; fps: number };
  readonly fonts: readonly string[];
  readonly animate: Readonly<Record<string, readonly string[]>>;
  readonly fx: Readonly<Record<string, readonly string[]>>;
  readonly blocks: readonly IndexItem[];
  readonly groups: readonly IndexGroup[];
}

const bytes = (text: string) => new TextEncoder().encode(text).length;
const fps = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);
const line = (item: IndexItem, full: boolean) =>
  full
    ? [
        `${item.kind} ${item.id} "${item.name}"`,
        item.tags?.length ? `tags: ${item.tags.join(', ')}` : '',
        item.controls?.length ? `controls: ${item.controls.join(', ')}` : '',
      ]
        .filter(Boolean)
        .join(' | ')
    : `${item.id} "${item.name}"`;

/** The index text (always under INDEX_LIMIT bytes). */
export function libraryIndex(input: IndexInput): string {
  const head = [
    'AIVE library index v1 (ids an AI may use in a creator pack)',
    `canvas: ${input.canvas.width}x${input.canvas.height} at ${fps(input.canvas.fps)} fps`,
    `fonts: ${input.fonts.join(', ')}`,
    ...Object.entries(input.animate).map(
      ([slot, ids]) => `animate ${slot}: ${ids.join(', ')}`,
    ),
    ...Object.entries(input.fx).map(
      ([kind, ids]) => `${kind}: ${ids.join(', ')}`,
    ),
    '',
    'blocks (code-block ids):',
    ...input.blocks.map((item) => `  ${line(item, true)}`),
  ];
  const build = (full: boolean, cap = Infinity) =>
    [
      ...head,
      ...input.groups.flatMap((group) => {
        const shown = group.items.slice(0, cap);
        const rest = group.items.length - shown.length;
        return [
          '',
          `${group.title} (${group.items.length} items${full ? '' : ', names only'}):`,
          ...(full
            ? shown.map((item) => `  ${line(item, true)}`)
            : Object.entries(
                shown.reduce<Record<string, IndexItem[]>>((map, item) => {
                  (map[item.kind] ??= []).push(item);
                  return map;
                }, {}),
              ).map(
                ([kind, items]) =>
                  `  ${kind}: ${items.map((item) => line(item, false)).join('; ')}`,
              )),
          ...(rest > 0 ? [`  ... ${rest} more`] : []),
        ];
      }),
    ].join('\n') + '\n';
  let text = build(true);
  if (bytes(text) <= INDEX_LIMIT) return text;
  text = build(false);
  for (
    let cap = 400;
    bytes(text) > INDEX_LIMIT && cap >= 1;
    cap = Math.floor(cap / 2)
  )
    text = build(false, cap);
  // The head alone could still be too long (it never is with the built-ins).
  while (bytes(text) > INDEX_LIMIT) text = text.slice(0, text.length - 1024);
  return text;
}
