/**
 * Draws a GameState: characters (posed or ragdolled), balls, camera. Holds no
 * game rules; everything it shows comes from the referee's state and events.
 */
import * as THREE from 'three';
import { eyePos } from '../sim/game';
import { lerp, rightDir, viewDir } from '../sim/math';
import { BALLS } from '../sim/tuning';
import type { Ball, GameState, Player, SimEvent } from '../sim/types';
import { createCharacter, createFpArms, pose, poseFpArms, setOutline, type Character, type FpArms } from './character';
import type { Ragdoll, RagdollWorld } from './ragdoll';
import { buildGym, createRenderer, type Quality } from './scene';

// Balls keep their colour whatever their state; live (thrown) balls also glow in that colour (§4.4).
const BALL_COLORS = { standard: 0xd62828, speed: 0xff7b00, heavy: 0x1d4ed8 } as const;
const TEAMMATE = 0x3a86ff;
const TRAIL_LEN = 10;
const KILL_CAM_SECONDS = 3;
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
  private glows: THREE.Mesh[] = [];
  private fpArms: FpArms;
  private fpPhase = 0;
  private target: THREE.Group;
  private ragdollWorld: RagdollWorld;
  thirdPerson = true;
  /** Kill camera (§4.9): seconds left, and the view direction at the moment you were knocked out. */
  private killCamT = 0;
  private killCamYaw = 0;
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
      const color = BALL_COLORS[b.type];
      const m = new THREE.Mesh(new THREE.SphereGeometry(def.radius, 24, 16), new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0 }));
      m.castShadow = true;
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(def.radius * 1.45, 24, 16),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      m.add(glow);
      this.glows.push(glow);
      this.scene.add(m);
      this.ballMeshes.push(m);
      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_LEN * 3), 3));
      const line = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: BALL_COLORS[b.type], transparent: true, opacity: 0.5 }));
      line.frustumCulled = false;
      this.scene.add(line);
      this.trails.push({ line, pts: [] });
    }
    // First-person forearms and hands, in the local player's own skin and jersey colours.
    this.fpArms = createFpArms(this.chars[local]!.colors);
    this.camera.add(this.fpArms.root);
    this.scene.add(this.camera);
    this.target = createTarget();
    this.scene.add(this.target);
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
        if (e.t === 'ko' && e.player === this.local) { this.killCamT = KILL_CAM_SECONDS; this.killCamYaw = p.yaw; }
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
    this.killCamT = local.life === 'out' ? Math.max(0, this.killCamT - dt) : 0;
    this.placeCamera(state, local, prev.players[local.id]!, alpha, look);
    this.drawFpArms(state, local, dt);
    this.target.visible = !!state.target;
    if (state.target) {
      this.target.position.set(state.target.pos.x, state.target.pos.y, state.target.pos.z);
      this.target.scale.setScalar(1 + 0.06 * Math.sin(state.time * 6));
    }
    this.renderer.render(this.scene, this.camera);
  }

  private drawPlayer(state: GameState, p: Player, prev: { x: number; y: number; z: number }, alpha: number, dt: number, look: { yaw: number; pitch: number }): void {
    const c = this.chars[p.id]!;
    const ragdolled = this.ragdolls.has(p.id);
    const firstPersonSelf = p.id === this.local && !this.thirdPerson && p.life !== 'out';
    // Keep the throw animation clock running even when the body is hidden (first person).
    if (firstPersonSelf) c.throwAnim = Math.max(0, c.throwAnim - dt);
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
    if (holder && !fpHeld && holder.action.kind !== 'block') {
      // Sit the ball against the palm of the character's right hand.
      const c = this.chars[holder.id]!;
      c.root.updateMatrixWorld(true);
      m.position.copy(c.meshes.handR.localToWorld(new THREE.Vector3(0, -0.04, -(BALLS[b.type].radius + 0.02))));
    } else {
      // Loose balls, and the shield in block stance, sit where the referee says.
      m.position.set(lerp(prev.x, b.pos.x, alpha), lerp(prev.y, b.pos.y, alpha), lerp(prev.z, b.pos.z, alpha));
    }
    const live = b.state === 'live';
    this.glows[b.id]!.visible = live;
    (m.material as THREE.MeshLambertMaterial).emissiveIntensity = live ? 0.6 : 0;
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
  }

  private drawFpArms(state: GameState, me: Player, dt: number): void {
    const show = !this.thirdPerson && me.life === 'active';
    this.fpArms.root.visible = show;
    if (!show) return;
    const ball = me.held >= 0 ? state.balls[me.held]! : undefined;
    const a = me.action;
    const c = this.chars[me.id]!;
    const speed = Math.hypot(me.vel.x, me.vel.z);
    this.fpPhase += speed * dt * 2.4;
    const fp = a.kind === 'catch' ? 'catch' : a.kind === 'block' ? 'block' : a.kind === 'aim' ? 'aim'
      : c.throwAnim > 0 ? 'throw' : ball ? 'carry' : 'idle';
    poseFpArms(this.fpArms, {
      pose: fp,
      aim: a.kind === 'aim' && ball ? Math.min(1, a.t / BALLS[ball.type].windup) : 0,
      ballRadius: ball ? BALLS[ball.type].radius : 0.15,
      ballColor: ball ? BALL_COLORS[ball.type] : 0xffffff,
      showBall: !!ball,
      bob: Math.sin(this.fpPhase) * 0.012 * Math.min(1, speed / 4.5),
      dt,
    });
  }

  private placeCamera(state: GameState, me: Player, prev: { x: number; y: number; z: number }, alpha: number, look: { yaw: number; pitch: number }): void {
    if (me.life === 'out' && this.killCamT > 0) {
      // Kill camera: third person, locked on your own flying ragdoll, whatever view you were in.
      const target = this.chars[me.id]!.meshes.pelvis.getWorldPosition(new THREE.Vector3());
      const f = viewDir(this.killCamYaw, 0);
      const b = state.arena.bounds;
      const want = new THREE.Vector3(
        Math.min(b.maxX - 0.3, Math.max(b.minX + 0.3, target.x - f.x * 3.5)),
        Math.min(b.height - 0.3, target.y + 1.6),
        Math.min(b.maxZ - 0.3, Math.max(b.minZ + 0.3, target.z - f.z * 3.5)),
      );
      this.camera.position.lerp(want, 0.2);
      this.camera.lookAt(target);
      return;
    }
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

/** The slow-motion target (§4.7): a glowing bullseye facing both teams. */
function createTarget(): THREE.Group {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const rings = ['#ffdd33', '#e63946', '#ffffff', '#e63946', '#ffdd33'];
  rings.forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(128, 128, 128 - i * 24, 0, Math.PI * 2);
    g.fill();
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const disc = new THREE.Mesh(new THREE.CircleGeometry(0.5, 40), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  disc.rotation.y = Math.PI / 2; // faces ±x: both teams
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.56, 0.05, 10, 40),
    new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }),
  );
  ring.rotation.y = Math.PI / 2;
  const group = new THREE.Group();
  group.add(disc, ring);
  group.visible = false;
  return group;
}
