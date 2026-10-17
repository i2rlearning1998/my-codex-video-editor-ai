// T2: Copy AI brief. One plain-text block to paste into Claude chat: the
// task, the project's facts, the live library index (ids and short labels,
// grouped by Creator Pack kind), the authoring rules (from
// docs/CREATOR-PACK-AUTHORING.md, examples left out; B1: its theme and style
// notes kept) and an optional request.
// Everything is read from live registries by the caller, so it never goes
// stale; it stays under 40 KB (D-255).
export const BRIEF_LIMIT = 40 * 1024;
export const BRIEF_HEADER =
  'You are authoring a Creator Pack for the AI-Native Video Editor. Reply with a single pack text (=== PACK === ...). No explanations.';

export interface BriefEntry {
  readonly id: string;
  readonly label: string;
}
export interface BriefInput {
  readonly project: {
    readonly width: number;
    readonly height: number;
    readonly fps: number;
    readonly duration: number;
    readonly theme: {
      readonly name: string;
      readonly palette: Readonly<Record<string, string | undefined>>;
      readonly fonts: { readonly heading: string; readonly body: string };
      readonly motion: string;
    } | null;
  };
  /** Every Creator Pack kind (ITEM_KINDS) with what the editor has of it. */
  readonly kinds: readonly string[];
  readonly entries: Readonly<Record<string, readonly BriefEntry[]>>;
  readonly blocks: readonly BriefEntry[];
  readonly animate: Readonly<Record<string, readonly string[]>>;
  readonly fonts: readonly string[];
  /** The authoring document (Markdown). */
  readonly authoring: string;
  readonly request?: string;
}

const bytes = (text: string) => new TextEncoder().encode(text).length;
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);
const ratio = (width: number, height: number) => {
  const d = gcd(Math.round(width), Math.round(height)) || 1;
  return `${Math.round(width) / d}:${Math.round(height) / d}`;
};
const fps = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2);

/**
 * The rules block: the authoring document up to its examples, its theme
 * notes and its quality gate, without code examples; at most ~3,000 words.
 */
export function authoringRules(doc: string, maxWords = 3000): string {
  const cut = (text: string) =>
    text.replace(/<!-- prettier-ignore -->\n```json\n[\s\S]*?\n```\n?/g, '');
  const examples = doc.indexOf('## Complete examples');
  const head = examples >= 0 ? doc.slice(0, examples) : doc;
  const theme = /### Theme\n([\s\S]*?)(?=\n### |\n## )/.exec(doc);
  const style = /### Style\n([\s\S]*?)(?=\n### |\n## )/.exec(doc);
  const gate = /## Quality gate before delivery\n[\s\S]*$/.exec(doc);
  const text = [
    cut(head).replace(/^# .*\n/, ''),
    theme ? `## Theme items\n${cut(theme[1]!)}` : '',
    style ? `## Style items\n${cut(style[1]!)}` : '',
    gate ? cut(gate[0]) : '',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const words = text.split(/\s+/);
  return words.length <= maxWords ? text : words.slice(0, maxWords).join(' ');
}

/** The brief text and how many ids it lists. */
export function buildAiBrief(input: BriefInput): {
  text: string;
  count: number;
} {
  const { project } = input;
  const theme = project.theme;
  const facts = [
    'PROJECT',
    `canvas: ${Math.round(project.width)}x${Math.round(project.height)} (${ratio(project.width, project.height)}), ${fps(project.fps)} fps, ${project.duration.toFixed(1)} s`,
    theme
      ? `theme: ${theme.name}; palette ${Object.entries(theme.palette)
          .filter(([, value]) => value)
          .map(([slot, value]) => `${slot} ${value}`)
          .join(
            ', ',
          )}; fonts heading ${theme.fonts.heading}, body ${theme.fonts.body}; motion ${theme.motion}`
      : 'theme: none applied',
  ];
  const build = (cap: number) => {
    let count = 0;
    const list = (items: readonly BriefEntry[]) => {
      const shown = items.slice(0, cap);
      count += shown.length;
      const rest = items.length - shown.length;
      return [
        ...shown.map((item) => `  ${item.id} - ${item.label}`),
        ...(rest > 0 ? [`  ... ${rest} more`] : []),
        ...(items.length ? [] : ['  (none yet)']),
      ];
    };
    const library = [
      'LIBRARY (use these ids; never invent one)',
      ...input.kinds.flatMap((kind) => [
        `${kind}:`,
        ...list(input.entries[kind] ?? []),
      ]),
      'blocks (Tier B starters):',
      ...list(input.blocks),
      ...Object.entries(input.animate).map(
        ([slot, ids]) => `animate ${slot}: ${ids.join(', ') || '(none)'}`,
      ),
      `fonts: ${input.fonts.join(', ')}`,
    ];
    const text = [
      BRIEF_HEADER,
      '',
      ...facts,
      '',
      ...library,
      '',
      'RULES',
      authoringRules(input.authoring),
      ...(input.request?.trim()
        ? ['', `REQUEST: ${input.request.trim()}`]
        : []),
    ].join('\n');
    return { text: `${text}\n`, count };
  };
  let result = build(Infinity);
  for (
    let cap = 200;
    bytes(result.text) > BRIEF_LIMIT && cap >= 1;
    cap = Math.floor(cap / 2)
  )
    result = build(cap);
  return result;
}
