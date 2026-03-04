import gsap from "gsap";
export function createIntroTimeline(targets) {
    const timeline = gsap.timeline({ defaults: { ease: "power2.inOut" } });
    timeline.to(targets.camera.position, { z: 14.5, duration: 30 }, 0);
    timeline.to(targets.camera.position, { x: 0.35, duration: 30 }, 0);
    timeline.to(targets.sun.material, { opacity: 0.95, duration: 6 }, 0);
    timeline.to(targets.sun.material, { opacity: 0.8, duration: 6 }, 6);
    timeline.to(targets.haze.position, { x: 1.2, duration: 30 }, 0);
    if (targets.titleMesh) {
        targets.titleMesh.material.transparent = true;
        targets.titleMesh.material.opacity = 0;
        timeline.to(targets.titleMesh.material, { opacity: 1, duration: 2.6, ease: "power2.out" }, 4);
        timeline.fromTo(targets.titleMesh.position, { y: 4.4 }, { y: 4.0, duration: 2.2, ease: "power2.out" }, 4);
        timeline.to(targets.titleMesh.position, { y: 3.85, duration: 0.8, ease: "back.out(2)" }, 6.1);
        timeline.to(targets.titleMesh.position, { y: 3.92, duration: 3.0, ease: "sine.inOut", repeat: -1, yoyo: true }, 7);
    }
    timeline.pause(0);
    return timeline;
}
