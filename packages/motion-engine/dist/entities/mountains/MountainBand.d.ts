import type { Entity } from "../types";
export type MountainBandParams = {
    z: number;
    y: number;
    color: string;
    scale: number;
    opacity: number;
};
export declare function createMountainBand(opts: MountainBandParams): Entity;
