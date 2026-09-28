/**
 * Draws a GameState: characters (posed or ragdolled), balls, camera. Holds no
 * game rules; everything it shows comes from the referee's state and events.
 */
import * as THREE from 'three';
import { eyePos } from '../sim/game';
import { lerp, rightDir, viewDir } from '../sim/math';
import { BALLS } from '../sim/tuning';
import type { Ball, GameState, Player, SimEvent } from '../sim/types';
import { createCharacter, pose, setOutline, type Character } from './character';
import type { Ragdoll, RagdollWorld } from './ragdoll';
import { buildGym, createRenderer, type Quality } from './scene';

const BALL_COLORS = {
  standard: { live: 0xd62828, dead: 0xf4a6a6 },
  speed: { live: 0xff7b00, dead: 0xffc98a },
  heavy: { live: 0x1d4ed8, dead: 0x9db7f5 },
} as const;
const TEAMMATE = 0x3a86ff;
const TRAIL_LEN = 10;
const OPPONENT = 0xff2d2d;

export interface Snap {
  players: { x: number; y: number; z: number }[];
  balls: { x: number; y: number; z: number }[];
}

export function snapPositions(s: GameState): Snap {
  return {
    players: s.players.map((p) => ({ ...p.pos })),
    balls: s.balls.map((b) => ({ ...b.pos })),
  };
}

interface Trail { line: THREE.Line; pts: THREE.Vector3[] }

export class GameView {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(80, 1, 0.05, 200);
  private chars: Character[] = [];
  private ragdolls = new Map<number, { r: Ragdoll; kind: 'ko' | 'trip' }>();
  private ballMeshes: THREE.Mesh[] = [];
  private trails: Trail[] = [];
  private viewBall: THREE.Mesh;
  private ragdollWorld: RagdollWorld;
  thirdPerson = true;
  private local: number;

