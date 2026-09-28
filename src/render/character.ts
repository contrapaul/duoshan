/**
 * Teardown-style blocky characters (PROJECT_PLAN.md §11.2): one shared skeleton
 * of rigid box parts, each on a pivot at its joint, so posing is cheap and the
 * same parts become Rapier ragdoll bodies.
 *
 * Model space: feet at the origin, facing +x, right side at +z (matches the sim's
 * yaw convention; group.rotation.y = yaw).
 */
import * as THREE from 'three';

export type PartName =
  | 'pelvis' | 'torso' | 'head'
  | 'upperArmR' | 'foreArmR' | 'handR' | 'upperArmL' | 'foreArmL' | 'handL'
  | 'thighR' | 'shinR' | 'footR' | 'thighL' | 'shinL' | 'footL';

type ColorKey = 'skin' | 'jersey' | 'shorts' | 'shoe';

interface PartSpec {
  name: PartName;
  parent: PartName | null;
  pivot: [number, number, number];
  size: [number, number, number];
  offset: [number, number, number];
  color: ColorKey;
}

const SPECS: PartSpec[] = [
  { name: 'pelvis', parent: null, pivot: [0, 0.95, 0], size: [0.22, 0.2, 0.36], offset: [0, 0.05, 0], color: 'shorts' },
  { name: 'torso', parent: 'pelvis', pivot: [0, 0.12, 0], size: [0.24, 0.5, 0.42], offset: [0, 0.25, 0], color: 'jersey' },
  { name: 'head', parent: 'torso', pivot: [0, 0.52, 0], size: [0.26, 0.28, 0.24], offset: [0, 0.14, 0], color: 'skin' },
  { name: 'upperArmR', parent: 'torso', pivot: [0, 0.45, 0.27], size: [0.11, 0.3, 0.11], offset: [0, -0.15, 0], color: 'jersey' },
  { name: 'foreArmR', parent: 'upperArmR', pivot: [0, -0.3, 0], size: [0.1, 0.27, 0.1], offset: [0, -0.135, 0], color: 'skin' },
  { name: 'handR', parent: 'foreArmR', pivot: [0, -0.27, 0], size: [0.1, 0.1, 0.08], offset: [0, -0.05, 0], color: 'skin' },
  { name: 'upperArmL', parent: 'torso', pivot: [0, 0.45, -0.27], size: [0.11, 0.3, 0.11], offset: [0, -0.15, 0], color: 'jersey' },
  { name: 'foreArmL', parent: 'upperArmL', pivot: [0, -0.3, 0], size: [0.1, 0.27, 0.1], offset: [0, -0.135, 0], color: 'skin' },
  { name: 'handL', parent: 'foreArmL', pivot: [0, -0.27, 0], size: [0.1, 0.1, 0.08], offset: [0, -0.05, 0], color: 'skin' },
  { name: 'thighR', parent: 'pelvis', pivot: [0, -0.02, 0.1], size: [0.15, 0.44, 0.15], offset: [0, -0.22, 0], color: 'shorts' },
  { name: 'shinR', parent: 'thighR', pivot: [0, -0.44, 0], size: [0.13, 0.42, 0.13], offset: [0, -0.21, 0], color: 'skin' },
  { name: 'footR', parent: 'shinR', pivot: [0, -0.43, 0], size: [0.24, 0.08, 0.13], offset: [0.06, -0.02, 0], color: 'shoe' },
  { name: 'thighL', parent: 'pelvis', pivot: [0, -0.02, -0.1], size: [0.15, 0.44, 0.15], offset: [0, -0.22, 0], color: 'shorts' },
  { name: 'shinL', parent: 'thighL', pivot: [0, -0.44, 0], size: [0.13, 0.42, 0.13], offset: [0, -0.21, 0], color: 'skin' },
  { name: 'footL', parent: 'shinL', pivot: [0, -0.43, 0], size: [0.24, 0.08, 0.13], offset: [0.06, -0.02, 0], color: 'shoe' },
];

