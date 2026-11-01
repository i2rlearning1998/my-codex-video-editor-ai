// P2-R1: the editor's first script. A logged-out visitor is sent to the
// website's log-in page and the editor never starts.
import { loginUrl, signedInUserId } from './auth-gate';

let storage: Storage | null = null;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
if (signedInUserId(storage)) void import('./main');
else location.replace(loginUrl(location.pathname + location.search));
