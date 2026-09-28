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
