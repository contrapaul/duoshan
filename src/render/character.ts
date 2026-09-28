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
  { name: 'handR', parent: 'foreArmR', pivot: [0, -0.27, 0], size: [0.09, 0.09, 0.04], offset: [0, -0.045, 0], color: 'skin' },
  { name: 'upperArmL', parent: 'torso', pivot: [0, 0.45, -0.27], size: [0.11, 0.3, 0.11], offset: [0, -0.15, 0], color: 'jersey' },
  { name: 'foreArmL', parent: 'upperArmL', pivot: [0, -0.3, 0], size: [0.1, 0.27, 0.1], offset: [0, -0.135, 0], color: 'skin' },
  { name: 'handL', parent: 'foreArmL', pivot: [0, -0.27, 0], size: [0.09, 0.09, 0.04], offset: [0, -0.045, 0], color: 'skin' },
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
  /** Finger and thumb hinges on each palm (children of the hand meshes, so ragdolls carry them). */
  fingers: { R: THREE.Group; L: THREE.Group };
  thumbs: { R: THREE.Group; L: THREE.Group };
  colors: { skin: number; jersey: number };
  walkPhase: number;
  throwAnim: number;
  catchFlash: number;
}

export type HandPose = 'open' | 'grip' | 'relaxed';
const CURL: Record<HandPose, number> = { open: 0, grip: 1.35, relaxed: 0.55 };

/**
 * Voxel fingers + thumb on a hanging palm (PROJECT_PLAN.md §11.2). The palm faces
 * the body (−z for the right hand); fingers hinge at the palm's lower edge and
 * curl toward the palm; the thumb sits on the palm's front edge.
 */
function addFingers(palm: THREE.Mesh, side: 1 | -1, skin: THREE.Material, outlineMat: THREE.Material, outlines: THREE.Mesh[]):
  { fingers: THREE.Group; thumb: THREE.Group } {
  const fingers = new THREE.Group();
  fingers.position.set(0, -0.045, 0);
  palm.add(fingers);
  const f = new THREE.Mesh(geo([0.085, 0.08, 0.035]), skin);
  f.position.set(0, -0.04, 0);
  f.castShadow = true;
  fingers.add(f);
  const thumb = new THREE.Group();
  thumb.position.set(0.045, 0.01, -side * 0.005);
  palm.add(thumb);
  const t = new THREE.Mesh(geo([0.03, 0.065, 0.03]), skin);
  t.position.set(0, -0.03, 0);
  t.castShadow = true;
  thumb.add(t);
  for (const m of [f, t]) {
    const o = new THREE.Mesh(m.geometry, outlineMat);
    o.scale.setScalar(1.15);
    m.add(o);
    outlines.push(o);
  }
  return { fingers, thumb };
}

function poseHand(c: Character, side: 'R' | 'L', hp: HandPose): void {
  const s = side === 'R' ? 1 : -1;
  // Curl toward the palm (−z for the right hand, +z for the left).
  c.fingers[side].rotation.x = s * CURL[hp];
  c.thumbs[side].rotation.z = hp === 'open' ? 0.7 : hp === 'grip' ? -0.2 : 0.2;
  c.thumbs[side].rotation.x = hp === 'grip' ? s * 0.8 : 0;
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
  const handR = addFingers(meshes.handR, 1, mat('skin'), outlineMat, outlines);
  const handL = addFingers(meshes.handL, -1, mat('skin'), outlineMat, outlines);
  // Eyes.
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const z of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(geo([0.02, 0.04, 0.04]), eyeMat);
    eye.position.set(0.13, 0.03, z);
    meshes.head.add(eye);
  }
  return {
    root, pivots, meshes, outlines, restore,
    fingers: { R: handR.fingers, L: handL.fingers }, thumbs: { R: handR.thumb, L: handL.thumb },
    colors: { skin: colors.skin, jersey: colors.jersey },
    walkPhase: 0, throwAnim: 0, catchFlash: 0,
  };
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
  let inward = 0;
  let handR: HandPose = p.holding ? 'grip' : 'relaxed';
  let handL: HandPose = 'relaxed';
  if (p.action === 'catch') { armR = 1.45; armL = 1.45; foreR = 0.35; foreL = 0.35; inward = 0.2; handR = 'open'; handL = 'open'; }
  // Block stance: both hands hold the ball out in front of the chest as a shield.
  if (p.action === 'block') { armR = 1.25; armL = 1.25; foreR = 0.35; foreL = 0.35; inward = 0.42; handR = 'grip'; handL = 'grip'; }
  if (p.action === 'aim') handL = 'open';
  if (p.action === 'pickup') { lean = -0.9; armR = 1.0; foreR = 0.2; }

  P.pelvis.position.y = pelvisY;
  P.torso.rotation.z = lean;
  P.head.rotation.z = p.pitch * 0.7 - lean;
  P.thighR.rotation.z = thighR; P.thighL.rotation.z = thighL;
  P.shinR.rotation.z = shinR; P.shinL.rotation.z = shinL;
  P.upperArmR.rotation.z = armR; P.upperArmL.rotation.z = armL;
  P.foreArmR.rotation.z = foreR; P.foreArmL.rotation.z = foreL;
  P.upperArmR.rotation.y = inward;
  P.upperArmL.rotation.y = -inward;
  poseHand(c, 'R', handR);
  poseHand(c, 'L', handL);
}

