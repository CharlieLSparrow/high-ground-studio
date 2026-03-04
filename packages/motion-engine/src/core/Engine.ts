import * as THREE from "three";
import { createRenderer } from "../render/createRenderer";

export interface IScene {
  scene: THREE.Scene;
  camera: THREE.Camera;
  update(dt: number, t: number): void;
  dispose(): void;
  onResize?(w: number, h: number): void;
}

export class Engine {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly clock = new THREE.Clock();

  private _scene: IScene | null = null;
  private _raf: number | null = null;

  public width: number;
  public height: number;

  constructor(private mountEl: HTMLElement) {
    this.width = mountEl.clientWidth;
    this.height = mountEl.clientHeight;

    this.renderer = createRenderer();
    this.mountEl.appendChild(this.renderer.domElement);
    this.resize();

    window.addEventListener("resize", this.resize);
  }

  setScene(scene: IScene) {
    if (this._scene) this._scene.dispose();
    this._scene = scene;
    this.resize();
  }

  start() {
    const loop = () => {
      this._raf = requestAnimationFrame(loop);

      if (!this._scene) return;

      const dt = this.clock.getDelta();
      const t = this.clock.elapsedTime;

      this._scene.update(dt, t);
      this.renderer.render(this._scene.scene, this._scene.camera);
    };

    loop();
  }

  stop() {
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = null;
  }

  resize = () => {
    this.width = this.mountEl.clientWidth;
    this.height = this.mountEl.clientHeight;

    this.renderer.setSize(this.width, this.height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    if (this._scene?.onResize) this._scene.onResize(this.width, this.height);
  };

  destroy() {
    this.stop();
    window.removeEventListener("resize", this.resize);
    if (this._scene) this._scene.dispose();
    this.renderer.dispose();
  }
}
