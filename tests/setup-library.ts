// Phase 1 library: unit tests run without the catalog client, so the
// built-in themes are registered from the seed, as the catalog would.
import { registerBuiltInThemes } from '../src/themes/themes';
import { SEED_THEMES } from '../library/seed/themes';

registerBuiltInThemes(SEED_THEMES);
