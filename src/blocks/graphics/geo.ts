// Map maths for the teaching graphics: land rings, orthographic globe and
// flat (Mercator) map projections. Pure functions; no state but a decode cache.
import { LAND_RINGS, LAND_SCALE } from './geo-data';
import type { DrawContext } from '../types';

export interface Ring {
  /** lon, lat pairs in degrees. */
  readonly pts: Float32Array;
  /** Unit vector of the ring's middle and the largest angle (rad) from it. */
  readonly c: readonly [number, number, number];
  readonly reach: number;
  readonly minLon: number;
  readonly maxLon: number;
  readonly minLat: number;
  readonly maxLat: number;
}

const rad = Math.PI / 180;
let cache: Ring[] | null = null;

export function landRings(): readonly Ring[] {
  if (cache) return cache;
  const encoded = JSON.parse(LAND_RINGS) as number[][];
  cache = encoded.map((flat) => {
    const n = flat.length / 2;
    const pts = new Float32Array(n * 2);
    let x = 0,
      y = 0,
      minLon = 999,
      maxLon = -999,
      minLat = 999,
      maxLat = -999;
    for (let i = 0; i < n; i++) {
      x += flat[i * 2]!;
      y += flat[i * 2 + 1]!;
      const lon = x / LAND_SCALE,
        lat = y / LAND_SCALE;
      pts[i * 2] = lon;
      pts[i * 2 + 1] = lat;
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
    }
    // Middle by averaging unit vectors; reach by the farthest point.
    let sx = 0,
      sy = 0,
      sz = 0;
    for (let i = 0; i < n; i++) {
      const la = pts[i * 2 + 1]! * rad,
        lo = pts[i * 2]! * rad;
      sx += Math.cos(la) * Math.sin(lo);
      sy += Math.sin(la);
      sz += Math.cos(la) * Math.cos(lo);
    }
    const len = Math.hypot(sx, sy, sz) || 1;
    const c: [number, number, number] = [sx / len, sy / len, sz / len];
    let reach = 0;
    for (let i = 0; i < n; i++) {
      const la = pts[i * 2 + 1]! * rad,
        lo = pts[i * 2]! * rad;
      const d =
        c[0] * Math.cos(la) * Math.sin(lo) +
        c[1] * Math.sin(la) +
        c[2] * Math.cos(la) * Math.cos(lo);
      reach = Math.max(reach, Math.acos(Math.max(-1, Math.min(1, d))));
    }
    return {
      pts,
      c,
      reach: n < 4 ? 0.05 : reach + 0.02,
      minLon,
      maxLon,
      minLat,
      maxLat,
    };
  });
  return cache;
}

export interface View {
  readonly lon: number;
  readonly lat: number;
}
export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Orthographic projection to a unit sphere seen from (lon0, lat0); y is up. */
export function ortho(lon: number, lat: number, v: View, out: V3): V3 {
  const phi = lat * rad,
    lam = (lon - v.lon) * rad,
    p0 = v.lat * rad;
  const cp = Math.cos(phi);
  out.x = cp * Math.sin(lam);
  out.y = Math.cos(p0) * Math.sin(phi) - Math.sin(p0) * cp * Math.cos(lam);
  out.z = Math.sin(p0) * Math.sin(phi) + Math.cos(p0) * cp * Math.cos(lam);
  return out;
}

/** Whether a unit-sphere point could be seen (used to skip hidden rings). */
export function viewCentre(v: View): [number, number, number] {
  const la = v.lat * rad,
    lo = v.lon * rad;
  return [
    Math.cos(la) * Math.sin(lo),
    Math.sin(la),
    Math.cos(la) * Math.cos(lo),
  ];
}

/**
 * Adds the land of the globe to the current path. The globe is centred at
 * (cx, cy) with radius r in px. Points behind the horizon are pushed onto the
 * limb, so a ring that wraps round the back still closes along the edge.
 */
