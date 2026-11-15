/// <reference lib="webworker" />
// W5-A export worker. ROUND-C2 (D-437): the frame loop moved to
// render-job.ts unchanged, so the MCP export card can run it in a page.
import {
  canUseMp4,
  renderJob,
  type WorkerMessage,
  type WorkerRequest,
} from './render-job';

export type { ExportJob, WorkerMessage, WorkerRequest } from './render-job';

let cancelled = false;
const post = (message: WorkerMessage, transfer: Transferable[] = []) =>
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(
    message,
    transfer,
  );

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') cancelled = true;
  else if (request.type === 'probe')
    void canUseMp4(request.width, request.height, request.fps).then(
      (mp4) => post({ type: 'probe', mp4 }),
      () => post({ type: 'probe', mp4: false }),
    );
  else
    void renderJob(request.job, { post, cancelled: () => cancelled }).catch(
      (error: unknown) =>
        post({
          type: 'error',
          message: error instanceof Error ? error.message : String(error),
        }),
    );
};
