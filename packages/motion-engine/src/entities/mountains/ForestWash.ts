import * as THREE from "three";
import type { Entity } from "../types";

export function createForestWash(): Entity {
  const geo = new THREE.PlaneGeometry(80, 30);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color("#2e4f2b"),
    transparent: true,
    opacity: 0.35,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, -2, -14);

  return {
    object: mesh,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}
