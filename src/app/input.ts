/** Keyboard + mouse (or trackpad) → PlayerInput. Pointer Lock for mouse look. */
import type { PlayerInput } from '../sim/types';

export class LocalInput {
  yaw = 0;
  pitch = 0;
  sensitivity = 0.0022;
  private keys = new Set<string>();
  private buttons = new Set<number>();
  onToggleView: () => void = () => {};
  onPauseChange: (paused: boolean) => void = () => {};

  constructor(private canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (!this.locked) return;
      if (e.code === 'KeyV' && !e.repeat) this.onToggleView();
      this.keys.add(e.code);
      if (e.code === 'Space' || e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      this.buttons.add(e.button);
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * this.sensitivity));
    });
    document.addEventListener('pointerlockchange', () => {
      if (!this.locked) { this.keys.clear(); this.buttons.clear(); }
      this.onPauseChange(!this.locked);
    });
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons.clear(); });
  }

  get locked(): boolean {
    return document.pointerLockElement === this.canvas;
  }

  lock(): void {
    void this.canvas.requestPointerLock();
  }

  sample(): PlayerInput {
    const k = (c: string) => this.keys.has(c);
    return {
      moveX: (k('KeyD') ? 1 : 0) - (k('KeyA') ? 1 : 0),
      moveZ: (k('KeyW') ? 1 : 0) - (k('KeyS') ? 1 : 0),
      yaw: this.yaw,
      pitch: this.pitch,
      sprint: k('ShiftLeft') || k('ShiftRight'),
      crouch: k('KeyC') || k('KeyQ'),
      jump: k('Space'),
      primary: this.buttons.has(0),
      secondary: this.buttons.has(2),
      use: k('KeyE'),
    };
  }
}
