import * as THREE from "three";
import type { Entity } from "../types";
export type SkyParams = {
    width?: number;
    height?: number;
    position?: THREE.Vector3;
    top?: string;
    bottom?: string;
    sunUv?: {
        x: number;
        y: number;
    };
    sunColor?: string;
    haze?: number;
    noise?: number;
};
export declare function createHighGroundSky(params?: SkyParams): Entity & {
    material: THREE.ShaderMaterial;
};