// ---------------------------------------------------------------------------
// First-person arms (PROJECT_PLAN.md §4.6): forearms + hands drawn in front of
// the camera in every action pose, so you can see yourself catch and block.

interface FpArm { group: THREE.Group; fingers: THREE.Group; thumb: THREE.Group }

export interface FpArms {
  root: THREE.Group;
  R: FpArm;
  L: FpArm;
  /** Ball held in the first-person view. */
  ball: THREE.Mesh;
}

/** One arm, wrist at the origin, fingers pointing −z, palm facing −y, forearm running back along +z. */
function buildFpArm(side: 1 | -1, skin: THREE.Material, jersey: THREE.Material): FpArm {
  const group = new THREE.Group();
  const fore = new THREE.Mesh(geo([0.075, 0.075, 0.34]), skin);
  fore.position.set(0, 0, 0.17);
  const cuff = new THREE.Mesh(geo([0.095, 0.095, 0.1]), jersey);
  cuff.position.set(0, 0, 0.36);
  const palm = new THREE.Mesh(geo([0.095, 0.04, 0.1]), skin);
  palm.position.set(0, 0, -0.05);
  // Four separate fingers so the hand reads as a hand up close.
  const fingers = new THREE.Group();
  fingers.position.set(0, 0, -0.1);
  for (let i = 0; i < 4; i++) {
    const f = new THREE.Mesh(geo([0.019, 0.03, i === 0 || i === 3 ? 0.07 : 0.085]), skin);
    f.position.set(-0.036 + i * 0.024, 0, i === 0 || i === 3 ? -0.035 : -0.0425);
    fingers.add(f);
  }
  const thumb = new THREE.Group();
  thumb.position.set(-side * 0.05, -0.01, -0.03);
  const t = new THREE.Mesh(geo([0.035, 0.035, 0.07]), skin);
  t.position.set(0, 0, -0.035);
  thumb.add(t);
  group.add(fore, cuff, palm, fingers, thumb);
  return { group, fingers, thumb };
}

export function createFpArms(colors: { skin: number; jersey: number }): FpArms {
  const skin = new THREE.MeshLambertMaterial({ color: colors.skin, map: voxelTexture() });
  const jersey = new THREE.MeshLambertMaterial({ color: colors.jersey, map: voxelTexture() });
  const root = new THREE.Group();
  const R = buildFpArm(1, skin, jersey);
  const L = buildFpArm(-1, skin, jersey);
  root.add(R.group, L.group);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  root.add(ball);
  return { root, R, L, ball };
}

interface ArmPose { pos: [number, number, number]; rot: [number, number, number]; curl: number }

