import * as THREE from "three";

export function createIntroCamera(aspect: number): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 200);
  camera.position.set(0, 2.0, 18);
  camera.lookAt(0, 1.2, 0);
  return camera;
}

export function frameIntroCamera(camera: THREE.PerspectiveCamera, width: number, height: number): void {
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
