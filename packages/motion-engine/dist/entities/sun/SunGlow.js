import * as THREE from "three";
export function createSunGlow(params = {}) {
    const geo = new THREE.CircleGeometry(params.radius ?? 6, 64);
    const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(params.color ?? "#ffd9a6"),
        transparent: true,
        opacity: params.opacity ?? 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(params.position ?? new THREE.Vector3(0, 7, -30));
    return {
        object: mesh,
        material: mat,
        dispose: () => {
            geo.dispose();
            mat.dispose();
        },
    };
}
