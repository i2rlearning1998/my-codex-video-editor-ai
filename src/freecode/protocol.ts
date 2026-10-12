export interface Reply {
  token: string;
  id: number;
  kind: 'ready' | 'frame' | 'error';
  bitmap?: ImageBitmap;
  message?: string;
}
export function isReply(data: unknown, token: string): data is Reply {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  return (
    d.token === token &&
    Number.isSafeInteger(d.id) &&
    ['ready', 'frame', 'error'].includes(String(d.kind)) &&
    (d.kind !== 'error' || typeof d.message === 'string')
  );
}
export function assertFrame(
  frame: number,
  count: number,
  seekable: boolean,
  next: number,
): void {
  if (!Number.isSafeInteger(frame) || frame < 0 || frame >= count)
    throw Error(`Frame must be an integer in 0..${count - 1}.`);
  if (!seekable && frame !== next)
    throw Error(
      `Stateful animation needs frame ${next}; open a fresh session to restart.`,
    );
}
