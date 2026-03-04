import gsap from "gsap";
import * as THREE from "three";

export type TimelineDeps = {
  camera: THREE.PerspectiveCamera;
  sunMaterial: THREE.MeshBasicMaterial;
  hazeObject: THREE.Object3D;
  titleMaterial: THREE.MeshBasicMaterial;
  titleObject: THREE.Object3D;
};

export function createLandscapeIntroTimeline(deps: TimelineDeps) {
  const tl = gsap.timeline({ defaults: { ease: "power2.inOut" } });

  // Camera push + slight pan (30s)
  tl.to(deps.camera.position, { z: 14.5, duration: 30 }, 0);
  tl.to(deps.camera.position, { x: 0.35, duration: 30 }, 0);

  // Sun breath
  tl.to(deps.sunMaterial, { opacity: 0.95, duration: 6 }, 0);
  tl.to(deps.sunMaterial, { opacity: 0.80, duration: 6 }, 6);

  // Haze drift
  tl.to(deps.hazeObject.position, { x: 1.2, duration: 30 }, 0);

  // Title storybook reveal (keep in-frame)
  deps.titleMaterial.opacity = 0;

  tl.to(deps.titleMaterial, { opacity: 1, duration: 2.6, ease: "power2.out" }, 4);

  tl.fromTo(
    deps.titleObject.position,
    { y: 4.4 },
    { y: 4.0, duration: 2.2, ease: "power2.out" },
    4
  );

  tl.to(deps.titleObject.position, { y: 3.85, duration: 0.8, ease: "back.out(2)" }, 6.1);

  tl.to(
    deps.titleObject.position,
    { y: 3.92, duration: 3.0, ease: "sine.inOut", repeat: -1, yoyo: true },
    7.0
  );

  tl.pause(0);
  return tl;
}
