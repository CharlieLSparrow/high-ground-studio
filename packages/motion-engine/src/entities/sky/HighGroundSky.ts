import * as THREE from "three";
import type { Entity } from "../types";
import { skyVertex, skyFragment } from "./skyShaders";

export type SkyParams = {
  width?: number;
  height?: number;
  position?: THREE.Vector3;
  top?: string;
  bottom?: string;
  sunUv?: { x: number; y: number };
  sunColor?: string;
  haze?: number;
  noise?: number;
};

export function createHighGroundSky(params: SkyParams = {}): Entity & { material: THREE.ShaderMaterial } {
  const geo = new THREE.PlaneGeometry(params.width ?? 80, params.height ?? 50, 1, 1);

  const mat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uTop: { value: new THREE.Color(params.top ?? "#2f6b66") },
      uBottom: { value: new THREE.Color(params.bottom ?? "#f2b35b") },
      uSun: { value: new THREE.Vector2(params.sunUv?.x ?? 0.62, params.sunUv?.y ?? 0.38) },
      uSunColor: { value: new THREE.Color(params.sunColor ?? "#ffd9a6") },
      uHaze: { value: params.haze ?? 0.35 },
      uNoise: { value: params.noise ?? 0.06 },
    },
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(params.position ?? new THREE.Vector3(0, 10, -40));

  return {
    object: mesh,
    material: mat,
    update: (t: number) => {
      mat.uniforms.uTime.value = t;
    },
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}
