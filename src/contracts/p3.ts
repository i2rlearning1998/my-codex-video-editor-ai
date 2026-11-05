// P3 CONTRACTS: the interfaces between the three parallel parts.
//   Part 1 (Codex)        engine and server: payments, entitlements, admin API,
//                         Studio fields engine, memory logic.
//   Part 2 (Claude Code)  wiring: data model, Director, attach and vision, key
//                         vault, storage backends, login hardening, chat engine.
//   Part 3 (Claude, UI)   every screen: Orb, Director room, Studio forms, user
//                         panel, website, admin panel, editor chat dock.
// This file is FROZEN while the parts are built. It holds types and the one
// zod schema that crosses the config boundary; it holds no logic. Change it
// only through the integrator (docs/CONTRACTS-P3.md, section 8).
import { z } from 'zod';

/* ------------------------------------------------------------------ */
/* Shared                                                              */
/* ------------------------------------------------------------------ */

/** Owner-written text; English required, Hindi optional. */
export interface P3Text {
  readonly en: string;
  readonly hi?: string;
}
export type Money = {
  readonly currency: 'INR' | 'USD';
  /** Minor units (paise, cents). Never a float. */
  readonly amountMinor: number;
};
/** A refusal or failure the UI shows as ONE plain sentence. */
export interface P3Failure {
  readonly code: string;
  readonly message: P3Text;
  /** Where the UI should send the person (e.g. '/credits'). */
  readonly upgrade?: string;
}
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: P3Failure };

/* ------------------------------------------------------------------ */
/* Part 1: payments (src/ (none), server/payments/**)                  */
/* Hosted checkout only: card data never touches our code.             */
/* Credits are granted ONLY from a verified webhook.                   */
/* ------------------------------------------------------------------ */

export type PaymentProviderId = 'razorpay' | 'stripe' | 'paypal' | 'mock';

export interface CheckoutRequest {
  readonly userId: string;
  readonly kind: 'topup' | 'subscription';
  /** Config plan id (subscription) or top-up pack id (topup). */
  readonly itemId: string;
  readonly price: Money;
  /** Caller-chosen; the same key never creates two checkouts. */
  readonly idempotencyKey: string;
  readonly returnUrl: string;
}
export interface CheckoutSession {
  readonly provider: PaymentProviderId;
  readonly sessionId: string;
  /** The provider's hosted page. */
  readonly url: string;
  readonly expiresAt: string;
}
export type PaymentEventType =
  | 'payment.succeeded'
  | 'payment.failed'
  | 'refund.succeeded'
  | 'subscription.renewed'
  | 'subscription.cancelled';
/** A webhook after its signature was checked. Everything else is rejected. */
export interface PaymentEvent {
  readonly provider: PaymentProviderId;
  /** The provider's own event id: the replay and duplicate key. */
  readonly eventId: string;
  readonly type: PaymentEventType;
  readonly paymentId: string;
  readonly userId: string;
  readonly kind: 'topup' | 'subscription';
  readonly itemId: string;
  readonly amount: Money;
  readonly occurredAt: string;
}
export class WebhookError extends Error {
  constructor(
    readonly reason:
      | 'bad-signature'
      | 'stale'
      | 'malformed'
      | 'unknown-user'
      | 'amount-mismatch',
    message: string,
  ) {
    super(message);
    this.name = 'WebhookError';
  }
}
export interface PaymentGateway {
  readonly id: PaymentProviderId;
  /** False when its keys are not in the server environment. */
  connected(): boolean;
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  /** Throws WebhookError. Checks signature, age (replay window) and shape. */
  verifyWebhook(
    rawBody: string,
    headers: Readonly<Record<string, string>>,
    now?: Date,
  ): PaymentEvent;
  refund(
    paymentId: string,
    amountMinor: number | null,
    reason: string,
  ): Promise<{ readonly refundId: string }>;
  cancelSubscription(subscriptionId: string): Promise<void>;
}
/**
 * What the webhook route does with a verified event. Ledger keys:
 *   grant:  `pay:<provider>:<eventId>`   (so a replay or duplicate adds nothing)
 *   refund: `refund:<provider>:<eventId>`
 * The credits granted come from the CONFIG item (pack or plan), never from the
 * amount the webhook claims; a mismatch is a WebhookError('amount-mismatch').
 */
