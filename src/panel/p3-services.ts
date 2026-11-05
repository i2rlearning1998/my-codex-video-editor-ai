// P3U: the one place the screens get the Part 2 services from. Today every
// service is a mock (src/contracts/p3-mocks.ts); when Part 2 is merged this
// file is the only change: it returns createDirectorService(...) instead.
import type {
  DirectorService,
  StudioEngine,
  StudioService,
} from '../contracts/p3';
import { createMockDirector } from '../contracts/p3-mocks';
import {
  createMockStudioEngine,
  createMockStudioService,
  type MockSavedRun,
} from '../contracts/p3-mock-studio';

let director: DirectorService | undefined;
export function directorService(): DirectorService {
  // Dev and e2e only: a test can fix the token delay to keep runs fast.
  const delay = import.meta.env.DEV
    ? (window as { __AIVE_E2E_DIRECTOR_DELAY__?: number })
        .__AIVE_E2E_DIRECTOR_DELAY__
    : undefined;
  director ??= createMockDirector(
    delay === undefined ? {} : { tokenDelay: delay },
  );
  return director;
}

/** The Studio fields engine the forms are drawn with. */
export function studioEngine(): StudioEngine {
  return createMockStudioEngine();
}

/**
 * The model-driven Studio service, or null while no real one exists (the
 * screens then keep the config-driven form). Until Part 2 is merged only a dev
 * or e2e page can switch the mock on (`__AIVE_P3_STUDIO__`); in production the
 * real service replaces this body.
 */
export function studioService(
  save: (run: MockSavedRun) => string,
): StudioService | null {
  const w = window as { __AIVE_P3_STUDIO__?: boolean };
  if (!import.meta.env.DEV || !w.__AIVE_P3_STUDIO__) return null;
  return createMockStudioService({ save, stepMs: 40 });
}
