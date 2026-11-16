// ROUND-C4 (4.1): which Admin screen edits each field of the Platform Config
// parts the owner works on most (director, styles[], mcp, plans, site,
// studios), or why a field is config-only. tests/round-c4/coverage.test.ts
// fails when a field of those parts is in neither list, the same idea as the
// capability matrix guard. docs/ADMIN-COVERAGE.md is generated from it.

export type Coverage =
  { readonly screen: string } | { readonly configOnly: string };

const S = (screen: string): Coverage => ({ screen });
const C = (configOnly: string): Coverage => ({ configOnly });
const RAW =
  'Edited in Admin › Platform Config (the whole config as checked JSON): a model prompt, a list order or a token estimate, changed rarely and best seen whole.';

export const ADMIN_COVERAGE: Readonly<
  Record<
    'director' | 'style' | 'mcp' | 'plan' | 'site' | 'studio',
    Readonly<Record<string, Coverage>>
  >
> = {
  director: {
    persona: S('Director rules'),
    scope: C(RAW),
    refusals: S('Director limits › Refusals'),
    greeting: C(RAW),
    creativeUpgrade: C(RAW),
    prompts: C(RAW),
    limits: S('Director rules'),
    roles: S('AI Providers & Models (assignments)'),
    estimate: C(RAW),
    tools: S('Director rules'),
    methodOrder: C(RAW),
    budget: C(RAW),
    reveal: C(RAW),
    context: S('Director limits › Memory and context'),
    rewritesPerVideo: S('Director limits'),
    fieldLibrary: S('Brief fields'),
    styleChat: S('Director limits › Style chat moods'),
    lines: S("Director limits › Director's fixed lines"),
    web: S('Director limits › Web search and page reading'),
    rulebook: S('Rules & Playbooks'),
    playbooks: S('Rules & Playbooks'),
    creatorPlaybook: S('Rules & Playbooks'),
    authoring: S('Rules & Playbooks'),
    research: S('Rules & Playbooks'),
    layout: S('Director limits › Layout check'),
    assets: S('Director limits › Where media comes from'),
  },
  style: {
    id: S('Readymade Styles › Basics'),
    name: S('Readymade Styles › Basics'),
    blurb: S('Readymade Styles › Basics'),
    playbook: C(
      'An old free-text field kept for older configs; the planner reads playbookText (Readymade Styles › Script rules).',
    ),
    playbookText: S('Readymade Styles › Script rules'),
    enabled: S('Readymade Styles › list (On)'),
    status: S('Readymade Styles › Status and tests'),
    cardArt: S('Readymade Styles › Basics'),
    formats: S('Readymade Styles › Basics'),
    requires: S('Readymade Styles › Basics'),
    priceHint: S('Readymade Styles › Basics (cost)'),
    brief: S("Readymade Styles › The Style's Brief fields"),
    interview: S('Readymade Styles › Interview'),
    order: S('Readymade Styles › list (Up, Down)'),
    projectStyle: S('Readymade Styles › Project style defaults'),
    version: S('Readymade Styles › Versions (set by each save)'),
    sample: S('Readymade Styles › Sample'),
    planTemplate: S('Readymade Styles › Plan template'),
    slots: S('Readymade Styles › Asset slots'),
    inputs: S('Readymade Styles › What a person can start from'),
    looks: S('Readymade Styles › Looks'),
    kit: S('Readymade Styles › Graphics kit'),
    tests: S('Readymade Styles › Status and tests'),
    publishOverride: S('Readymade Styles › Status and tests (reason)'),
    plans: S('Readymade Styles › Availability by plan'),
  },
  mcp: {
    enabled: S('MCP (master switch, through the emergency switch)'),
    proofTools: S('MCP'),
    tools: S('MCP (tools: on and price)'),
    exportMaxSeconds: S('MCP'),
    ratePerMinute: S('MCP'),
    addMediaMaxMb: S('MCP'),
    importMaxMb: S('MCP'),
    whatsNew: S('MCP'),
    pricing: S('MCP › What costs credits through Claude'),
  },
  plan: {
    id: C(
      'A plan id is a key the ledger, entitlements and payments use; changing it would orphan people on it. Made once in the config.',
    ),
    name: S('Plans & Credits'),
    price: S('Plans & Credits'),
    period: C(RAW),
    monthlyCredits: S('Plans & Credits'),
    watermark: S('Plans & Credits'),
    limits: S('Plans & Credits; Features & access › Plans (labelled limits)'),
    features: S('Plans & Credits; Features & access › Plans (feature grid)'),
    sortOrder: C(RAW),
    public: S('Plans & Credits'),
    // ROUND-C5 (3.2).
    archived: S('Features & access › Plans (Archived)'),
  },
  site: {
    // ROUND-C5 (2.6): the site rows moved from config-only to their screen.
    sections: S('Website & Brand › Website sections'),
    showcase: S('Website & Brand › Showcase videos'),
    nav: S('Website & Brand › Header links'),
    footer: S('Website & Brand › Footer'),
    banner: S('Website & Brand › Banner'),
    maintenance: S('Website & Brand › Maintenance'),
    legal: S('Website & Brand › Legal pages'),
  },
  studio: {
    id: S('Studio tools & forms'),
    name: S('Studio tools & forms'),
    blurb: S('Studio tools & forms'),
    enabled: S('Studio tools & forms'),
    role: S('AI Providers & Models (assignments)'),
    toolId: C(RAW),
    family: S('Studio tools & forms'),
    familyName: S('Studio tools & forms'),
    output: C(RAW),
    inputs: S('Studio tools & forms (the form fields)'),
    groups: S('Studio tools & forms'),
    needsAssignment: C(RAW),
    historyLabel: C(RAW),
    actionPlace: C(RAW),
    emptyState: C(RAW),
    consent: C(RAW),
    consentIf: C(RAW),
    workload: C(RAW),
    costId: S('Plans & Credits (costs)'),
    requires: S('Studio tools & forms'),
    order: C(RAW),
  },
};

/** docs/ADMIN-COVERAGE.md. */
export function coverageMarkdown(): string {
  const lines = [
    '# Admin coverage',
    '',
    'Generated by `npm run docs:capability-sheet` from src/platform-config/admin-coverage.ts. Do not edit by hand. Every field of `director`, `styles[]`, `mcp`, `plans`, `site` and `studios` in Platform Config, with the Admin screen that edits it, or "config-only" with the reason. tests/round-c4/coverage.test.ts fails when a field of those parts is in neither list.',
    '',
  ];
  const part: Record<string, string> = {
    director: 'director',
    style: 'styles[]',
    mcp: 'mcp',
    plan: 'plans[]',
    site: 'site',
    studio: 'studios[]',
  };
  for (const [k, fields] of Object.entries(ADMIN_COVERAGE)) {
    lines.push(
      `## ${part[k]}`,
      '',
      '| Field | Admin screen |',
      '| --- | --- |',
    );
    for (const [f, c] of Object.entries(fields))
      lines.push(
        `| \`${f}\` | ${'screen' in c ? c.screen : `Config-only: ${c.configOnly}`} |`,
      );
    lines.push('');
  }
  return lines.join('\n');
}
