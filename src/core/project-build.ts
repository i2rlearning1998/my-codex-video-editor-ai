import { applyCommand, validateCommand, type Command } from './commands';
import {
  assertJson,
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
  constructor(base: Project) {
    this.#draft = structuredClone(base);
  }
  get state(): DeepReadonly<Project> {
    return this.#draft;
  }
  apply(commands: readonly Command[]): void {
    assertJson(commands);
    for (const command of commands)
      applyCommand(this.#draft, validateCommand(command));
  }
  finish(): Project {
    return validateProject(this.#draft);
  }
}
