/**
 * Cosmetic ragdolls with Rapier (PROJECT_PLAN.md §13.2): the referee decides
 * "knocked out" or "tripped"; this makes it look funny. Every client runs the
 * same event (impact point, force, seed) so the comedy matches everywhere.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { pushClear, type ArenaDef } from '../sim/arena';
import { PART_SPECS, type Character, type PartName } from './character';

const WORLD_GROUP = 0x0001;
const RAGDOLL_GROUP = 0x0002;
// Ragdoll parts collide with the world only (never with each other or other ragdolls).
const RAGDOLL_FILTER = (RAGDOLL_GROUP << 16) | WORLD_GROUP;
const WORLD_FILTER = (WORLD_GROUP << 16) | RAGDOLL_GROUP;
/** Ragdolls start this far (m) from any wall; limbs reach about this far from the body's centre. */
const RAGDOLL_CLEARANCE = 0.55;
const PIN_MAX_SPEED = 2;
/**
 * Realistic part masses (kg, ~69 kg total). Tiny hands on a heavy torso (the old
 * density-based masses were ~300:1) make the joint solver unstable: limbs whip
 * and spin forever, which read as bodies flipping out.
 */
const PART_MASS: Record<PartName, number> = {
  pelvis: 10, torso: 20, head: 5,
  upperArmR: 2.5, foreArmR: 1.5, handR: 0.8, upperArmL: 2.5, foreArmL: 1.5, handL: 0.8,
  thighR: 7, shinR: 4, footR: 1.2, thighL: 7, shinL: 4, footL: 1.2,
};
const RIGID_PARTS = new Set<PartName>(['handR', 'handL', 'footR', 'footL']);
/** Referee impulses are authored in "small" units; scale them to the real masses above. */
const IMPULSE_SCALE = 20;
/** Speed caps (m/s, rad/s): enough for a heavy-ball flip, never a launch. */
const MAX_LIN = 12;
const MAX_ANG = 14;

export interface Ragdoll {
  bodies: Map<PartName, RAPIER.RigidBody>;
  char: Character;
  age: number;
}

export class RagdollWorld {
  private world: RAPIER.World;
  readonly active = new Set<Ragdoll>();
  private scene: THREE.Scene;
  private arena: ArenaDef;

