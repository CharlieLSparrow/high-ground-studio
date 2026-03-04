import * as THREE from "three";
import type { Entity } from "../types";

export type TitleParams = {
  width?: number;
  height?: number;
  font?: string;
};

export function createTitleMesh(text: string, params: TitleParams = {}): Entity & { material: THREE.MeshBasicMaterial } {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 512;

  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = params.font ?? "bold 180px serif";

  // glow pass
  ctx.fillStyle = "rgba(255, 240, 210, 0.35)";
  ctx.shadowColor = "rgba(255, 220, 160, 0.9)";
  ctx.shadowBlur = 28;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  // crisp pass
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    depthTest: false,
    depthWrite: false,
  });

  const geo = new THREE.PlaneGeometry(params.width ?? 10, params.height ?? 2.5);
  const mesh = new THREE.Mesh(geo, material);
  mesh.renderOrder = 10;

  return {
    object: mesh,
    material,
    dispose: () => {
      geo.dispose();
      material.dispose();
      texture.dispose();
    },
  };
}
