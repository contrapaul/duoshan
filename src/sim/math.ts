/** Small, allocation-light vector helpers. Plain objects so state serialises trivially. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const copy = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
export const lenXZ = (a: Vec3): number => Math.hypot(a.x, a.z);
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const distXZ = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.z - b.z);

export function norm(a: Vec3): Vec3 {
  const l = len(a);
  return l > 1e-9 ? scale(a, 1 / l) : v3();
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Unit view direction from yaw (0 = +x, counter-clockwise seen from above) and pitch (up positive). */
export function viewDir(yaw: number, pitch: number): Vec3 {
  const c = Math.cos(pitch);
  return { x: Math.cos(yaw) * c, y: Math.sin(pitch), z: -Math.sin(yaw) * c };
}

/** Horizontal right-hand vector for a yaw. */
export function rightDir(yaw: number): Vec3 {
  return { x: Math.sin(yaw), y: 0, z: Math.cos(yaw) };
}

/** Angle in radians between two directions (need not be normalised). */
export function angleBetween(a: Vec3, b: Vec3): number {
  const la = len(a);
  const lb = len(b);
  if (la < 1e-9 || lb < 1e-9) return Math.PI;
  return Math.acos(clamp(dot(a, b) / (la * lb), -1, 1));
}

/** Closest point on segment [a,b] to p. */
export function closestOnSegment(p: Vec3, a: Vec3, b: Vec3): Vec3 {
  const ab = sub(b, a);
  const t = clamp(dot(sub(p, a), ab) / Math.max(dot(ab, ab), 1e-9), 0, 1);
  return add(a, scale(ab, t));
}

export function reflect(v: Vec3, n: Vec3): Vec3 {
  return sub(v, scale(n, 2 * dot(v, n)));
}

/** Shortest signed difference between two angles. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
