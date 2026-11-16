// ROUND-C2 Part 1 (RDC2-001): a chat host for the export card, the way
// one embeds an MCP App: a sandboxed iframe on another origin, JSON-RPC
// over postMessage through the ext-apps AppBridge. Tool calls the card
// makes are passed to the test (window.__callTool), which sends them to
// the real server through an MCP client.
import {
  AppBridge,
  PostMessageTransport,
} from '@modelcontextprotocol/ext-apps/app-bridge';

declare global {
  interface Window {
    __callTool(params: unknown): Promise<unknown>;
    __host: {
      downloads: {
        name: string;
        chars: number;
        at: number;
        /** ROUND-C4 (0.4): the file itself (base64), to compare frames. */
        blob?: string;
      }[];
      context: unknown[];
      calls: string[];
      /** ROUND-C3: every message the host window got that carries "leak". */
      leaks: number;
    };
    startCard(o: {
      src: string;
      sandbox: string;
      toolResult: unknown;
      downloadFile: boolean;
      updateModelContext: boolean;
    }): Promise<void>;
  }
}
window.__host = { downloads: [], context: [], calls: [], leaks: 0 };
window.addEventListener('message', (e) => {
  if (JSON.stringify(e.data ?? '').includes('leak')) window.__host.leaks++;
});
window.startCard = async (o) => {
  const iframe = document.createElement('iframe');
  iframe.id = 'card';
  iframe.setAttribute('sandbox', o.sandbox);
  document.querySelector('#slot')!.append(iframe);
  const bridge = new AppBridge(
    null,
    { name: 'harness-host', version: '1.0.0' },
    {
      serverTools: {},
      ...(o.downloadFile ? { downloadFile: {} } : {}),
      ...(o.updateModelContext
        ? { updateModelContext: { image: {}, text: {} } }
        : {}),
    },
    { hostContext: { locale: 'en-US', theme: 'light' } },
  );
  bridge.oncalltool = async (params) => {
    window.__host.calls.push(params.name);
    return (await window.__callTool(params)) as never;
  };
  bridge.ondownloadfile = async ({ contents }) => {
    for (const c of contents)
      if (c.type === 'resource' && 'blob' in c.resource)
        window.__host.downloads.push({
          name: c.resource.uri,
          chars: (c.resource.blob as string).length,
          at: performance.now(),
          blob: c.resource.blob as string,
        });
    return {};
  };
  bridge.onupdatemodelcontext = async (params) => {
    window.__host.context.push(params);
    return {};
  };
  bridge.oninitialized = () =>
    void bridge.sendToolResult(o.toolResult as never);
  await bridge.connect(
    new PostMessageTransport(iframe.contentWindow!, iframe.contentWindow!),
  );
  iframe.src = o.src;
};
