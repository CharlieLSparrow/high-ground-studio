import * as THREE from "three";
export interface IScene {
    scene: THREE.Scene;
    camera: THREE.Camera;
    update(dt: number, t: number): void;
    dispose(): void;
    onResize?(w: number, h: number): void;
}
export declare class Engine {
    private mountEl;
    readonly renderer: THREE.WebGLRenderer;
    readonly clock: THREE.Clock;
    private _scene;
    private _raf;
    width: number;
    height: number;
    constructor(mountEl: HTMLElement);
    setScene(scene: IScene): void;
    start(): void;
    stop(): void;
    resize: () => void;
    destroy(): void;
}
