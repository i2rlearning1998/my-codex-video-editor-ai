// P1 (CREATOR-PACK-SPEC 5.2): what a code layer shows before its bake has a
// frame for the playhead. A poster is the animation's thumbnail frame,
// rendered once by its own session at half size, so a new or reloaded code
// layer is never a blank clip. The timeline shows the same poster as the
// clip's picture.
import type { BakeSpec, SessionOpener } from './baker';

interface Poster {
  image: ImageBitmap | null;
  url: string | null;
  error: boolean;
}

export class CodePosters {
  readonly #posters = new Map<string, Poster>();
  readonly #listeners = new Set<() => void>();
  constructor(private readonly open: SessionOpener) {}

  onChange(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  #emit() {
    for (const listener of [...this.#listeners]) listener();
  }
  /**
   * The poster image of a bake (`key`: its bake key, one poster per bake at
   * any quality; `spec`: the Full bake), or null while it renders. It starts
   * rendering on the first ask.
   */
  image(key: string, spec: BakeSpec): ImageBitmap | null {
    return this.#ensure(key, spec).image;
  }
  /** An object URL of the poster as PNG, for the timeline clip. */
  url(key: string, spec: BakeSpec): string | null {
    return this.#ensure(key, spec).url;
  }

  #ensure(key: string, spec: BakeSpec): Poster {
    const known = this.#posters.get(key);
    if (known) return known;
    const poster: Poster = { image: null, url: null, error: false };
    this.#posters.set(key, poster);
    void this.#render(spec, poster);
    return poster;
  }

  async #render(spec: BakeSpec, poster: Poster) {
    try {
      const width = Math.max(2, Math.round(spec.width / 2));
      const height = Math.max(2, Math.round(spec.height / 2));
      const session = await this.open(spec.tier, spec.source, {
        ...spec,
        width,
        height,
      });
      try {
        poster.image = await session.thumbnail();
      } finally {
        session.dispose();
      }
      this.#emit();
      const canvas = new OffscreenCanvas(width, height);
      canvas.getContext('2d')!.drawImage(poster.image, 0, 0);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      poster.url = URL.createObjectURL(blob);
      this.#emit();
    } catch {
      poster.error = true;
    }
  }

  dispose(): void {
    for (const poster of this.#posters.values()) {
      poster.image?.close();
      if (poster.url) URL.revokeObjectURL(poster.url);
    }
    this.#posters.clear();
    this.#listeners.clear();
  }
}
