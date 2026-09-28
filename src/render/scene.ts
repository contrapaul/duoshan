/** Greybox Classic Gym scene: floor with court lines, walls, bleachers, banner slots, lights. */
import * as THREE from 'three';
import type { ArenaDef } from '../sim/arena';

export type Quality = 'high' | 'low';

export function createRenderer(canvas: HTMLCanvasElement, quality: Quality): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: quality === 'high', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality === 'high' ? 2 : 1));
  renderer.shadowMap.enabled = quality === 'high';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  return renderer;
}

function courtTexture(arena: ArenaDef): THREE.CanvasTexture {
  const { minX, maxX, minZ, maxZ } = arena.bounds;
  const ppm = 40; // pixels per metre
  const c = document.createElement('canvas');
  c.width = (maxX - minX) * ppm;
  c.height = (maxZ - minZ) * ppm;
  const g = c.getContext('2d')!;
  // Wood planks.
  for (let y = 0; y < c.height; y += 12) {
    const shade = 180 + ((y * 37) % 23);
    g.fillStyle = `rgb(${shade + 20},${shade - 20},${shade - 70})`;
    g.fillRect(0, y, c.width, 12);
  }
  const X = (x: number) => (x - minX) * ppm;
  const Z = (z: number) => (z - minZ) * ppm;
  const { halfLength: L, halfWidth: W } = arena.court;
  g.fillStyle = 'rgba(40,90,170,0.25)';
  g.fillRect(X(-L), Z(-W), L * ppm, 2 * W * ppm);
  g.fillStyle = 'rgba(190,40,40,0.25)';
  g.fillRect(X(0), Z(-W), L * ppm, 2 * W * ppm);
  g.strokeStyle = '#ffffff';
  g.lineWidth = 5;
  g.strokeRect(X(-L), Z(-W), 2 * L * ppm, 2 * W * ppm);
  g.lineWidth = 3;
  for (const x of [-L / 3, L / 3]) {
    g.beginPath(); g.moveTo(X(x), Z(-W)); g.lineTo(X(x), Z(W)); g.stroke();
  }
  // The centerline.
  g.strokeStyle = '#ffdd33';
  g.lineWidth = 10;
  g.beginPath(); g.moveTo(X(0), Z(-W - 0.5)); g.lineTo(X(0), Z(W + 0.5)); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.font = `bold ${ppm * 1.4}px sans-serif`;
  g.textAlign = 'center';
  g.fillText('躲闪', X(0), Z(-W - 1.4));
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Banner slot art (PROJECT_PLAN.md §12): placeholder "sponsors" and a school message. */
function bannerTexture(lines: string[], bg: string, fg: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.textAlign = 'center';
  g.font = 'bold 84px sans-serif';
  g.fillText(lines[0]!, 512, lines.length > 1 ? 115 : 155);
  if (lines[1]) { g.font = '48px sans-serif'; g.fillText(lines[1], 512, 195); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function buildGym(scene: THREE.Scene, arena: ArenaDef, quality: Quality): void {
  const { minX, maxX, minZ, maxZ, height } = arena.bounds;
  scene.background = new THREE.Color(0x9fb6c8);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
    new THREE.MeshLambertMaterial({ map: courtTexture(arena) }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((minX + maxX) / 2, 0, (minZ + maxZ) / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxZ - minZ), new THREE.MeshLambertMaterial({ color: 0x55606b }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, height, 0);
  scene.add(ceiling);

  const colors: Record<string, number> = { wall: 0xd9d4c7, bleacher: 0x6b7a8f, stage: 0x8a5a3c, obstacle: 0x999999 };
  for (const b of arena.boxes) {
    const size = new THREE.Vector3(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshLambertMaterial({ color: colors[b.kind] }));
    mesh.position.set(b.min.x + size.x / 2, b.min.y + size.y / 2, b.min.z + size.z / 2);
    mesh.receiveShadow = b.kind !== 'wall';
    mesh.castShadow = b.kind === 'bleacher' || b.kind === 'stage';
    scene.add(mesh);
  }
  // Wall stripe + banner slots.
  const stripe = new THREE.MeshLambertMaterial({ color: 0x2a4d8f });
  for (const z of [minZ + 0.01, maxZ - 0.01]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, 0.6), stripe);
    s.position.set(0, 1.3, z);
    s.rotation.y = z < 0 ? 0 : Math.PI;
    scene.add(s);
  }
  const banners: [string[], string, string, number][] = [
    [['DuoShan Sports Drinks™', 'Hydrate or be eliminated'], '#1d3557', '#f1faee', -6],
    [['Test tomorrow?', 'Put the ball down. Study.'], '#e63946', '#ffffff', 0],
    [['Dress code applies', 'even to dodgeball legends'], '#2a9d8f', '#ffffff', 6],
  ];
  for (const [lines, bg, fg, x] of banners) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 1.25), new THREE.MeshBasicMaterial({ map: bannerTexture(lines, bg, fg) }));
    m.position.set(x, 4.2, minZ + 0.02);
    scene.add(m);
  }
  for (const x of [minX + 0.02, maxX - 0.02]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshBasicMaterial({ map: bannerTexture(['DUOSHAN 躲闪', 'Elite Dodgeball'], '#111111', '#ffdd33') }));
    m.position.set(x, 4.5, 0);
    m.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(m);
  }

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a6a4a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(-6, 14, 5);
  sun.castShadow = quality === 'high';
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = -15; cam.right = 15; cam.top = 10; cam.bottom = -10; cam.near = 1; cam.far = 40;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
}