  private constructor(scene: THREE.Scene, arena: ArenaDef) {
    this.scene = scene;
    this.arena = arena;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    // Extra solver iterations keep the jointed chain stiff instead of whipping.
    this.world.numSolverIterations = 8;
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(40, 0.5, 40).setTranslation(0, -0.5, 0).setFriction(0.9).setCollisionGroups(WORLD_FILTER),
      ground,
    );
    for (const b of arena.boxes) {
      const hx = (b.max.x - b.min.x) / 2, hy = (b.max.y - b.min.y) / 2, hz = (b.max.z - b.min.z) / 2;
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz)
          .setTranslation(b.min.x + hx, b.min.y + hy, b.min.z + hz)
          .setFriction(0.8)
          .setCollisionGroups(WORLD_FILTER),
        ground,
      );
    }
  }

  static async create(scene: THREE.Scene, arena: ArenaDef): Promise<RagdollWorld> {
    await RAPIER.init();
    return new RagdollWorld(scene, arena);
  }

  /**
   * Turn a posed character into physics bodies. `impulse` is applied at the part
   * nearest `point`; `vel` is the character's velocity.
   */
  spawn(char: Character, vel: THREE.Vector3, point: THREE.Vector3 | null, impulse: THREE.Vector3, seed: number): Ragdoll {
    char.root.updateMatrixWorld(true);
    const bodies = new Map<PartName, RAPIER.RigidBody>();
    const tmpP = new THREE.Vector3();
    const tmpQ = new THREE.Quaternion();
    const tmpS = new THREE.Vector3();
    let nearest: RAPIER.RigidBody | undefined;
    let nearestD = Infinity;
    const spin = ((seed % 1000) / 1000 - 0.5) * 6;
    // Start the body clear of walls. Parts spawned inside a wall get shoved out
    // violently by the solver: that was the "massive flip" bug.
    const root = char.root.position;
    const clear = pushClear(this.arena, root.x, root.z, RAGDOLL_CLEARANCE);
    const shift = new THREE.Vector3(clear.x - root.x, 0, clear.z - root.z);
    for (const spec of PART_SPECS) {
      const mesh = char.meshes[spec.name];
      mesh.matrixWorld.decompose(tmpP, tmpQ, tmpS);
      tmpP.add(shift);
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(tmpP.x, tmpP.y, tmpP.z)
          .setRotation({ x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w })
          .setLinvel(vel.x, vel.y, vel.z)
          .setAngvel({ x: 0, y: spin, z: 0 })
          .setLinearDamping(0.1)
          .setAngularDamping(1.2),
      );
      const [w, h, d] = spec.size;
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setMass(PART_MASS[spec.name])
          .setFriction(0.8).setRestitution(0.1).setCollisionGroups(RAGDOLL_FILTER),
        body,
      );
      bodies.set(spec.name, body);
      if (point) {
        const dd = tmpP.distanceTo(point);
        if (dd < nearestD) { nearestD = dd; nearest = body; }
      }
    }
    // Spherical joints at each child's pivot.
    const pivotWorld = new THREE.Vector3();
    for (const spec of PART_SPECS) {
      if (!spec.parent) continue;
      char.pivots[spec.name].getWorldPosition(pivotWorld).add(shift);
      const a = bodies.get(spec.parent)!;
      const b = bodies.get(spec.name)!;
      const la = toLocal(a, pivotWorld);
      const lb = toLocal(b, pivotWorld);
      // Hands and feet are welded to their limb: a free wrist/ankle lets these
      // light parts spin in place forever.
      const data = RIGID_PARTS.has(spec.name)
        ? RAPIER.JointData.fixed(la, invRot(a), lb, invRot(b))
        : RAPIER.JointData.spherical(la, lb);
      this.world.createImpulseJoint(data, a, b, true);
    }
    const target = nearest ?? bodies.get('torso')!;
    const k = IMPULSE_SCALE;
    target.applyImpulse({ x: impulse.x * k, y: impulse.y * k, z: impulse.z * k }, true);

    // Detach meshes into world space; physics drives them from now on.
    for (const spec of PART_SPECS) this.scene.attach(char.meshes[spec.name]);
    const r: Ragdoll = { bodies, char, age: 0 };
    this.active.add(r);
    return r;
  }

  /**
   * Gently steer the ragdoll's pelvis toward where the referee says the player is
   * (trips). Blends toward a capped velocity instead of adding to it every frame,
   * so it can't wind up and fling the body into a wall.
   */
  pin(r: Ragdoll, x: number, z: number): void {
    const pelvis = r.bodies.get('pelvis')!;
    const t = pelvis.translation();
    const v = pelvis.linvel();
    let tx = (x - t.x) * 3;
    let tz = (z - t.z) * 3;
    const l = Math.hypot(tx, tz);
    if (l > PIN_MAX_SPEED) { tx *= PIN_MAX_SPEED / l; tz *= PIN_MAX_SPEED / l; }
    pelvis.setLinvel({ x: v.x * 0.85 + tx * 0.15, y: v.y, z: v.z * 0.85 + tz * 0.15 }, true);
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
    for (const r of this.active) {
      r.age += dt;
      for (const [name, body] of r.bodies) {
        clampVelocity(body);
        const m = r.char.meshes[name];
        const t = body.translation();
        const q = body.rotation();
        m.position.set(t.x, t.y, t.z);
        m.quaternion.set(q.x, q.y, q.z, q.w);
      }
    }
  }

  /** Remove bodies and put the meshes back on the skeleton. */
  remove(r: Ragdoll): void {
    for (const body of r.bodies.values()) this.world.removeRigidBody(body);
    for (const [mesh, o] of r.char.restore) {
      o.parent.add(mesh);
      mesh.position.copy(o.pos);
      mesh.quaternion.copy(o.quat);
    }
    this.active.delete(r);
  }
}

/** Hard caps so no solver hiccup can ever turn into a flying, spinning body. */
function clampVelocity(body: RAPIER.RigidBody): void {
  const v = body.linvel();
  const s = Math.hypot(v.x, v.y, v.z);
  if (s > MAX_LIN) body.setLinvel({ x: (v.x * MAX_LIN) / s, y: (v.y * MAX_LIN) / s, z: (v.z * MAX_LIN) / s }, true);
  const w = body.angvel();
  const a = Math.hypot(w.x, w.y, w.z);
  if (a > MAX_ANG) body.setAngvel({ x: (w.x * MAX_ANG) / a, y: (w.y * MAX_ANG) / a, z: (w.z * MAX_ANG) / a }, true);
}

/** Inverse of a body's rotation: the joint frame that keeps the spawn-time relative orientation. */
function invRot(body: RAPIER.RigidBody): RAPIER.Rotation {
  const q = body.rotation();
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

function toLocal(body: RAPIER.RigidBody, world: THREE.Vector3): RAPIER.Vector3 {
  const t = body.translation();
  const q = body.rotation();
  const inv = new THREE.Quaternion(q.x, q.y, q.z, q.w).invert();
  const v = new THREE.Vector3(world.x - t.x, world.y - t.y, world.z - t.z).applyQuaternion(inv);
  return { x: v.x, y: v.y, z: v.z };
}
