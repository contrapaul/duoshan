/**
 * Cosmetic ragdolls with Rapier (PROJECT_PLAN.md §13.2): the referee decides
 * "knocked out" or "tripped"; this makes it look funny. Every client runs the
 * same event (impact point, force, seed) so the comedy matches everywhere.
 */
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { ArenaDef } from '../sim/arena';
import { PART_SPECS, type Character, type PartName } from './character';

const WORLD_GROUP = 0x0001;
const RAGDOLL_GROUP = 0x0002;
// Ragdoll parts collide with the world only (never with each other or other ragdolls).
const RAGDOLL_FILTER = (RAGDOLL_GROUP << 16) | WORLD_GROUP;
const WORLD_FILTER = (WORLD_GROUP << 16) | RAGDOLL_GROUP;

export interface Ragdoll {
  bodies: Map<PartName, RAPIER.RigidBody>;
  char: Character;
  age: number;
}

export class RagdollWorld {
  private world: RAPIER.World;
  readonly active = new Set<Ragdoll>();
  private scene: THREE.Scene;

  private constructor(scene: THREE.Scene, arena: ArenaDef) {
    this.scene = scene;
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
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
    for (const spec of PART_SPECS) {
      const mesh = char.meshes[spec.name];
      mesh.matrixWorld.decompose(tmpP, tmpQ, tmpS);
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(tmpP.x, tmpP.y, tmpP.z)
          .setRotation({ x: tmpQ.x, y: tmpQ.y, z: tmpQ.z, w: tmpQ.w })
          .setLinvel(vel.x, vel.y, vel.z)
          .setAngvel({ x: 0, y: spin, z: 0 })
          .setLinearDamping(0.1)
          .setAngularDamping(0.6),
      );
      const [w, h, d] = spec.size;
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setDensity(spec.name === 'torso' || spec.name === 'pelvis' ? 3 : 1.5)
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
      char.pivots[spec.name].getWorldPosition(pivotWorld);
      const a = bodies.get(spec.parent)!;
      const b = bodies.get(spec.name)!;
      const la = toLocal(a, pivotWorld);
      const lb = toLocal(b, pivotWorld);
      this.world.createImpulseJoint(RAPIER.JointData.spherical(la, lb), a, b, true);
    }
    const target = nearest ?? bodies.get('torso')!;
    target.applyImpulse({ x: impulse.x, y: impulse.y, z: impulse.z }, true);

    // Detach meshes into world space; physics drives them from now on.
    for (const spec of PART_SPECS) this.scene.attach(char.meshes[spec.name]);
    const r: Ragdoll = { bodies, char, age: 0 };
    this.active.add(r);
    return r;
  }

  /** Softly pull the ragdoll's pelvis toward where the referee says the player is (trips). */
  pin(r: Ragdoll, x: number, z: number): void {
    const pelvis = r.bodies.get('pelvis')!;
    const t = pelvis.translation();
    const v = pelvis.linvel();
    pelvis.setLinvel({ x: v.x + (x - t.x) * 0.3, y: v.y, z: v.z + (z - t.z) * 0.3 }, true);
  }

  step(dt: number): void {
    this.world.timestep = dt;
    this.world.step();
    for (const r of this.active) {
      r.age += dt;
      for (const [name, body] of r.bodies) {
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

function toLocal(body: RAPIER.RigidBody, world: THREE.Vector3): RAPIER.Vector3 {
  const t = body.translation();
  const q = body.rotation();
  const inv = new THREE.Quaternion(q.x, q.y, q.z, q.w).invert();
  const v = new THREE.Vector3(world.x - t.x, world.y - t.y, world.z - t.z).applyQuaternion(inv);
  return { x: v.x, y: v.y, z: v.z };
}
