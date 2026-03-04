import * as THREE from "three";
import { createHighGroundSky, createSunGlow, createHazeVeil, createMountainBand, createForestWash, createTitleMesh, } from "../entities";
import { createLandscapeIntroTimeline } from "../systems/timeline/createLandscapeIntroTimeline";
export class LandscapeIntroScene {
    engine;
    scene = new THREE.Scene();
    camera;
    group = new THREE.Group();
    entities = [];
    timeline;
    constructor(engine) {
        this.engine = engine;
        this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
        this.camera.position.set(0, 2.0, 18);
        this.camera.lookAt(0, 1.2, 0);
        this.scene.add(this.group);
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        // Entities
        const sky = createHighGroundSky();
        const sun = createSunGlow();
        const haze = createHazeVeil();
        const forest = createForestWash();
        const m1 = createMountainBand({ z: -28, y: 1.5, color: "#2e6f6a", scale: 1.1, opacity: 0.55 });
        const m2 = createMountainBand({ z: -22, y: 0.8, color: "#2f6b4a", scale: 1.25, opacity: 0.70 });
        const m3 = createMountainBand({ z: -16, y: 0.2, color: "#305a38", scale: 1.45, opacity: 0.85 });
        const title = createTitleMesh("HIGH GROUND ODYSSEY");
        title.object.position.set(0, 3.8, -8);
        // Add to group
        [sky, sun, m1, m2, m3, forest, haze, title].forEach((e) => {
            this.group.add(e.object);
            this.entities.push(e);
        });
        // Timeline system
        this.timeline = createLandscapeIntroTimeline({
            camera: this.camera,
            sunMaterial: sun.material,
            hazeObject: haze.object,
            titleMaterial: title.material,
            titleObject: title.object,
        });
        this.onResize(this.engine.width, this.engine.height);
    }
    onResize(w, h) {
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }
    update(dt, t) {
        // Deterministic timeline drive
        const duration = 30;
        this.timeline.time(t % duration);
        // Entity updates
        for (const e of this.entities)
            e.update?.(t, dt);
        // Tiny painterly sway
        this.group.position.x = Math.sin(t * 0.05) * 0.05;
    }
    dispose() {
        this.timeline.kill();
        for (const e of this.entities)
            e.dispose?.();
        this.entities = [];
        // Safety: dispose any remaining meshes
        this.scene.traverse((obj) => {
            const mesh = obj;
            mesh.geometry?.dispose?.();
            const mat = mesh.material;
            if (mat)
                Array.isArray(mat) ? mat.forEach((m) => m.dispose?.()) : mat.dispose?.();
        });
    }
}
