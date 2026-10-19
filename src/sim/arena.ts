/**
 * Arena definitions. Gameplay collision is axis-aligned boxes plus the floor at
 * y = 0: small enough to run as the referee in a Durable Object and identical in
 * the browser (PROJECT_PLAN.md §13.2).
 *
 * Coordinates: x runs along the court (centerline at x = 0; Blue team x < 0, Red
 * team x > 0), z across it, y up. Metres.
 */

export interface Box {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
  /** Render hint only. */
  kind: 'wall' | 'bleacher' | 'stage' | 'obstacle';
}

export interface ArenaDef {
  id: string;
  name: string;
  /** The play court (lines drawn on the floor). */
  court: { halfLength: number; halfWidth: number };
  /** Players are kept inside these walls (the gym interior). */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number; height: number };
  boxes: Box[];
  /**
   * The centerline as a polyline of (z, x) points sorted by z, clamped at the
   * ends. Blue (team 0) must stay at x < line, Red at x > line. Omitted: x = 0.
   */
  centerline?: { z: number; x: number }[];
  /** Decorative basketball markings under the dodgeball lines (render only). */
  basketballLines?: boolean;
}

/** x of the centerline at a given z (§5.1). */
export function centerlineX(arena: ArenaDef, z: number): number {
  const pts = arena.centerline;
  if (!pts || pts.length === 0) return 0;
  if (z <= pts[0]!.z) return pts[0]!.x;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (z <= b.z) return a.x + ((b.x - a.x) * (z - a.z)) / (b.z - a.z);
  }
  return pts[pts.length - 1]!.x;
}

/**
 * Nudge an (x, z) point so it is at least `clearance` from every box taller than
 * `minHeight` (e.g. to spawn a ragdoll clear of walls instead of inside them).
 */
export function pushClear(arena: ArenaDef, x: number, z: number, clearance: number, minHeight = 0.3): { x: number; z: number } {
  for (let pass = 0; pass < 3; pass++) {
    for (const b of arena.boxes) {
      if (b.max.y < minHeight) continue;
      const cx = Math.min(Math.max(x, b.min.x), b.max.x);
      const cz = Math.min(Math.max(z, b.min.z), b.max.z);
      const dx = x - cx;
      const dz = z - cz;
      const d = Math.hypot(dx, dz);
      if (d >= clearance) continue;
      if (d > 1e-9) {
        x = cx + (dx / d) * clearance;
        z = cz + (dz / d) * clearance;
      } else {
        // Inside the footprint: leave by the nearest face.
        const out = [
          { d: x - b.min.x, x: b.min.x - clearance, z }, { d: b.max.x - x, x: b.max.x + clearance, z },
          { d: z - b.min.z, x, z: b.min.z - clearance }, { d: b.max.z - z, x, z: b.max.z + clearance },
        ].sort((a, c) => a.d - c.d)[0]!;
        x = out.x;
        z = out.z;
      }
    }
  }
  return { x, z };
}

export interface Seat { x: number; y: number; z: number; yaw: number }

/**
 * Spectator seats on the bleachers (§9.4), for one team's half of the hall:
 * Blue sits on the x < 0 end, Red on x > 0. Top rows first (best view), then
 * nearest the middle. `y` is the seat surface; `yaw` faces the court.
 */
export function spectatorSeats(arena: ArenaDef, team: 0 | 1): Seat[] {
  const rows = arena.boxes.filter((b) => b.kind === 'bleacher').sort((a, b) => b.max.y - a.max.y);
  const seats: Seat[] = [];
  for (const row of rows) {
    // The exposed strip of this step: up to where the next higher step starts.
    const higher = rows.filter((r) => r.max.y > row.max.y);
    const back = higher.length ? Math.min(...higher.map((r) => (row.min.z < 0 ? r.max.z : r.min.z))) : row.min.z < 0 ? row.min.z : row.max.z;
    const z = row.min.z < 0 ? (row.max.z + back) / 2 : (row.min.z + back) / 2;
    const yaw = z > 0 ? Math.PI / 2 : -Math.PI / 2;
    const rowSeats: Seat[] = [];
    for (let x = row.min.x + 0.8; x <= row.max.x - 0.8; x += 1.1) {
      if ((team === 0) === x < 0) rowSeats.push({ x, y: row.max.y, z, yaw });
    }
    rowSeats.sort((a, b) => Math.abs(a.x) - Math.abs(b.x));
    seats.push(...rowSeats);
  }
  return seats;
}

const box = (kind: Box['kind'], x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): Box => ({
  kind,
  min: { x: x0, y: y0, z: z0 },
  max: { x: x1, y: y1, z: z1 },
});

/** Greybox Classic Gym: 18 × 9 m court inside a 28 × 18 m hall. */
export const CLASSIC_GYM: ArenaDef = {
  id: 'arena.classic_gym',
  name: 'Classic Gym',
  court: { halfLength: 9, halfWidth: 4.5 },
  bounds: { minX: -14, maxX: 14, minZ: -9, maxZ: 9, height: 9 },
  boxes: [
    // Outer walls (thick, so fast balls never tunnel).
    box('wall', -15, 0, -10, -14, 9, 10),
    box('wall', 14, 0, -10, 15, 9, 10),
    box('wall', -15, 0, -10, 15, 9, -9),
    box('wall', -15, 0, 9, 15, 9, 10),
    // Bleachers along one side: three steps.
    box('bleacher', -10, 0, 7.4, 10, 0.5, 9),
    box('bleacher', -10, 0.5, 8.0, 10, 1.0, 9),
    box('bleacher', -10, 1.0, 8.5, 10, 1.5, 9),
    // Low stage at each end wall.
    box('stage', -14, 0, -4, -12.5, 0.9, 4),
    box('stage', 12.5, 0, -4, 14, 0.9, 4),
  ],
};

/** Outer walls, bleachers along one side, and a low stage at each end. */
function hall(hx: number, hz: number, height: number): Box[] {
  return [
    box('wall', -hx - 1, 0, -hz - 1, -hx, height, hz + 1),
    box('wall', hx, 0, -hz - 1, hx + 1, height, hz + 1),
    box('wall', -hx - 1, 0, -hz - 1, hx + 1, height, -hz),
    box('wall', -hx - 1, 0, hz, hx + 1, height, hz + 1),
    box('bleacher', -hx + 5, 0, hz - 1.6, hx - 5, 0.5, hz),
    box('bleacher', -hx + 5, 0.5, hz - 1.0, hx - 5, 1.0, hz),
    box('bleacher', -hx + 5, 1.0, hz - 0.5, hx - 5, 1.5, hz),
    box('stage', -hx, 0, -5, -hx + 1.5, 0.9, 5),
    box('stage', hx - 1.5, 0, -5, hx, 0.9, 5),
  ];
}

/**
 * Full Court (PROJECT_PLAN.md §7.5): the default arena. A basketball-sized court
 * (30 × 18 m, NBA is 28.7 × 15.2) with a classic straight centerline.
 */
export const FULL_COURT: ArenaDef = {
  id: 'arena.offset_court',
  name: 'Full Court',
  court: { halfLength: 15, halfWidth: 9 },
  bounds: { minX: -21, maxX: 21, minZ: -14, maxZ: 14, height: 10 },
  basketballLines: true,
  boxes: hall(21, 14, 10),
};

export const ARENAS: ArenaDef[] = [FULL_COURT, CLASSIC_GYM];
