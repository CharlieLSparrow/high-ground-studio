import * as THREE from "three";
export function createHazeVeil(params = {}) {
    const geo = new THREE.PlaneGeometry(params.width ?? 90, params.height ?? 55);
    const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(params.color ?? "#ffd6a8"),
        transparent: true,
        opacity: params.opacity ?? 0.10,
        depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(params.position ?? new THREE.Vector3(0, 6, -12));
    return {
        object: mesh,
        material: mat,
        dispose: () => {
            geo.dispose();
            mat.dispose();
        },
    };
}
