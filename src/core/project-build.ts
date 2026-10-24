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