/** Right-arm keyframes in camera space; the left arm mirrors x, rot.y and rot.z. */
const FP_POSES: Record<string, { R: ArmPose; L: ArmPose }> = {
  idle: {
    R: { pos: [0.3, -0.4, -0.4], rot: [-0.3, 0.15, -0.9], curl: 0.6 },
    L: { pos: [0.3, -0.4, -0.4], rot: [-0.3, 0.15, -0.9], curl: 0.6 },
  },
  // Hand grips the ball from the right, so both stay visible.
  carry: {
    R: { pos: [0.44, -0.4, -0.6], rot: [0.2, 0.15, -Math.PI / 2], curl: 0.9 },
    L: { pos: [0.3, -0.42, -0.4], rot: [-0.3, 0.15, -0.9], curl: 0.6 },
  },
  // Palms toward the ball, fingers up and slightly splayed: the unmistakable catch pose.
  catch: {
    R: { pos: [0.16, -0.2, -0.46], rot: [0.85, 0.25, 0.25], curl: 0.02 },
    L: { pos: [0.16, -0.2, -0.46], rot: [0.85, 0.25, 0.25], curl: 0.02 },
  },
  block: {
    R: { pos: [0.2, -0.26, -0.5], rot: [0.25, 0, -Math.PI / 2], curl: 0.8 },
    L: { pos: [0.2, -0.26, -0.5], rot: [0.25, 0, -Math.PI / 2], curl: 0.8 },
  },
  aim: {
    R: { pos: [0.5, 0.02, 0.12], rot: [0.6, 0.3, -Math.PI / 2], curl: 0.9 },
    L: { pos: [0.2, -0.2, -0.5], rot: [0.5, 0.2, 0.2], curl: 0 },
  },
  throw: {
    R: { pos: [0.08, -0.34, -0.62], rot: [-0.35, 0.25, -1.0], curl: 0.3 },
    L: { pos: [0.3, -0.42, -0.4], rot: [-0.3, 0.15, -0.9], curl: 0.6 },
  },
};

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export interface FpPoseInput {
  pose: 'idle' | 'carry' | 'catch' | 'block' | 'aim' | 'throw';
  /** Wind-up progress 0..1 while aiming (blends carry → drawn back). */
  aim: number;
  ballRadius: number;
  ballColor: number;
  showBall: boolean;
  bob: number;
  dt: number;
}

export function poseFpArms(a: FpArms, p: FpPoseInput): void {
  const k = 1 - Math.exp(-22 * p.dt);
  for (const side of ['R', 'L'] as const) {
    const s = side === 'R' ? 1 : -1;
    let target = FP_POSES[p.pose]![side];
    if (p.pose === 'aim' && side === 'R') {
      const from = FP_POSES.carry!.R;
      const to = FP_POSES.aim!.R;
      target = {
        pos: from.pos.map((v, i) => v + (to.pos[i]! - v) * p.aim) as [number, number, number],
        rot: from.rot.map((v, i) => v + (to.rot[i]! - v) * p.aim) as [number, number, number],
        curl: to.curl,
      };
    }
    const arm = a[side];
    arm.group.position.lerp(new THREE.Vector3(s * target.pos[0], target.pos[1] + p.bob, target.pos[2]), k);
    tmpQ.setFromEuler(tmpE.set(target.rot[0], s * target.rot[1], s * target.rot[2]));
    arm.group.quaternion.slerp(tmpQ, k);
    // Curl toward the palm (−y).
    arm.fingers.rotation.x += (-target.curl - arm.fingers.rotation.x) * k;
    arm.thumb.rotation.y += (s * (target.curl > 0.5 ? 0.3 : -0.5) - arm.thumb.rotation.y) * k;
  }
  // The ball: in the right palm while carrying or winding up, held out in both hands in block stance.
  const ball = a.ball;
  ball.visible = p.showBall;
  if (!p.showBall) return;
  ball.scale.setScalar(p.ballRadius);
  (ball.material as THREE.MeshLambertMaterial).color.setHex(p.ballColor);
  if (p.pose === 'block') {
    ball.position.set(0, -0.26, -0.5);
  } else {
    // Against the palm (hand-local −y is the palm side).
    const local = new THREE.Vector3(0, -(0.02 + p.ballRadius), -0.05);
    a.R.group.updateMatrix();
    ball.position.copy(local.applyMatrix4(a.R.group.matrix));
  }
}
