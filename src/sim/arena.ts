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

/**
 * Offset Court (test arena, PROJECT_PLAN.md §7.5): the Classic Gym hall with a
 * stepped centerline and chest-high walls. Balanced by 180° rotation about the
 * court centre: every feature on Blue's side has a rotated twin on Red's, so
 * each team gets a 1.5 m "tongue" into the other half and equal area.
 */
const WALL_H = 1.1;
const wallPair = (cx: number, cz: number, sx: number, sz: number): Box[] => [
  box('obstacle', cx - sx / 2, 0, cz - sz / 2, cx + sx / 2, WALL_H, cz + sz / 2),
  box('obstacle', -cx - sx / 2, 0, -cz - sz / 2, -cx + sx / 2, WALL_H, -cz + sz / 2),
];

export const OFFSET_COURT: ArenaDef = {
  id: 'arena.offset_court',
  name: 'Offset Court (test)',
  court: CLASSIC_GYM.court,
  bounds: CLASSIC_GYM.bounds,
  centerline: [
    { z: -1.5, x: -1.5 }, // z < -1.5: Red's tongue reaches 1.5 m into Blue's half
    { z: 1.5, x: 1.5 }, //  z > 1.5: Blue's tongue reaches 1.5 m into Red's half
  ],
  boxes: [
    ...CLASSIC_GYM.boxes,
    // Blue-side walls (the second of each pair is Red's rotated twin).
    ...wallPair(-5.5, 2.0, 0.3, 2.2), // midfield cover, runs along the court
    ...wallPair(-3.0, -2.6, 2.0, 0.3), // across the court, facing Red's tongue
    ...wallPair(-1.2, 3.6, 0.3, 1.4), // cover at the base of Blue's tongue
  ],
};

export const ARENAS: ArenaDef[] = [CLASSIC_GYM, OFFSET_COURT];