export interface PaymentWebhookResult {
  readonly applied: boolean;
  readonly duplicate: boolean;
  readonly creditsDelta: number;
}

/* ------------------------------------------------------------------ */
/* Part 1: entitlements (server/entitlements/**)                       */
/* ------------------------------------------------------------------ */

export type LimitAction =
  | 'export'
  | 'store'
  | 'voice-clone'
  | 'project'
  | 'ai-call'
  | 'chat-message'
  | 'attach'
  | 'vision';
export interface Entitlements {
  readonly userId: string;
  readonly planId: string;
  /** Plan features from config (e.g. 'model-best', 'export-4k'). */
  readonly features: readonly string[];
  readonly limits: Readonly<Record<string, number>>;
  /** Admin flags that apply to this person (beta, comped, suspended...). */
  readonly flags: readonly string[];
  readonly issuedAt: string;
  /** Short-lived (default 10 minutes); the editor refetches. */
  readonly expiresAt: string;
}
export interface SignedEntitlements {
  readonly entitlements: Entitlements;
  /** HMAC-SHA256 over the canonical JSON with ENTITLEMENT_SECRET. */
  readonly signature: string;
}
export interface EntitlementService {
  resolve(userId: string): Promise<SignedEntitlements>;
  verify(signed: SignedEntitlements, now?: Date): Entitlements | null;
  /** The ONLY place a limit is decided. The editor's check is a convenience. */
  check(
    userId: string,
    action: LimitAction,
    amount?: number,
  ): Promise<
    { readonly ok: true } | { readonly ok: false; readonly failure: P3Failure }
  >;
}

/* ------------------------------------------------------------------ */
/* Part 1: admin API (server/admin/**), routes under /v1/admin/*       */
/* Every route needs Caller.admin. Every change writes an audit row.   */
/* ------------------------------------------------------------------ */

export interface AdminUserRow {
  readonly userId: string;
  readonly email: string;
  readonly planId: string;
  readonly credits: number;
  readonly flags: readonly string[];
  readonly suspended: boolean;
  readonly createdAt: string;
  readonly lastSeenAt: string | null;
}
export interface AuditRow {
  readonly seq: number;
  readonly at: string;
  readonly actor: string;
  readonly action: string;
  readonly target: string;
  readonly detail: Readonly<Record<string, string | number | boolean>>;
  /** SHA-256 chain: hash(prevHash + this row). A gap or edit is detectable. */
  readonly hash: string;
}
export interface EmergencySwitches {
  /** Stops every model call (credits are untouched). */
  readonly aiOff: boolean;
  /** Stops new sign-ups. */
  readonly signupsOff: boolean;
  /** Stops payments and top-ups. */
  readonly paymentsOff: boolean;
  /** Shown to the person while a switch is on. */
  readonly message: P3Text;
}
/** The typed client the admin screens use (the HTTP one is Part 1). */
export interface AdminClient {
  users(query: {
    search?: string;
    planId?: string;
    flag?: string;
    cursor?: string;
  }): Promise<{ rows: AdminUserRow[]; next: string | null }>;
  user(userId: string): Promise<
    AdminUserRow & {
      ledger: readonly {
        key: string;
        delta: number;
        reason: string;
        at: string;
      }[];
      payments: readonly {
        paymentId: string;
        provider: PaymentProviderId;
        amount: Money;
        status: 'paid' | 'refunded' | 'failed';
        at: string;
      }[];
    }
  >;
  adjustCredits(userId: string, delta: number, reason: string): Promise<void>;
  setPlan(userId: string, planId: string, reason: string): Promise<void>;
  setSuspended(
    userId: string,
    suspended: boolean,
    reason: string,
  ): Promise<void>;
  setFlag(userId: string, flag: string, on: boolean): Promise<void>;
  refund(
    paymentId: string,
    amountMinor: number | null,
    reason: string,
    /** Also take back the credits that payment gave. */
    revokeCredits: boolean,
  ): Promise<void>;
  flags(): Promise<
    readonly { flag: string; description: string; users: number }[]
  >;
  audit(query: { cursor?: string; actor?: string; action?: string }): Promise<{
    rows: AuditRow[];
    next: string | null;
    /** False when the chain does not verify. */
    chainOk: boolean;
  }>;
  emergency(): Promise<EmergencySwitches>;
  setEmergency(next: EmergencySwitches, reason: string): Promise<void>;
  /** Revenue, credits sold, provider cost, margin: for the dashboard. */
  metrics(range: { from: string; to: string }): Promise<AdminMetrics>;
}
export interface AdminMetrics {
  readonly revenue: readonly Money[];
  readonly creditsSold: number;
  readonly creditsSpent: number;
  /** Provider cost in USD for the same period. */
  readonly providerCostUsd: number;
  readonly newUsers: number;
  readonly activeUsers: number;
  readonly byModel: readonly {
    modelId: string;
    calls: number;
    costUsd: number;
    credits: number;
  }[];
  readonly series: readonly { day: string; credits: number; costUsd: number }[];
}

