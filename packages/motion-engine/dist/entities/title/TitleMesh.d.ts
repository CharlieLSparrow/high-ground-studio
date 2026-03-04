import * as THREE from "three";
import type { Entity } from "../types";
export type TitleParams = {
    width?: number;
    height?: number;
    font?: string;
};
export declare function createTitleMesh(text: string, params?: TitleParams): Entity & {
    material: THREE.MeshBasicMaterial;
};
