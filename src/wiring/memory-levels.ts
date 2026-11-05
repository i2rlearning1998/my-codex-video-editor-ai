// P3-WIRING (W2): the three memory levels on top of the store.
//   Style  (read-only into every call; a draft is never read)
//   Project (facts shared by every chat)
//   Chat   (thread plus summary)
// The logic that summarises, extracts facts and distils a Style is Part 1's
// MemoryEngine, injected. This file only stores, enforces and orders.
import type {
  ChatRecord,
  MemoryEngine,
  MemoryFact,
  MemorySettings,
  ProjectMemory,
  StartPath,
  StyleRecord,
  TextCall,
} from '../contracts/p3';
import {
  styleById,
  text as say,
  type PlatformConfig,
  type Style,
} from '../platform-config';
import { failure, P3Error } from './errors';
import type { WiringStore } from './store';

export interface LevelDeps {
  readonly store: WiringStore;
  readonly config: () => PlatformConfig;
  readonly now?: () => Date;
  readonly newId?: (prefix: string) => string;
}
let seq = 0;
const defaultId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;

/** The Style a project reads: a person's active Style, or a config Style. */
export type StyleSource =
  | { readonly kind: 'personal'; readonly style: StyleRecord }
  | { readonly kind: 'config'; readonly style: Style }
  | null;

/** Finds a Style by id. A personal draft is never returned for a call. */
export async function styleSource(
  d: LevelDeps,
  styleId: string | null,
): Promise<StyleSource> {
  if (!styleId) return null;
  const mine = await d.store.style(styleId);
  if (mine)
    return mine.status === 'active' ? { kind: 'personal', style: mine } : null;
  const cfg = styleById(d.config(), styleId);
  return cfg && cfg.enabled ? { kind: 'config', style: cfg } : null;
}

