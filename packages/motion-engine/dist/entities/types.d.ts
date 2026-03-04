import * as THREE from "three";
export type Entity = {
    object: THREE.Object3D;
    update?: (t: number, dt: number) => void;
    dispose?: () => void;
};
