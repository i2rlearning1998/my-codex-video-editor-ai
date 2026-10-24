import { CommandBus } from './engine';
import { applyCommand, validateCommand, type Command } from './commands';
import {
  assertJson,
  freeze,
  validateProject,
  type DeepReadonly,
  type Project,
} from './model';

/** Offline construction only: no published state, listeners or history snapshots.
 * Uses the same command handlers as CommandBus. The complete draft is validated
 * before it can be installed through the live editor's command bus.
 */
export class ProjectBuild {
  #draft: Project;
  readonly #commands: CommandBus;
  constructor(base: Project) {
    this.#draft = structuredClone(base);
    this.#commands = new CommandBus((commands) => {
      assertJson(commands);
      return commands.map((command) => {
        applyCommand(this.#draft, validateCommand(command));
        return null;
      });
    });
  }
  get state(): DeepReadonly<Project> {
    return freeze(
      structuredClone(this.#draft),
    ) as unknown as DeepReadonly<Project>;
  }
  apply(commands: readonly Command[]): void {
    this.#commands.transaction('Build composition', commands);
  }
  finish(): Project {
    return validateProject(this.#draft);
  }
}

/**
 * The project after `commands`, built offline in chunks (yielding to the page
 * between them) with one validation at the end. `engine.preview` validates
 * the whole project after every command, which took half a minute for a
 * large composition (PHASE 0 E1).
 */
export async function buildOffline(
  base: DeepReadonly<Project>,
  commands: readonly Command[],
  options: { chunk?: number; signal?: AbortSignal } = {},
): Promise<DeepReadonly<Project>> {
  const build = new ProjectBuild(base as unknown as Project);
  const chunk = options.chunk ?? 24;
  for (let at = 0; at < commands.length; at += chunk) {
    options.signal?.throwIfAborted();
    build.apply(commands.slice(at, at + chunk));
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return freeze(build.finish()) as unknown as DeepReadonly<Project>;
}

/**
 * A long list of commands that only builds new scenes, as a few commands
 * (one CREATE_COMPOSITION per scene, then its MOVE_COMPOSITION), built offline
 * in chunks. Null when the list touches anything else (the caller then runs
 * the commands as they are). One transaction of these is one undo step.
 */
export async function compactNewScenes(
  base: DeepReadonly<Project>,
  commands: readonly Command[],
  options: { signal?: AbortSignal } = {},
): Promise<Command[] | null> {
  const known = new Set(base.compositions.map((scene) => scene.id));
  const added = new Set<string>();
  for (const command of commands)
    if (command.type === 'CREATE_COMPOSITION')
      added.add((command as { composition: { id: string } }).composition.id);
  if (!added.size) return null;
  for (const command of commands) {
    if (command.type === 'MOVE_COMPOSITION') {
      if (!added.has((command as { compositionId: string }).compositionId))
        return null;
    } else if (command.type !== 'CREATE_COMPOSITION') {
      const id = (command as { compositionId?: string }).compositionId;
      if (!id || !added.has(id) || known.has(id)) return null;
    }
  }
  const built = await buildOffline(base, commands, options);
  const out: Command[] = [];
  for (const command of commands) {
    if (command.type === 'CREATE_COMPOSITION') {
      const id = (command as { composition: { id: string } }).composition.id;
      const scene = built.compositions.find((item) => item.id === id);
      if (!scene) return null;
      out.push({
        type: 'CREATE_COMPOSITION',
        composition: structuredClone(scene),
      } as unknown as Command);
    } else if (command.type === 'MOVE_COMPOSITION') out.push(command);
  }
  return out;
}