export function globeLandPath(
  ctx: DrawContext,
  v: View,
  cx: number,
  cy: number,
  r: number,
): void {
  const vc = viewCentre(v),
    tmp: V3 = { x: 0, y: 0, z: 0 };
  for (const ring of landRings()) {
    const dot = vc[0] * ring.c[0] + vc[1] * ring.c[1] + vc[2] * ring.c[2];
    if (Math.acos(Math.max(-1, Math.min(1, dot))) - ring.reach > Math.PI / 2)
      continue;
    // Islands smaller than about a pixel are not worth drawing.
    if (ring.reach * r < 1.2) continue;
    const n = ring.pts.length / 2;
    let started = false,
      lastX = -1e9,
      lastY = -1e9;
    let pl = ring.pts[0]!,
      pa = ring.pts[1]!;
    const emit = (lon: number, lat: number) => {
      ortho(lon, lat, v, tmp);
      let x = tmp.x,
        y = tmp.y;
      if (tmp.z < 0) {
        const l = Math.hypot(x, y) || 1;
        x /= l;
        y /= l;
      }
      const px = cx + x * r,
        py = cy - y * r;
      if (started && Math.abs(px - lastX) + Math.abs(py - lastY) < 0.6) return;
      lastX = px;
      lastY = py;
      if (!started) {
        ctx.moveTo(px, py);
        started = true;
      } else ctx.lineTo(px, py);
    };
    emit(pl, pa);
    for (let i = 1; i <= n; i++) {
      const lo = ring.pts[(i % n) * 2]!,
        la = ring.pts[(i % n) * 2 + 1]!;
      const steps = Math.min(
        240,
        Math.ceil(Math.max(Math.abs(lo - pl), Math.abs(la - pa)) / 3),
      );
      for (let s = 1; s < steps; s++)
        emit(pl + ((lo - pl) * s) / steps, pa + ((la - pa) * s) / steps);
      emit(lo, la);
      pl = lo;
      pa = la;
    }
    ctx.closePath();
  }
}

/** Screen position of a lon/lat on the globe, and whether it faces us. */
export function globePoint(
  lon: number,
  lat: number,
  v: View,
  cx: number,
  cy: number,
  r: number,
): { x: number; y: number; z: number } {
  const p = ortho(lon, lat, v, { x: 0, y: 0, z: 0 });
  return { x: cx + p.x * r, y: cy - p.y * r, z: p.z };
}

export interface FlatView {
  /** Centre of the view. */
  readonly lon: number;
  readonly lat: number;
  /** Degrees of longitude across the canvas width. */
  readonly span: number;
}
const merc = (lat: number) =>
  Math.log(
    Math.tan(Math.PI / 4 + (Math.max(-82, Math.min(82, lat)) * rad) / 2),
  );

/** Mercator pixel of lon/lat for a flat view on a canvas of w x h. */
export function flatPoint(
  lon: number,
  lat: number,
  v: FlatView,
  w: number,
  h: number,
): { x: number; y: number } {
  const k = w / (v.span * rad);
  return {
    x: w / 2 + (lon - v.lon) * rad * k,
    y: h / 2 - (merc(lat) - merc(v.lat)) * k,
  };
}

/** Adds the land to the current path on a flat map. */
export function flatLandPath(
  ctx: DrawContext,
  v: FlatView,
  w: number,
  h: number,
): void {
  const halfLon = v.span / 2 + 2,
    k = w / (v.span * rad),
    halfLat = (h / 2 / k / rad) * 1.8 + 8;
  for (const ring of landRings()) {
    if (
      ring.maxLon < v.lon - halfLon ||
      ring.minLon > v.lon + halfLon ||
      ring.maxLat < v.lat - halfLat ||
      ring.minLat > v.lat + halfLat
    )
      continue;
    const n = ring.pts.length / 2;
    for (let i = 0; i < n; i++) {
      const p = flatPoint(ring.pts[i * 2]!, ring.pts[i * 2 + 1]!, v, w, h);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }
}