/* ------------------------------------------------------------------ */
/* Part 1: Studio fields engine (src/studio-engine/**)                 */
/* A form is built from the CHOSEN MODEL's declared parameters, so the */
/* person sees only what that model supports and the AI gets real      */
/* details. Prompt assembly is code; an LLM is used only for Enhance.  */
/* ------------------------------------------------------------------ */

export const PARAM_TYPES = [
  'text',
  'longtext',
  'choice',
  'multi',
  'toggle',
  'number',
  'slider',
  'color',
  'file',
  'seed',
  'voice',
  'style-card',
  'aspect',
] as const;
export type ParamType = (typeof PARAM_TYPES)[number];

/** How a field's value reaches the provider. */
export const PARAM_ROLES = [
  /** Joined into the positive prompt as `<label>: <value>`. */
  'prompt-part',
  /** The main prompt text itself. */
  'prompt',
  /** Sent as the model's negative prompt. */
  'negative',
  /** Sent as a provider parameter named by `sends`. */
  'param',
  /** Counts toward the price (images, seconds, minutes, characters). */
  'units',
  /** A reference file (image, audio, video). */
  'reference',
  /** Used only by the UI (never sent). */
  'ui',
] as const;

const paramId = z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/);
const ptext = z
  .object({ en: z.string(), hi: z.string().optional() })
  .passthrough();
/** Declared per MODEL in config (`model.params`). Claude Code adds it to modelSchema. */
export const paramDeclSchema = z.object({
  id: paramId,
  type: z.enum(PARAM_TYPES),
  label: ptext,
  help: ptext.optional(),
  /** Basic fields are always shown; advanced sit behind "More options". */
  group: z.enum(['basic', 'advanced']).default('basic'),
  role: z.enum(PARAM_ROLES).default('param'),
  /** Provider parameter name when role is 'param' or 'units'. */
  sends: z.string().max(60).optional(),
  required: z.boolean().default(false),
  options: z
    .array(
      z.object({ value: z.string(), label: ptext, art: z.string().optional() }),
    )
    .default([]),
  min: z.number().optional(),
  max: z.number().optional(),
  step: z.number().positive().optional(),
  default: z
    .union([z.string(), z.number(), z.boolean(), z.array(z.string())])
    .optional(),
  /** Hide until another param has one of these values. */
  showIf: z
    .object({ field: paramId, in: z.array(z.string()).min(1) })
    .optional(),
  /** What the person may attach (role 'reference'). */
  accept: z.array(z.enum(['image', 'audio', 'video'])).default([]),
  order: z.number().default(0),
});
export type ParamDecl = z.infer<typeof paramDeclSchema>;

export interface FormSpec {
  readonly modelId: string;
  readonly studioId: string;
  readonly basic: readonly ParamDecl[];
  readonly advanced: readonly ParamDecl[];
  /** Whether "Enhance with Director" is offered (needs a text model + plan). */
  readonly canEnhance: boolean;
}
export type FormValues = Readonly<
  Record<string, string | number | boolean | readonly string[]>
