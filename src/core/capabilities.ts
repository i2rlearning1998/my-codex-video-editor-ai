import { z } from 'zod';
import { assertJson, jsonSchema, type JsonValue, type Project } from './model';

export interface RuntimeSchema {
  parse(value: unknown): unknown;
}
export interface CapabilityCommand {
  inputSchema: RuntimeSchema;
  outputSchema: RuntimeSchema;
  /** Synchronous, deterministic draft mutation; no external side effects or retained references. */
  apply(draft: Project, input: unknown): JsonValue;
}
export interface Capability {
  id: string;
  version: string;
  inputSchema: RuntimeSchema;
  outputSchema: RuntimeSchema;
  commands: Readonly<Record<string, CapabilityCommand>>;
  uiExtension?: Readonly<{ slot: string }>;
  rendererExtension?: Readonly<{ kind: string }>;
  aiInstruction?: Readonly<{ description: string }>;
}
const schemaValidator = z.custom<RuntimeSchema>(
  (value) =>
    Boolean(value && typeof (value as RuntimeSchema).parse === 'function'),
  'Expected a runtime schema',
);
const declarationSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    inputSchema: schemaValidator,
    outputSchema: schemaValidator,
    commands: z.record(
      z.string().regex(/^[A-Z][A-Z0-9_]*$/),
      z
        .object({
          inputSchema: schemaValidator,
          outputSchema: schemaValidator,
          apply: z.custom<CapabilityCommand['apply']>(
            (value) => typeof value === 'function',
          ),
        })
        .strict(),
    ),
    uiExtension: z
      .object({ slot: z.string().min(1) })
      .strict()
      .optional(),
    rendererExtension: z
      .object({ kind: z.string().min(1) })
      .strict()
      .optional(),
    aiInstruction: z
      .object({ description: z.string().min(1) })
      .strict()
      .optional(),
  })
  .strict();

export interface CapabilityInvocation {
  type: `plugin:${string}:${string}`;
  input: JsonValue;
}

export class CapabilityRegistry {
  #capabilities = new Map<string, Capability>();

  register(capability: Capability): void {
    const parsed = declarationSchema.parse(capability);
    if (this.#capabilities.has(parsed.id))
      throw new Error(`Capability already registered: ${parsed.id}`);
    const commands = Object.fromEntries(
      Object.entries(parsed.commands).map(([key, definition]) => [
        key,
        Object.freeze({ ...definition }),
      ]),
    );
    this.#capabilities.set(
      parsed.id,
      Object.freeze({
        ...parsed,
        commands: Object.freeze(commands),
      }) as Capability,
    );
  }

  list(): ReadonlyArray<
    Readonly<{ id: string; version: string; commands: readonly string[] }>
  > {
    return Object.freeze(
      [...this.#capabilities.values()].map((item) =>
        Object.freeze({
          id: item.id,
          version: item.version,
          commands: Object.freeze(Object.keys(item.commands)),
        }),
      ),
    );
  }

  execute(draft: Project, invocation: CapabilityInvocation): JsonValue {
    assertJson(invocation);
    const parsed = z
      .object({
        type: z.string().regex(/^plugin:[a-z][a-z0-9-]*:[A-Z][A-Z0-9_]*$/),
        input: jsonSchema,
      })
      .strict()
      .parse(invocation);
    const [, id, name] = parsed.type.split(':');
    const capability = this.#capabilities.get(id!);
    const command = capability?.commands[name!];
    if (!command) throw new Error(`Unknown capability command: ${parsed.type}`);
    const input = command.inputSchema.parse(structuredClone(parsed.input));
    const result = command.outputSchema.parse(command.apply(draft, input));
    assertJson(result);
    return structuredClone(result) as JsonValue;
  }
}