/** The Style block every model context starts with (read-only). */
export function styleBlock(s: StyleSource): string {
  if (!s) return 'STYLE\n(none)';
  if (s.kind === 'config')
    return [
      `STYLE: ${say(s.style.name)}`,
      say(s.style.blurb),
      s.style.playbookText,
    ]
      .filter(Boolean)
      .join('\n');
  const x = s.style;
  const list = (label: string, v: readonly string[]) =>
    v.length ? `${label}:\n${v.map((r) => `- ${r}`).join('\n')}` : '';
  return [
    `STYLE: ${x.name} (version ${x.version})`,
    list('Rules', x.rules),
    list('Do', x.dos),
    list("Don't", x.donts),
    x.palette.length ? `Palette: ${x.palette.join(', ')}` : '',
    `Fonts: ${x.fonts.heading} / ${x.fonts.body}`,
    `Voice: ${x.voice.language}, ${x.voice.tone}`,
    x.pacing ? `Pacing: ${x.pacing}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * The memory context for a Director call: the Style block FIRST, then the
 * engine's project facts, summary and recent turns (given no Style, so the
 * Style is never repeated or changed by it).
 */
export function contextFor(
  engine: MemoryEngine,
  style: StyleSource,
  memory: ProjectMemory,
  chat: ChatRecord,
  settings: MemorySettings,
): { text: string; tokens: number } {
  const rest = engine.context({ style: null, memory, chat, settings });
  const head = styleBlock(style);
  return {
    text: `${head}\n\n${rest.text}`,
    tokens: rest.tokens + Math.ceil(head.length / 4),
  };
}

/** Brief answers as the first project facts ("Label: value"). */
export function briefFacts(
  style: StyleSource,
  answers: Readonly<Record<string, string>>,
  now: string,
  newId: (p: string) => string,
): MemoryFact[] {
  const fields =
    style?.kind === 'config' ? style.style.brief.fields : ([] as const);
  return Object.entries(answers)
    .filter(([, v]) => v.trim() !== '')
    .map(([k, v]) => {
      const f = fields.find((x) => x.id === k);
      const opt = f?.options.find((o) => o.value === v);
      return {
        id: newId('fact'),
        text: `${f ? say(f.label) : k}: ${opt ? say(opt.label) : v.trim()}`,
        source: 'user' as const,
        pinned: true,
        createdAt: now,
      };
    });
}

/** The three start paths; all end in the same kind of chat. */
export async function startConversation(
  d: LevelDeps,
  path: StartPath,
  projectId?: string,
): Promise<{ chat: ChatRecord; project: ProjectMemory }> {
  const now = (d.now ?? (() => new Date()))().toISOString();
  const newId = d.newId ?? defaultId;
  let style: StyleSource = null;
  if (path.kind !== 'blank') {
    const mine = await d.store.style(path.styleId);
    if (mine && mine.status === 'draft')
      throw new P3Error(
        failure('style-draft', {
          en: 'This Style is still a draft. Accept it first.',
          hi: 'यह Style अभी ड्राफ़्ट है। पहले इसे स्वीकार करें।',
        }),
      );
    style = await styleSource(d, path.styleId);
    if (!style)
      throw new P3Error(
        failure('style-unknown', {
          en: 'That Style was not found.',
          hi: 'वह Style नहीं मिली।',
        }),
      );
  }
  const styleId = path.kind === 'blank' ? null : path.styleId;
  const facts =
    path.kind === 'brief' ? briefFacts(style, path.answers, now, newId) : [];
  let project = projectId ? await d.store.memory(projectId) : null;
  if (!project)
    project = await d.store.createProject({
      projectId: projectId ?? newId('project'),
      styleId,
      facts,
      updatedAt: now,
    });
  else if (styleId !== null || facts.length)
    project = await d.store.saveMemory({
      ...project,
      styleId: styleId ?? project.styleId,
      facts: [...project.facts, ...facts],
      updatedAt: now,
    });
  const title =
    style === null
      ? 'New chat'
      : style.kind === 'config'
        ? say(style.style.name)
        : style.style.name;
  const chat = await d.store.createChat({
    id: newId('chat'),
    projectId: project.projectId,
    title,
    messages: [],
    summary: null,
    updatedAt: now,
  });
  return { chat, project };
}

/** "Make this my Style": always saved as a DRAFT. */
export async function makeStyle(
  d: LevelDeps & { readonly engine: MemoryEngine; readonly call: TextCall },
  ownerId: string,
  projectId: string,
  name: string,
  settings: MemorySettings,
): Promise<StyleRecord> {
  const memory = await d.store.memory(projectId);
  if (!memory)
    throw new P3Error(
      failure('project-unknown', { en: 'That project was not found.' }),
    );
  const chats = await d.store.chats(projectId);
  const made = await d.engine.distillStyle(
    { ownerId, memory, chats, name },
    settings,
    d.call,
  );
  return d.store.createStyle({
    ...made,
    id: (d.newId ?? defaultId)('style'),
    ownerId,
    name: name.trim() || made.name,
    status: 'draft',
    sourceProjectId: projectId,
    version: 0,
    rules: made.rules.slice(0, settings.maxStyleRules),
    updatedAt: (d.now ?? (() => new Date()))().toISOString(),
  });
}

/** Applies the person's edits; the Style becomes active, version + 1. */
export async function acceptStyle(
  d: LevelDeps,
  styleId: string,
  edits: Partial<StyleRecord>,
  settings: MemorySettings,
): Promise<StyleRecord> {
  const s = await d.store.style(styleId);
  if (!s)
    throw new P3Error(
      failure('style-unknown', { en: 'That Style was not found.' }),
    );
  const pick = <K extends keyof StyleRecord>(key: K): StyleRecord[K] =>
    edits[key] !== undefined ? (edits[key] as StyleRecord[K]) : s[key];
  return d.store.saveStyle({
    ...s,
    name: (pick('name') || s.name).slice(0, 80),
    rules: pick('rules').slice(0, settings.maxStyleRules),
    dos: pick('dos'),
    donts: pick('donts'),
    palette: pick('palette'),
    fonts: pick('fonts'),
    voice: pick('voice'),
    pacing: pick('pacing'),
    // Never from the edits:
    id: s.id,
    ownerId: s.ownerId,
    sourceProjectId: s.sourceProjectId,
    status: 'active',
    version: s.version + 1,
    updatedAt: (d.now ?? (() => new Date()))().toISOString(),
  });
}
