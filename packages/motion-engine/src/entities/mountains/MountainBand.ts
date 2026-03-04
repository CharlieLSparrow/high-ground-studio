import * as THREE from "three";
import type { Entity } from "../types";

export type MountainBandParams = {
  z: number;
  y: number;
  color: string;
  scale: number;
  opacity: number;
};

export function createMountainBand(opts: MountainBandParams): Entity {
  const shape = new THREE.Shape();
  const width = 90;
  const height = 22;

  shape.moveTo(-width / 2, -height / 2);

  const points: Array<[number, number]> = [
    [-40, -2],
    [-30, 3],
    [-18, 1],
    [-8, 6],
    [4, 2],
    [18, 7],
    [32, 3],
    [45, 5],
  ];

  points.forEach(([x, y]) => shape.lineTo(x, y));

  shape.lineTo(width / 2, -height / 2);
  shape.lineTo(-width / 2, -height / 2);

  const geo = new THREE.ShapeGeometry(shape);
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(opts.color),
    transparent: true,
    opacity: opts.opacity,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(0, opts.y, opts.z);
  mesh.scale.set(opts.scale, opts.scale, 1);

  return {
    object: mesh,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}
