import * as THREE from "three";
export interface IntroTimelineTargets {
    camera: THREE.PerspectiveCamera;
    sun: THREE.Mesh<THREE.CircleGeometry, THREE.MeshBasicMaterial>;
    haze: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
    titleMesh?: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
}
export declare function createIntroTimeline(targets: IntroTimelineTargets): gsap.core.Timeline;
