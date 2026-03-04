import * as THREE from "three";
import { noise1d } from "../../systems/math/noise";

export function createCloudLayer(color: string): THREE.Group {
  const group = new THREE.Group();

  for (let i = 0; i < 6; i += 1) {
    const radius = 1.8 + noise1d(i) * 1.4;
    const geometry = new THREE.CircleGeometry(radius, 32);
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
    });

    const puff = new THREE.Mesh(geometry, material);
    puff.position.set(-18 + i * 7, 10 + noise1d(i * 3.7) * 1.8, -24 - i * 0.3);
    group.add(puff);
  }

  return group;
}