>;
export interface AssembledRequest {
  /** Final positive prompt. */
  readonly prompt: string;
  readonly negativePrompt?: string;
  /** Provider parameters, keyed by `sends`. */
  readonly params: Readonly<Record<string, string | number | boolean>>;
  /** Reference files by param id (the caller uploads them). */
  readonly references: Readonly<Record<string, readonly string[]>>;
  /** For the price: images, seconds, minutes or characters. */
  readonly units: number;
  /** A readable echo for the "what will be sent" preview. */
  readonly preview: string;
}
export interface StudioEngine {
  /** Fields visible for a model, after showIf with the given values. */
  buildForm(
    modelParams: readonly ParamDecl[],
    ids: { modelId: string; studioId: string },
    canEnhance: boolean,
  ): FormSpec;
  /** Fields currently visible (showIf resolved), in order. */
  visible(form: FormSpec, values: FormValues): readonly ParamDecl[];
  defaults(form: FormSpec): FormValues;
  validate(
    form: FormSpec,
    values: FormValues,
  ):
    | { readonly ok: true }
    | { readonly ok: false; readonly errors: Readonly<Record<string, P3Text>> };
  assemble(form: FormSpec, values: FormValues): AssembledRequest;
}

/* ------------------------------------------------------------------ */
/* Part 1 logic / Part 2 storage: Style > Project > Chat memory        */
/* ------------------------------------------------------------------ */

/** Level 1. Read-only into every call of a project that uses it. */
export interface StyleRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  /** 'draft' until the person accepts "Make this my Style". */
  readonly status: 'draft' | 'active';
  readonly rules: readonly string[];
  readonly dos: readonly string[];
  readonly donts: readonly string[];
  readonly palette: readonly string[];
  readonly fonts: { readonly heading: string; readonly body: string };
  readonly voice: { readonly language: string; readonly tone: string };
  readonly pacing: string;
  readonly sourceProjectId: string | null;
  readonly version: number;
  readonly updatedAt: string;
}
export interface MemoryFact {
  readonly id: string;
  readonly text: string;
  readonly source: 'user' | 'chat' | 'director';
  readonly pinned: boolean;
  readonly createdAt: string;
}
/** Level 2. Shared by every chat in the project. */
export interface ProjectMemory {
  readonly projectId: string;
  readonly styleId: string | null;
  readonly facts: readonly MemoryFact[];
  readonly updatedAt: string;
}
export interface ChatMessage {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly attachmentIds: readonly string[];
  readonly at: string;
}
export interface ChatSummary {
  readonly text: string;
  /** Messages up to and including this id are covered by the summary. */
  readonly coversUpTo: string;
  readonly tokens: number;
}
/** Level 3. One thread; older turns are replaced by the summary. */
export interface ChatRecord {
  readonly id: string;
  readonly projectId: string;
  readonly title: string;
  readonly messages: readonly ChatMessage[];
  readonly summary: ChatSummary | null;
  readonly updatedAt: string;
}
/** A text model call the memory logic may make (injected, never imported). */
export type TextCall = (req: {
  readonly system: string;
  readonly user: string;
  readonly maxOutputTokens: number;
}) => Promise<string>;
export interface MemorySettings {
  /** Messages kept verbatim after a summary. */
  readonly keepRecent: number;
  /** Summarise when the verbatim history passes this many tokens. */
  readonly summariseAboveTokens: number;
  readonly maxFacts: number;
  readonly maxStyleRules: number;
}
export interface MemoryEngine {
  /** Replaces old turns with a summary; keeps `keepRecent` verbatim. */
  summarise(
    chat: ChatRecord,
    settings: MemorySettings,
    call: TextCall,
  ): Promise<ChatRecord>;
  /** The text block the Director prompt gets: style + facts + summary + recent. */
  context(input: {
    readonly style: StyleRecord | null;
    readonly memory: ProjectMemory;
    readonly chat: ChatRecord;
    readonly settings: MemorySettings;
  }): { readonly text: string; readonly tokens: number };
  /** New facts from a finished exchange (deduplicated against existing ones). */
  extractFacts(
    memory: ProjectMemory,
    exchange: readonly ChatMessage[],
    settings: MemorySettings,
    call: TextCall,
  ): Promise<ProjectMemory>;
  /** "Make this my Style": a DRAFT built from project memory and chats. */
  distillStyle(
    input: {
      readonly ownerId: string;
      readonly memory: ProjectMemory;
      readonly chats: readonly ChatRecord[];
      readonly name: string;
    },
    settings: MemorySettings,
    call: TextCall,
  ): Promise<StyleRecord>;
}

