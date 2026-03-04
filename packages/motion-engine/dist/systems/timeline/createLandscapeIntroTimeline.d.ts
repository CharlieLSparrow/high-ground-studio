import * as THREE from "three";
export type TimelineDeps = {
    camera: THREE.PerspectiveCamera;
    sunMaterial: THREE.MeshBasicMaterial;
    hazeObject: THREE.Object3D;
    titleMaterial: THREE.MeshBasicMaterial;
    titleObject: THREE.Object3D;
};
export declare function createLandscapeIntroTimeline(deps: TimelineDeps): gsap.core.Timeline;
