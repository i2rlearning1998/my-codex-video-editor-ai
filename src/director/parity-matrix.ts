// ROUND-C5 Part 4: everything the Director can do for a person in AI mode,
// and how Claude does the same through the connector. Each list below is the
// one the Director's code uses (exported `as const`), and each Record must
// name every member, so a new Director action without a row fails the type
// check, and tests/round-c5/parity.test.ts fails when a named tool does not
// exist. docs/PARITY.md is written from this file.
import { ASK_KINDS, type AskKind } from './intents';
import { STYLE_CHAT_REPLIES } from './style-chat';

/** The asset step's ways to fill a file (the Director's Slot.choice). */
export const ASSET_CHOICES = [
  'make',
  'upload',
  'prompt',
  'library',
  'later',
] as const;
export type AssetChoice = (typeof ASSET_CHOICES)[number];
/** The Director's plan card actions. */
export const PLAN_ACTIONS = [
  'approve',
  'cheaper',
  'richer',
  'edit',
  'cancel',
  'remove-idea',
  'make-graphic',
] as const;
export type PlanAction = (typeof PLAN_ACTIONS)[number];
/** The Director's two rewrite directions (the plan card's swap rule). */
export const REWRITE_KINDS = ['cheaper', 'richer'] as const;
export type RewriteKind = (typeof REWRITE_KINDS)[number];
/** The Director's stages and the rest of its work. */
export const DIRECTOR_STEPS = [
  'brief-card',
  'brand-kit',
  'attach-file',
  'plan',
  'build',
  'cancel-build',
  'proposal-apply',
  'hand-edit-check',
  'project-style-first',
  'project-style-from-video',
  'style-look',
  'memory',
  'refusal',
] as const;
export type DirectorStep = (typeof DIRECTOR_STEPS)[number];

export type ParityRow =
  | { readonly connector: readonly string[]; readonly how: string }
  | { readonly exempt: string };

export const ASK_PARITY: Record<AskKind, ParityRow> = {
  question: {
    connector: ['read_video', 'read_memory', 'get_credits'],
    how: 'Claude answers from read_video and read_memory; credits from get_credits.',
  },
  selection: {
    connector: ['edit_video'],
    how: 'edit_video with dry_run first (the proposal), then without (one step).',
  },
  scene: {
    connector: ['edit_video'],
    how: 'edit_video on one scene (retime, change_text, replace_media, change_look).',
  },
  'new-scene': {
    connector: ['edit_video'],
    how: 'edit_video add_scene: cost shown, charged after confirm_scene.',
  },
  'new-video': {
    connector: ['create_video'],
    how: 'create_video in the same Project.',
  },
};
export const ASSET_PARITY: Record<AssetChoice, ParityRow> = {
  make: {
    connector: ['get_asset_cost', 'make_asset'],
    how: 'The cost first, then the Studio run.',
  },
  upload: {
    connector: ['add_media'],
    how: 'The person gives the file to Claude; add_media stores it.',
  },
  prompt: {
    connector: ['set_asset_choice'],
    how: 'set_asset_choice prompt: Claude writes the prompt.',
  },
  library: {
    connector: ['set_asset_choice', 'list_library'],
    how: 'set_asset_choice library with a file from list_library.',
  },
  later: {
    connector: ['set_asset_choice'],
    how: 'set_asset_choice later: the frame stays empty.',
  },
};
export const PLAN_PARITY: Record<PlanAction, ParityRow> = {
  approve: {
    connector: ['get_plan_cost', 'approve_plan'],
    how: 'The same two steps.',
  },
  cheaper: {
    connector: ['rewrite_plan'],
    how: 'rewrite_plan cheaper (one rewrite, the same swap rule).',
  },
  richer: {
    connector: ['rewrite_plan'],
    how: 'rewrite_plan richer (one rewrite, the same swap rule).',
  },
  edit: {
    connector: ['submit_plan'],
    how: 'A changed plan sent again (one rewrite).',
  },
  cancel: {
    exempt:
      'Claude simply does not approve; nothing is charged before approve_plan.',
  },
  'remove-idea': {
    connector: ['remove_extra_idea'],
    how: 'remove_extra_idea by its number.',
  },
  'make-graphic': {
    connector: ['edit_video'],
    how: 'edit_video add_graphic (its cost first).',
  },
};
export const REWRITE_PARITY: Record<RewriteKind, ParityRow> = {
  cheaper: PLAN_PARITY.cheaper,
  richer: PLAN_PARITY.richer,
};
export const STYLE_CHAT_PARITY: Record<
  (typeof STYLE_CHAT_REPLIES)[number],
  ParityRow
