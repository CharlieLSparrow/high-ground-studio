import * as THREE from "three";
export function createIntroCamera(aspect) {
    const camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 200);
    camera.position.set(0, 2.0, 18);
    camera.lookAt(0, 1.2, 0);
    return camera;
}
export function frameIntroCamera(camera, width, height) {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
}
