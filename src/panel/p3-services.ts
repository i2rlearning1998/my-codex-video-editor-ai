// P3U: the one place the screens get the Part 2 services from. Today every
// service is a mock (src/contracts/p3-mocks.ts); when Part 2 is merged this
// file is the only change: it returns createDirectorService(...) instead.
import type { DirectorService } from '../contracts/p3';
import { createMockDirector } from '../contracts/p3-mocks';

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
