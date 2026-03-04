import * as THREE from "three";
import type { Engine, IScene } from "../core/Engine";
export declare class LandscapeIntroScene implements IScene {
    private engine;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    private group;
    private entities;
    private timeline;
    constructor(engine: Engine);
    onResize(w: number, h: number): void;
    update(dt: number, t: number): void;
    dispose(): void;
}
