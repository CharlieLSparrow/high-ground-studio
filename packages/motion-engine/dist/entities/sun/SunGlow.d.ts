import * as THREE from "three";
import type { Entity } from "../types";
export type SunParams = {
    radius?: number;
    color?: string;
    opacity?: number;
    position?: THREE.Vector3;
};
export declare function createSunGlow(params?: SunParams): Entity & {
    material: THREE.MeshBasicMaterial;
};
