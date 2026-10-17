// T2: Copy AI brief. One plain-text block to paste into Claude chat: the
// task, the project's facts, the live library index (ids and short labels,
// grouped by Creator Pack kind), the authoring rules (from
// docs/CREATOR-PACK-AUTHORING.md, examples left out; B1: its theme and style
// notes kept) and an optional request.
// Everything is read from live registries by the caller, so it never goes
// stale; it stays under 40 KB (D-255). B1: with the New AI video form filled
// (or a style chosen) it becomes the creator brief: the CREATOR header, the
// BRIEF (LOCKED and FREE), the style, the project, the library (with the stock
// providers) and the rules, under 60 KB.
import {
  briefFormFilled,
  briefSectionText,
  emptyBriefForm as emptyForm,
  type BriefFormValues,
} from './form';
import type { StyleData } from '../creator-pack/schemas';

export const BRIEF_LIMIT = 40 * 1024;
export const BRIEF_HEADER =
  'You are authoring a Creator Pack for the AI-Native Video Editor. Reply with a single pack text (=== PACK === ...). No explanations.';
/** B1: the creator brief (the New AI video form) may use up to 60 KB. */
export const CREATOR_BRIEF_LIMIT = 60 * 1024;
export const CREATOR_HEADER =
  'You are the creator for the AI-Native Video Editor. Build the whole video as Creator Pack(s). Reply with pack text only, no explanations.';

/** B1: a chosen style, as the brief prints it. */
export interface BriefStyle {
  readonly id: string;
  readonly name: string;
  readonly data: StyleData;
}
/** B1: a stock media provider the editor has (none are built yet). */
export interface BriefStock {
  readonly id: string;
  readonly name: string;
  readonly hasKey: boolean;
}

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
  /** B1: the New AI video form; empty (or absent) keeps the T2 brief. */
  readonly form?: BriefFormValues | null;
  readonly style?: BriefStyle | null;
  readonly stock?: readonly BriefStock[];
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

/** B1: the chosen style in full: its brief, look, kit, asset policy and
 *  output. */
export function styleSectionText(style: BriefStyle): string {
  const d = style.data;
  const kit = (ids: StyleData['kit'][keyof StyleData['kit']]) =>
    ids.length
      ? ids
          .map((entry) =>
            typeof entry === 'string' ? entry : `${entry.id} (optional)`,
          )
          .join(', ')
      : '(none)';
  const look = [
    d.look.themeId ? `theme ${d.look.themeId}` : '',
    d.look.palette
      ? `palette ${Object.entries(d.look.palette)
          .map(([slot, colour]) => `${slot} ${colour}`)
          .join(', ')}`
      : '',
    d.look.fonts
      ? `fonts heading ${d.look.fonts.heading}, body ${d.look.fonts.body}`
      : '',
    d.look.motion ? `motion ${d.look.motion}` : '',
  ].filter(Boolean);
  return [
    '=== STYLE ===',
    `${style.name} (${style.id}), category ${d.category}`,
    d.description,
    `Mood: ${d.brief.mood}`,
    `Pacing: ${d.brief.pacing}`,
    'Structure:',
    ...d.brief.structure.map((step, index) => `  ${index + 1}. ${step}`),
    'Do not:',
    ...(d.brief.doNot.length
      ? d.brief.doNot.map((rule) => `  - ${rule}`)
      : ['  (nothing listed)']),
    `Quality bar: ${d.brief.qualityBar}`,
    `Look: ${look.join('; ') || '(free)'}`,
    `Kit: library ${kit(d.kit.preferLibrary)}; presets ${kit(d.kit.presets)}; transitions ${kit(d.kit.transitions)}; effects ${kit(d.kit.effects)}`,
    `Accepts: ${d.inputs.accepts.join(', ')}`,
    `Asset policy: ${d.assetPolicy.order.join(' then ')}; AI images at most ${d.assetPolicy.aiImagesMax}, AI videos at most ${d.assetPolicy.aiVideosMax}`,
    `Output: ${d.output.aspect}, ${d.output.fps} fps, ${d.output.durationHint}`,
    `Default freedom: ${d.defaultFreedom}`,
    '=== END STYLE ===',
  ].join('\n');
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
  const creator =
    !!input.style || (!!input.form && briefFormFilled(input.form));
  const stock = input.stock ?? [];
  const build = (cap: number, labels = true, note = '') => {
    let count = 0;
    const list = (items: readonly BriefEntry[]) => {
      const shown = items.slice(0, cap);
      count += shown.length;
      const rest = items.length - shown.length;
      return [
        ...shown.map((item) =>
          labels ? `  ${item.id} - ${item.label}` : `  ${item.id}`,
        ),
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
      ...(creator
        ? [
            `stock providers: ${
              stock.length
                ? stock
                    .map(
                      (provider) =>
                        `${provider.id} (${provider.name}, ${provider.hasKey ? 'key set' : 'no key: unavailable'})`,
                    )
                    .join(', ')
                : 'none installed (use the editor library)'
            }`,
          ]
        : []),
    ];
    const text = creator
      ? [
          CREATOR_HEADER,
          ...(note ? [note] : []),
          '',
          briefSectionText(
            input.form ?? emptyForm(),
            input.style ? { id: input.style.id, name: input.style.name } : null,
          ),
          ...(input.style ? ['', styleSectionText(input.style)] : []),
          '',
          ...facts,
          '',
          ...library,
          '',
          'RULES',
          authoringRules(input.authoring),
        ].join('\n')
      : [
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
  if (!creator) {
    let result = build(Infinity);
    for (
      let cap = 200;
      bytes(result.text) > BRIEF_LIMIT && cap >= 1;
      cap = Math.floor(cap / 2)
    )
      result = build(cap);
    return result;
  }
  // B1: shortened deterministically: labels dropped first (ids only), then
  // each kind's list cut in half until the block fits; the header says so.
  let result = build(Infinity);
  if (bytes(result.text) <= CREATOR_BRIEF_LIMIT) return result;
  result = build(
    Infinity,
    false,
    'Note: the library index is shortened to fit 60 KB: ids only, labels dropped.',
  );
  for (
    let cap = 200;
    bytes(result.text) > CREATOR_BRIEF_LIMIT && cap >= 1;
    cap = Math.floor(cap / 2)
  )
    result = build(
      cap,
      false,
      `Note: the library index is shortened to fit 60 KB: ids only, labels dropped, at most ${cap} per kind.`,
    );
  return result;
}