/* ------------------------------------------------------------------ */
/* Part 2: what the UI talks to (src/wiring/**)                        */
/* The UI codes against this; src/contracts/p3-mocks.ts implements it  */
/* with in-memory fakes so the UI is built and tested without Part 2.  */
/* ------------------------------------------------------------------ */

/** Drives the Orb. */
export type OrbState =
  'idle' | 'listening' | 'thinking' | 'speaking' | 'refusing' | 'building';

export interface Attachment {
  readonly id: string;
  readonly name: string;
  readonly kind: 'image' | 'audio' | 'video' | 'text' | 'pdf';
  readonly bytes: number;
  /** Credits this attachment adds to the message (vision cost, from config). */
  readonly credits: number;
}
export interface DirectorQuestion {
  readonly id: string;
  readonly text: P3Text;
  readonly answers: readonly { value: string; label: P3Text }[];
  readonly allowFreeText: boolean;
}
export type DirectorEvent =
  | { readonly type: 'state'; readonly state: OrbState }
  | { readonly type: 'token'; readonly text: string }
  | { readonly type: 'question'; readonly question: DirectorQuestion }
  | { readonly type: 'plan'; readonly planId: string }
  | {
      readonly type: 'refusal';
      readonly reply: P3Text;
      readonly alternative?: P3Text;
    }
  | { readonly type: 'memory'; readonly added: readonly MemoryFact[] }
  | { readonly type: 'failure'; readonly failure: P3Failure }
  | { readonly type: 'done'; readonly creditsUsed: number };

/** How a conversation starts: all three end in the same chat. */
export type StartPath =
  | { readonly kind: 'style'; readonly styleId: string }
  | {
      readonly kind: 'brief';
      readonly styleId: string;
      readonly answers: Readonly<Record<string, string>>;
    }
  | { readonly kind: 'blank' };

export interface DirectorService {
  start(
    path: StartPath,
    projectId?: string,
  ): Promise<{ chat: ChatRecord; project: ProjectMemory }>;
  /** Streams events until 'done' or 'failure'. */
  send(input: {
    readonly chatId: string;
    readonly text: string;
    readonly attachmentIds: readonly string[];
    readonly modelId?: string;
    readonly signal?: AbortSignal;
  }): AsyncIterable<DirectorEvent>;
  attach(file: File, chatId: string): Promise<Result<Attachment>>;
  /** Credits a message with these attachments would cost (shown before send). */
  estimate(
    chatId: string,
    text: string,
    attachmentIds: readonly string[],
  ): Promise<{ min: number; max: number }>;
  makeStyle(projectId: string, name: string): Promise<StyleRecord>;
  acceptStyle(
    styleId: string,
    edits: Partial<StyleRecord>,
  ): Promise<StyleRecord>;
  listStyles(): Promise<readonly StyleRecord[]>;
  listChats(projectId: string): Promise<readonly ChatRecord[]>;
  memory(projectId: string): Promise<ProjectMemory>;
  setMemory(
    projectId: string,
    facts: readonly MemoryFact[],
  ): Promise<ProjectMemory>;
}

/** The Studio screens. */
export interface StudioService {
  form(studioId: string, modelId: string): Promise<FormSpec>;
  models(studioId: string): Promise<
    readonly {
      id: string;
      name: P3Text;
      tier: string;
      connected: boolean;
      locked: boolean;
    }[]
  >;
  preview(form: FormSpec, values: FormValues): AssembledRequest;
  /** Credits before running. */
  estimate(
    studioId: string,
    modelId: string,
    values: FormValues,
  ): Promise<{ min: number; max: number }>;
  enhance(
    studioId: string,
    modelId: string,
    values: FormValues,
  ): Promise<Result<FormValues>>;
  run(
    studioId: string,
    modelId: string,
    values: FormValues,
    projectId: string | null,
  ): AsyncIterable<
    | { readonly type: 'progress'; readonly pct: number }
    | { readonly type: 'result'; readonly assetId: string }
    | { readonly type: 'failure'; readonly failure: P3Failure }
  >;
}

