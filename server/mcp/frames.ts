// ROUND-C2 (Part 1 item 8, Part 4): sample frames the export card renders
// on the person's device and sends back (app-only `submit_frames`), so
// Claude can look at its own work with `get_frames`. Kept in memory per
// person and video for a short time; never saved.
export interface Frame {
  readonly time: number;
  /** PNG, base64. */
  readonly png: string;
}
export const MAX_FRAMES = 6;
/** One frame's base64 may be at most this long (about 600 KB of PNG). */
export const MAX_FRAME_CHARS = 800_000;

export function createFrameStore(now: () => number, ttlMs = 60 * 60_000) {
  const sets = new Map<string, { at: number; frames: Frame[] }>();
  const key = (userId: string, videoId: string) => `${userId}:${videoId}`;
  return {
    put(userId: string, videoId: string, frames: readonly Frame[]) {
      for (const [k, v] of sets) if (now() - v.at > ttlMs) sets.delete(k);
      sets.set(key(userId, videoId), {
        at: now(),
        frames: frames.slice(0, MAX_FRAMES),
      });
    },
    get(userId: string, videoId: string): readonly Frame[] {
      const s = sets.get(key(userId, videoId));
      return s && now() - s.at <= ttlMs ? s.frames : [];
    },
  };
}
export type FrameStore = ReturnType<typeof createFrameStore>;
