// P2-R1: the editor's first script. A logged-out visitor is sent to the
// website's log-in page and the editor never starts.
import { loginUrl, signedInUserId } from './auth-gate';
// The editor's styles load with this first script (as they did before the
// login check), so the page is styled from its first paint.
import './style.css';

let storage: Storage | null = null;
try {
  storage = window.localStorage;
} catch {
  storage = null;
}
if (signedInUserId(storage)) void import('./main');
else location.replace(loginUrl(location.pathname + location.search));