export const PART_SPECS: readonly PartSpec[] = SPECS;

const SKIN_TONES = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac, 0x5c3a21];
const JERSEYS = [0xf2f2f2, 0x2f3b52, 0x3d8c40, 0xe0b000, 0x7a3fa0, 0x1f7a8c, 0xd35400, 0x8e8e8e];

/** Pixel-noise texture so flat boxes read as voxel material. */
let voxelTex: THREE.Texture | undefined;
function voxelTexture(): THREE.Texture {
  if (voxelTex) return voxelTex;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const v = 225 + Math.floor(Math.random() * 30);
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, y, 1, 1);
    }
  }
  voxelTex = new THREE.CanvasTexture(c);
  voxelTex.magFilter = THREE.NearestFilter;
  voxelTex.minFilter = THREE.NearestFilter;
  voxelTex.colorSpace = THREE.SRGBColorSpace;
  return voxelTex;
}

const boxGeo = new Map<string, THREE.BoxGeometry>();
function geo(size: [number, number, number]): THREE.BoxGeometry {
  const k = size.join(',');
  let g = boxGeo.get(k);
  if (!g) boxGeo.set(k, (g = new THREE.BoxGeometry(...size)));
  return g;
}

export interface Character {
  root: THREE.Group;
  pivots: Record<PartName, THREE.Group>;
  meshes: Record<PartName, THREE.Mesh>;
  outlines: THREE.Mesh[];
  /** Original local transforms of the part meshes (restored after a ragdoll). */
  restore: Map<THREE.Mesh, { parent: THREE.Object3D; pos: THREE.Vector3; quat: THREE.Quaternion }>;
  walkPhase: number;
  throwAnim: number;
  catchFlash: number;
}

export function createCharacter(seed: number, outlineColor: number): Character {
  const rand = (n: number) => Math.abs(Math.sin(seed * 9301 + n * 49297)) % 1;
  const colors: Record<ColorKey, number> = {
    skin: SKIN_TONES[Math.floor(rand(1) * SKIN_TONES.length)]!,
    jersey: JERSEYS[Math.floor(rand(2) * JERSEYS.length)]!,
    shorts: rand(3) < 0.5 ? 0x222222 : 0x1b2a4a,
    shoe: 0xeeeeee,
  };
  const mats = new Map<ColorKey, THREE.MeshLambertMaterial>();
  const mat = (k: ColorKey) => {
    let m = mats.get(k);
    if (!m) mats.set(k, (m = new THREE.MeshLambertMaterial({ color: colors[k], map: voxelTexture() })));
    return m;
  };
  const outlineMat = new THREE.MeshBasicMaterial({ color: outlineColor, side: THREE.BackSide });

  const root = new THREE.Group();
  const pivots = {} as Record<PartName, THREE.Group>;
  const meshes = {} as Record<PartName, THREE.Mesh>;
  const outlines: THREE.Mesh[] = [];
  const restore: Character['restore'] = new Map();
  for (const s of SPECS) {
    const pivot = new THREE.Group();
    pivot.position.set(...s.pivot);
    (s.parent ? pivots[s.parent] : root).add(pivot);
    const mesh = new THREE.Mesh(geo(s.size), mat(s.color));
    mesh.position.set(...s.offset);
    mesh.castShadow = true;
    pivot.add(mesh);
    const outline = new THREE.Mesh(geo(s.size), outlineMat);
    outline.scale.setScalar(1.12);
    mesh.add(outline);
    outlines.push(outline);
    pivots[s.name] = pivot;
    meshes[s.name] = mesh;
    restore.set(mesh, { parent: pivot, pos: mesh.position.clone(), quat: mesh.quaternion.clone() });
  }
  // Eyes.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const z of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(geo([0.02, 0.04, 0.04]), eyeMat);
    eye.position.set(0.13, 0.03, z);
    meshes.head.add(eye);
  }
  return { root, pivots, meshes, outlines, restore, walkPhase: 0, throwAnim: 0, catchFlash: 0 };
}

