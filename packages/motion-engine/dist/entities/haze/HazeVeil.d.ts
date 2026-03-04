import * as THREE from "three";
import type { Entity } from "../types";
export type HazeParams = {
    width?: number;
    height?: number;
    color?: string;
    opacity?: number;
    position?: THREE.Vector3;
};
export declare function createHazeVeil(params?: HazeParams): Entity & {
    material: THREE.MeshBasicMaterial;
};
