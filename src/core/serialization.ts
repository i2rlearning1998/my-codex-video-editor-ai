import {
  SCHEMA_VERSION,
  assertJson,
  validateProject,
  type DeepReadonly,
  type Project,
} from './model';

export const MAX_SERIALIZED_PROJECT_LENGTH = 20_000_000;

export interface Migration {
  from: number;
  to: number;
  migrate(document: unknown): unknown;
}
export class FutureSchemaError extends Error {
  constructor(readonly version: number) {
    super(
      `Project schema ${version} is newer than supported schema ${SCHEMA_VERSION}; preserve the file and use a newer editor.`,
    );
  }
}
function versionOf(document: unknown): number {
  if (
    !document ||
    typeof document !== 'object' ||
    !('schemaVersion' in document) ||
    !Number.isInteger(document.schemaVersion) ||
    (document.schemaVersion as number) < 0
  )
    throw new Error('Missing or invalid schemaVersion');
  return document.schemaVersion as number;
}
export class MigrationRegistry {
  #migrations = new Map<number, Migration>();
  constructor() {
    this.register({
      from: 3,
      to: 4,
      migrate: (input) => {
        const document = structuredClone(input) as Record<string, unknown>;
        if (!Array.isArray(document.compositions))
          throw new Error('Invalid legacy compositions');
        document.compositions = document.compositions.map(
          (composition: Record<string, unknown>) => ({
            ...composition,
            tracks: [],
          }),
        );
        return { ...document, schemaVersion: 4 };
      },
    });
    this.register({
      from: 2,
      to: 3,
      migrate: (input) => ({ ...(input as object), schemaVersion: 3 }),
    });
    this.register({
      from: 1,
      to: 2,
      migrate: (input) => {
        // Preserve every legacy field; final strict validation rejects unsupported data.
        const document = structuredClone(input) as Record<string, unknown>;
        const visit = (layers: unknown, duration: number): unknown => {
          if (!Array.isArray(layers)) throw new Error('Invalid legacy layers');
          return layers.map((value: Record<string, unknown>) => ({
            startTime: 0,
            duration,
            ...value,
            children: visit(value.children, duration),
          }));
        };
        if (!Array.isArray(document.compositions))
          throw new Error('Invalid legacy compositions');
        document.compositions = document.compositions.map(
          (composition: Record<string, unknown>) => ({
            ...composition,
            layers: visit(composition.layers, composition.duration as number),
          }),
        );
        return { ...document, schemaVersion: 2 };
      },
    });
  }
  register(migration: Migration): void {
    if (
      !Number.isInteger(migration.from) ||
      migration.from < 0 ||
      migration.to !== migration.from + 1 ||
      migration.to > SCHEMA_VERSION ||
      typeof migration.migrate !== 'function'
    )
      throw new Error('Migrations must advance one supported schema version');
    if (this.#migrations.has(migration.from))
      throw new Error('Migration already registered');
    this.#migrations.set(migration.from, Object.freeze({ ...migration }));
  }
  run(input: unknown): Project {
    assertJson(input);
    let document: unknown = structuredClone(input);
    let version = versionOf(document);
    if (version > SCHEMA_VERSION) throw new FutureSchemaError(version);
    while (version < SCHEMA_VERSION) {
      const migration = this.#migrations.get(version);
      if (!migration)
        throw new Error(`Missing migration from schema ${version}`);
      document = migration.migrate(document);
      assertJson(document);
      if (versionOf(document) !== migration.to)
        throw new Error('Migration returned the wrong schema version');
      version = migration.to;
    }
    return validateProject(document);
  }
}
export function serializeProject(
  project: Project | DeepReadonly<Project>,
): string {
  const text = JSON.stringify(validateProject(project), null, 2);
  if (text.length > MAX_SERIALIZED_PROJECT_LENGTH)
    throw new Error(
      'Project exceeds the local development document size limit',
    );
  return text;
}
export function deserializeProject(
  text: string,
  migrations = new MigrationRegistry(),
): Project {
  if (text.length > MAX_SERIALIZED_PROJECT_LENGTH)
    throw new Error(
      'Project exceeds the local development document size limit',
    );
  return migrations.run(JSON.parse(text) as unknown);
}