/* --- key vault (server only; values are never returned) --- */
export interface KeyInfo {
  /** The env-style NAME, e.g. 'ANTHROPIC_API_KEY'. */
  readonly name: string;
  readonly provider: string;
  readonly set: boolean;
  /** Last four characters only. */
  readonly hint: string | null;
  readonly lastTest: {
    readonly ok: boolean;
    readonly at: string;
    readonly message: string;
  } | null;
}
export interface KeyVault {
  list(): Promise<readonly KeyInfo[]>;
  set(name: string, value: string, reason: string): Promise<void>;
  remove(name: string, reason: string): Promise<void>;
  test(name: string): Promise<KeyInfo['lastTest']>;
}

/* --- storage backends (where a person's media and projects live) --- */
export type StorageBackendId = 'platform' | 'drive' | 'local';
export interface StorageBackend {
  readonly id: StorageBackendId;
  connected(): Promise<boolean>;
  put(path: string, bytes: Uint8Array, mime: string): Promise<void>;
  get(path: string): Promise<Uint8Array | null>;
  list(prefix: string): Promise<readonly { path: string; bytes: number }[]>;
  remove(path: string): Promise<void>;
  usage(): Promise<{
    readonly bytes: number;
    readonly limitBytes: number | null;
  }>;
}

/* --- login hardening (server/auth.ts, src/cloud) --- */
export interface LoginGuard {
  /** Throws P3Failure-shaped error text when the attempt must be refused. */
  beforeAttempt(email: string, ip: string): Promise<Result<true>>;
  afterFailure(email: string, ip: string): Promise<void>;
  afterSuccess(email: string, ip: string): Promise<void>;
}

/* --- editor chat dock: select and edit (engine only; the dock is UI) --- */
export interface SelectionRef {
  readonly kind: 'layer' | 'clip' | 'scene' | 'range';
  readonly id: string;
  readonly sceneId?: string;
  readonly from?: number;
  readonly to?: number;
}
export type EditEvent =
  | { readonly type: 'state'; readonly state: OrbState }
  | { readonly type: 'token'; readonly text: string }
  /** A proposal made of ordinary semantic commands; nothing applied yet. */
  | {
      readonly type: 'proposal';
      readonly id: string;
      readonly summary: P3Text;
      readonly credits: number;
      readonly commandCount: number;
    }
  | { readonly type: 'applied'; readonly id: string }
  | { readonly type: 'failure'; readonly failure: P3Failure }
  | { readonly type: 'done' };
export interface EditorChatEngine {
  send(input: {
    readonly text: string;
    readonly selection: readonly SelectionRef[];
    readonly attachmentIds: readonly string[];
    readonly signal?: AbortSignal;
  }): AsyncIterable<EditEvent>;
  /** Applies a proposal through the Command Bus as ONE undo step. */
  apply(proposalId: string): Promise<Result<true>>;
  discard(proposalId: string): void;
}

/* ------------------------------------------------------------------ */
/* Admin-controlled settings the parts read (config additions are made */
/* by Part 2; Part 1 receives them as plain arguments)                 */
/* ------------------------------------------------------------------ */

export interface P3AdminSettings {
  readonly chat: {
    readonly enabled: boolean;
    readonly maxMessagesPerDay: number;
    readonly maxHistoryTokens: number;
  };
  readonly vision: {
    readonly enabled: boolean;
    /** Credits per attached image. Owner decides; never hard-coded. */
    readonly creditsPerImage: number;
    readonly maxImagesPerMessage: number;
  };
  readonly memory: MemorySettings;
  readonly entitlementTtlSeconds: number;
  readonly webhookReplayWindowSeconds: number;
}