export function setOutline(c: Character, color: number | null): void {
  for (const o of c.outlines) {
    o.visible = color !== null;
    if (color !== null) (o.material as THREE.MeshBasicMaterial).color.setHex(color);
  }
}

export interface PoseInput {
  speed: number;
  dt: number;
  pitch: number;
  crouching: boolean;
  sliding: boolean;
  airborne: boolean;
  holding: boolean;
  action: 'none' | 'pickup' | 'aim' | 'catch' | 'block';
  actionT: number;
  windup: number;
}

/** Procedural pose. Cheap, readable, and good enough for the prototype. */
export function pose(c: Character, p: PoseInput): void {
  const P = c.pivots;
  c.walkPhase += p.speed * p.dt * 2.4;
  c.throwAnim = Math.max(0, c.throwAnim - p.dt);
  const k = Math.min(1, p.speed / 4.5);
  const s = Math.sin(c.walkPhase);
  let pelvisY = 0.95;
  let lean = -0.08 * k;
  let thighR = s * 0.75 * k;
  let thighL = -s * 0.75 * k;
  let shinR = -Math.max(0, -Math.cos(c.walkPhase)) * 1.0 * k - 0.05;
  let shinL = -Math.max(0, Math.cos(c.walkPhase)) * 1.0 * k - 0.05;
  let armR = -s * 0.6 * k;
  let armL = s * 0.6 * k;
  let foreR = 0.3 + 0.3 * k;
  let foreL = 0.3 + 0.3 * k;

  if (p.crouching && !p.sliding) {
    pelvisY = 0.62;
    thighR = 1.1 + s * 0.4 * k; thighL = 1.1 - s * 0.4 * k;
    shinR = -1.5; shinL = -1.5;
    lean = -0.35;
  }
  if (p.sliding) {
    pelvisY = 0.32;
    lean = 0.9;
    thighR = 1.45; thighL = 1.2;
    shinR = -0.1; shinL = -0.6;
    armR = 0.6; armL = -0.4;
  }
  if (p.airborne && !p.sliding) {
    thighR = 0.6; thighL = 0.2; shinR = -0.9; shinL = -0.5;
  }
  if (p.holding) { armR = 0.9; foreR = 0.9; }
  if (p.action === 'aim') {
    const w = Math.min(1, p.actionT / Math.max(0.05, p.windup));
    armR = 0.9 + (-2.6 - 0.9) * w;
    foreR = 0.9 + 0.5 * w;
    armL = 1.3 * w; foreL = 0.2;
    lean += 0.15 * w;
  }
  if (c.throwAnim > 0) {
    const t = 1 - c.throwAnim / 0.25;
    armR = -2.6 + 4.2 * Math.min(1, t * 2);
    foreR = 0.2;
    lean -= 0.3 * Math.sin(t * Math.PI);
  }
  if (p.action === 'catch') { armR = 1.45; armL = 1.45; foreR = 0.35; foreL = 0.35; }
  if (p.action === 'block') { armR = 1.7; foreR = 0.1; armL = 1.2; foreL = 0.5; }
  if (p.action === 'pickup') { lean = -0.9; armR = 1.0; foreR = 0.2; }

  P.pelvis.position.y = pelvisY;
  P.torso.rotation.z = lean;
  P.head.rotation.z = p.pitch * 0.7 - lean;
  P.thighR.rotation.z = thighR; P.thighL.rotation.z = thighL;
  P.shinR.rotation.z = shinR; P.shinL.rotation.z = shinL;
  P.upperArmR.rotation.z = armR; P.upperArmL.rotation.z = armL;
  P.foreArmR.rotation.z = foreR; P.foreArmL.rotation.z = foreL;
  P.upperArmR.rotation.x = p.action === 'catch' ? -0.25 : 0;
  P.upperArmL.rotation.x = p.action === 'catch' ? 0.25 : 0;
}