> = {
  refusal: {
    connector: ['style_chat'],
    how: "style_chat answers with the owner's refusal.",
  },
  question: {
    connector: ['style_chat'],
    how: 'style_chat asks one question back.',
  },
  same: { connector: ['style_chat'], how: 'style_chat says it is already so.' },
  only: {
    connector: ['style_chat'],
    how: 'style_chat points to edit_video for one video.',
  },
  proposal: {
    connector: ['style_chat', 'apply_style_change'],
    how: 'Shown first; applied to later videos with apply_style_change.',
  },
};
export const STEP_PARITY: Record<DirectorStep, ParityRow> = {
  'brief-card': {
    connector: ['get_brief_fields', 'save_brief'],
    how: 'Every field at once, then save_brief.',
  },
  'brand-kit': {
    connector: ['get_brief_fields'],
    how: 'get_brief_fields says when the person has a Brand Kit and asks brand_kit yes or no.',
  },
  'attach-file': {
    connector: ['add_file_note', 'add_media'],
    how: 'A note from a document; a picture or clip as media.',
  },
  plan: {
    connector: ['submit_plan', 'validate_plan'],
    how: 'The same checks (validate, repair once, refuse).',
  },
  build: { connector: ['approve_plan'], how: 'Built on approval, one step.' },
  'cancel-build': {
    exempt:
      'A connector build is one server step; there is nothing running to cancel.',
  },
  'proposal-apply': {
    connector: ['edit_video'],
    how: 'dry_run shows it; the real call applies it as one step.',
  },
  'hand-edit-check': {
    connector: ['read_video', 'edit_video'],
    how: 'edit_video refuses when the video changed since read_video (stricter than the Director, which asks per layer).',
  },
  'project-style-first': {
    connector: ['approve_plan'],
    how: "The first approved video saves the Project's style.",
  },
  'project-style-from-video': {
    connector: ['use_video_style'],
    how: "use_video_style, as the panel's Update project style from this video.",
  },
  'style-look': {
    connector: ['get_style', 'get_brief_fields'],
    how: "The Style's looks are listed and its Brief starts from them.",
  },
  memory: {
    connector: ['read_memory', 'update_video_sheet'],
    how: 'The same Video sheet.',
  },
  refusal: {
    connector: ['start_here'],
    how: "Claude's guidance lists every owner refusal and its sentence.",
  },
};

/** Every row, for the doc and the test. */
export function parityRows(): { group: string; key: string; row: ParityRow }[] {
  const g = (group: string, r: Record<string, ParityRow>) =>
    Object.entries(r).map(([key, row]) => ({ group, key, row }));
  return [
    ...g('Message kind', ASK_PARITY),
    ...g('Asset choice', ASSET_PARITY),
    ...g('Plan card', PLAN_PARITY),
    ...g('Style chat', STYLE_CHAT_PARITY),
    ...g('Director step', STEP_PARITY),
  ];
}
export const PARITY_LISTS = {
  ASK_KINDS,
  ASSET_CHOICES,
  PLAN_ACTIONS,
  REWRITE_KINDS,
  STYLE_CHAT_REPLIES,
  DIRECTOR_STEPS,
} as const;

/** docs/PARITY.md (npm run docs:capability-sheet). */
export function parityMarkdown(): string {
  const rows = parityRows().map(({ group, key, row }) =>
    'exempt' in row
      ? `| ${group} | ${key} | (not needed) | ${row.exempt} |`
      : `| ${group} | ${key} | ${row.connector.map((c) => `\`${c}\``).join(', ')} | ${row.how} |`,
  );
  return [
    '# Director and Claude: the same work',
    '',
    'Generated by `npm run docs:capability-sheet` from src/director/parity-matrix.ts. Do not edit by hand. Every action the Director can do for a person in AI mode, and the connector tools Claude uses for the same. tests/round-c5/parity.test.ts fails when a Director list gains a member with no row, or a row names a tool the connector does not have.',
    '',
    '| Where | Director action | Claude tools | How |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}