  private constructor(canvas: HTMLCanvasElement, state: GameState, local: number, quality: Quality, rw: RagdollWorld, scene: THREE.Scene) {
    this.renderer = createRenderer(canvas, quality);
    this.scene = scene;
    this.local = local;
    this.ragdollWorld = rw;
    buildGym(this.scene, state.arena, quality);
    const localTeam = state.players[local]?.team ?? 0;
    for (const p of state.players) {
      const c = createCharacter(p.id * 13 + 5, p.team === localTeam ? TEAMMATE : OPPONENT);
      if (p.id === local) setOutline(c, null);
      this.scene.add(c.root);
      this.chars.push(c);
    }
    for (const b of state.balls) {
      const def = BALLS[b.type];
      const m = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 20, 14), new THREE.MeshLambertMaterial({ color: BALL_COLORS[b.type].live }));
      m.castShadow = true;
      this.scene.add(m);
      this.ballMeshes.push(m);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3));
      const line = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: BALL_COLORS[b.type].live, transparent: true, opacity: 0.5 }));
      line.frustumCulled = false;
      this.scene.add(line);
      this.trails.push({ line, pts: [] });
    }
    // First-person held ball.
    this.viewBall = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 14), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    this.camera.add(this.viewBall);
    this.scene.add(this.camera);
  }

  static async create(canvas: HTMLCanvasElement, state: GameState, local: number, quality: Quality): Promise<GameView> {
    const scene = new THREE.Scene();
    // Rapier (~1.3 MB) is a separate chunk, loaded when a match starts, so the menu appears fast.
    const { RagdollWorld } = await import('./ragdoll');
    const rw = await RagdollWorld.create(scene, state.arena);
    return new GameView(canvas, state, local, quality, rw, scene);
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** React to referee events (ragdolls, throw animations). Call once per sim tick. */
  onEvents(state: GameState, events: SimEvent[]): void {
    for (const e of events) {
      if (e.t === 'ko' || e.t === 'trip') {
        const p = state.players[e.player]!;
        const c = this.chars[e.player]!;
        const existing = this.ragdolls.get(e.player);
        if (existing) { this.ragdollWorld.remove(existing.r); this.ragdolls.delete(e.player); }
        const vel = new THREE.Vector3(p.vel.x, Math.max(0, p.vel.y), p.vel.z);
        const point = e.t === 'ko' ? new THREE.Vector3(e.point.x, e.point.y, e.point.z) : null;
        const imp = new THREE.Vector3(e.impulse.x, e.impulse.y, e.impulse.z);
        if (e.t === 'ko' && imp.lengthSq() > 0.01) imp.y += imp.length() * 0.6; // heavy balls flip people
        const r = this.ragdollWorld.spawn(c, vel, point, imp, e.seed);
        this.ragdolls.set(e.player, { r, kind: e.t === 'ko' ? 'ko' : 'trip' });
      }
      if (e.t === 'throw') this.chars[e.player]!.throwAnim = 0.25;
    }
  }

  stepPhysics(dt: number, state: GameState): void {
    for (const [id, rd] of this.ragdolls) {
      const p = state.players[id]!;
      if (rd.kind === 'trip') {
        if (p.life === 'tripped') this.ragdollWorld.pin(rd.r, p.pos.x, p.pos.z);
        else { this.ragdollWorld.remove(rd.r); this.ragdolls.delete(id); }
      } else if (p.life !== 'out' || rd.r.age > 3.5) {
        this.ragdollWorld.remove(rd.r);
        this.ragdolls.delete(id);
      }
    }
    this.ragdollWorld.step(dt);
  }

  render(state: GameState, prev: Snap, alpha: number, dt: number, look: { yaw: number; pitch: number }): void {
    const local = state.players[this.local]!;
    for (const p of state.players) this.drawPlayer(state, p, prev.players[p.id]!, alpha, dt, look);
    state.balls.forEach((b, i) => this.drawBall(b, prev.balls[i]!, alpha, state));
    this.placeCamera(state, local, prev.players[local.id]!, alpha, look);
    this.renderer.render(this.scene, this.camera);
  }

  private drawPlayer(state: GameState, p: Player, prev: { x: number; y: number; z: number }, alpha: number, dt: number, look: { yaw: number; pitch: number }): void {
    const c = this.chars[p.id]!;
    const ragdolled = this.ragdolls.has(p.id);
    const firstPersonSelf = p.id === this.local && !this.thirdPerson && p.life !== 'out';
    c.root.visible = !ragdolled && p.life !== 'out' && !firstPersonSelf;
    if (ragdolled) {
      // Parts live in world space while ragdolled; hide them in first person for yourself.
      for (const m of Object.values(c.meshes)) m.visible = !(p.id === this.local && !this.thirdPerson && p.life === 'tripped');
      return;
    }
    for (const m of Object.values(c.meshes)) m.visible = true;
    if (!c.root.visible) return;
    c.root.position.set(lerp(prev.x, p.pos.x, alpha), lerp(prev.y, p.pos.y, alpha), lerp(prev.z, p.pos.z, alpha));
    const yaw = p.id === this.local ? look.yaw : p.yaw;
    const pitch = p.id === this.local ? look.pitch : p.pitch;
    c.root.rotation.y = yaw;
    const a = p.action;
    const held = p.held >= 0;
    pose(c, {
      speed: Math.hypot(p.vel.x, p.vel.z), dt, pitch,
      crouching: p.crouching, sliding: p.slideT > 0, airborne: !p.onGround,
      holding: held, action: a.kind, actionT: 't' in a ? a.t : 0,
      windup: held ? BALLS[state.balls[p.held]!.type].windup : 0.25,
    });
    // Blink during spawn protection.
    if (p.protectT > 0) c.root.visible = Math.floor(p.protectT * 10) % 2 === 0;
  }

  private drawBall(b: Ball, prev: { x: number; y: number; z: number }, alpha: number, state: GameState): void {
    const m = this.ballMeshes[b.id]!;
    const trail = this.trails[b.id]!;
    const holder = b.state === 'held' ? state.players[b.holder] : undefined;
    const fpHeld = holder && holder.id === this.local && !this.thirdPerson;
    m.visible = !fpHeld;
    if (holder && !fpHeld) {
      // Sit the ball in the character's right hand.
      const c = this.chars[holder.id]!;
      c.root.updateMatrixWorld(true);
      c.meshes.handR.getWorldPosition(m.position);
    } else {
      m.position.set(lerp(prev.x, b.pos.x, alpha), lerp(prev.y, b.pos.y, alpha), lerp(prev.z, b.pos.z, alpha));
    }
    const mat = m.material as THREE.MeshLambertMaterial;
    mat.color.setHex(b.state === 'dead' || b.state === 'rest' ? BALL_COLORS[b.type].dead : BALL_COLORS[b.type].live);
    // Live-ball trail.
    if (b.state === 'live') {
      trail.pts.push(m.position.clone());
      if (trail.pts.length > TRAIL_LEN) trail.pts.shift();
    } else {
      trail.pts.length = 0;
    }
    trail.line.visible = trail.pts.length > 1;
    if (trail.line.visible) {
      const attr = trail.line.geometry.getAttribute('position') as THREE.BufferAttribute;
      trail.pts.forEach((v, i) => attr.setXYZ(i, v.x, v.y, v.z));
      attr.needsUpdate = true;
      trail.line.geometry.setDrawRange(0, trail.pts.length);
    }
    if (fpHeld) {
      const vb = this.viewBall;
      (vb.material as THREE.MeshLambertMaterial).color.setHex(BALL_COLORS[b.type].live);
      vb.scale.setScalar(BALLS[b.type].radius / 0.105);
      const aim = holder.action.kind === 'aim' ? Math.min(1, holder.action.t / BALLS[b.type].windup) : 0;
      vb.position.set(0.28, -0.25 + aim * 0.15, -0.55 + aim * 0.25);
    }
  }

  private placeCamera(state: GameState, me: Player, prev: { x: number; y: number; z: number }, alpha: number, look: { yaw: number; pitch: number }): void {
    const held = me.held >= 0 && !this.thirdPerson && me.life !== 'out';
    this.viewBall.visible = held;
    if (me.life === 'out') {
      // Spectate from above your own half.
      const s = me.team === 0 ? -1 : 1;
      this.camera.position.set(s * 13, 7.5, 0);
      this.camera.lookAt(0, 0.5, 0);
      return;
    }
    const pos = { x: lerp(prev.x, me.pos.x, alpha), y: lerp(prev.y, me.pos.y, alpha), z: lerp(prev.z, me.pos.z, alpha) };
    const eye = eyePos({ ...me, pos });
    const f = viewDir(look.yaw, look.pitch);
    const r = rightDir(look.yaw);
    if (this.thirdPerson) {
      const b = state.arena.bounds;
      const cam = new THREE.Vector3(eye.x - f.x * 3 + r.x * 0.6, eye.y - f.y * 3 + 0.3, eye.z - f.z * 3 + r.z * 0.6);
      cam.x = Math.min(b.maxX - 0.3, Math.max(b.minX + 0.3, cam.x));
      cam.z = Math.min(b.maxZ - 0.3, Math.max(b.minZ + 0.3, cam.z));
      cam.y = Math.min(b.height - 0.3, Math.max(0.3, cam.y));
      this.camera.position.copy(cam);
      this.camera.lookAt(eye.x + f.x * 20 + r.x * 0.6, eye.y + f.y * 20 + 0.3, eye.z + f.z * 20 + r.z * 0.6);
    } else {
      const shake = me.life === 'tripped' ? 0.4 : 0;
      this.camera.position.set(eye.x, me.life === 'tripped' ? pos.y + 0.4 : eye.y, eye.z);
      this.camera.rotation.set(look.pitch, look.yaw - Math.PI / 2, shake, 'YXZ');
    }
  }
}
