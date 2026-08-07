"use client";

import { Pause, Play, RotateCcw } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactEventHandler,
} from "react";
import * as THREE from "three";

export type SpatialView = {
  panDegrees: number;
  tiltDegrees: number;
  fieldOfViewDegrees: number;
};

function clock(value: number) {
  if (!Number.isFinite(value)) return "00:00.00";
  const minutes = Math.floor(Math.max(0, value) / 60);
  const seconds = Math.max(0, value) % 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(2).padStart(5, "0")}`;
}

export const EquirectangularVideoViewer = forwardRef<HTMLVideoElement, {
  src: string;
  title: string;
  initialView?: SpatialView;
  onViewChange?: (view: SpatialView) => void;
  onTimeUpdate?: ReactEventHandler<HTMLVideoElement>;
  onEnded?: ReactEventHandler<HTMLVideoElement>;
}>(function EquirectangularVideoViewer({
  src,
  title,
  initialView = { panDegrees: 0, tiltDegrees: 0, fieldOfViewDegrees: 75 },
  onViewChange,
  onTimeUpdate,
  onEnded,
}, forwardedRef) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewRef = useRef<SpatialView>(initialView);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const pointerRef = useRef<{ id: number; x: number; y: number; pan: number; tilt: number } | null>(null);
  const [view, setView] = useState(initialView);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  useImperativeHandle(forwardedRef, () => videoRef.current!, []);

  function commitView(next: SpatialView) {
    const normalized = {
      panDegrees: ((next.panDegrees + 180) % 360 + 360) % 360 - 180,
      tiltDegrees: Math.max(-85, Math.min(85, next.tiltDegrees)),
      fieldOfViewDegrees: Math.max(25, Math.min(110, next.fieldOfViewDegrees)),
    };
    viewRef.current = normalized;
    setView(normalized);
    const camera = cameraRef.current;
    if (camera) {
      camera.fov = normalized.fieldOfViewDegrees;
      camera.updateProjectionMatrix();
      const phi = THREE.MathUtils.degToRad(90 - normalized.tiltDegrees);
      const theta = THREE.MathUtils.degToRad(normalized.panDegrees);
      camera.lookAt(new THREE.Vector3(
        Math.sin(phi) * Math.sin(theta),
        Math.cos(phi),
        Math.sin(phi) * Math.cos(theta),
      ));
    }
    onViewChange?.(normalized);
  }

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!host || !canvas || !video) return;
    if (!window.WebGLRenderingContext) {
      setViewerError("This browser cannot open the interactive 360° view. The exact source remains attached.");
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    } catch {
      setViewerError("WebGL could not start. The exact source remains attached and can still be handed to the local editor.");
      return;
    }
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    rendererRef.current = renderer;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(viewRef.current.fieldOfViewDegrees, 16 / 9, 0.1, 200);
    camera.position.set(0, 0, 0.01);
    cameraRef.current = camera;
    const geometry = new THREE.SphereGeometry(50, 64, 40);
    geometry.scale(-1, 1, 1);
    const texture = new THREE.VideoTexture(video);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    // The negative X scale turns the sphere inside-out. Rendering BackSide as
    // well would invert the winding twice and can leave an inside camera with
    // no visible surface on stricter WebGL implementations.
    const material = new THREE.MeshBasicMaterial({ map: texture });
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);
    commitView(viewRef.current);

    const resize = () => {
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let frame = 0;
    const render = () => {
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    render();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      texture.dispose();
      material.dispose();
      geometry.dispose();
      renderer.dispose();
      rendererRef.current = null;
      cameraRef.current = null;
    };
  }, [src]);

  function togglePlayback() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  }

  function onPointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerRef.current = { id: event.pointerId, x: event.clientX, y: event.clientY, pan: viewRef.current.panDegrees, tilt: viewRef.current.tiltDegrees };
  }

  function onPointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    commitView({
      ...viewRef.current,
      panDegrees: pointer.pan - (event.clientX - pointer.x) * 0.15,
      tiltDegrees: pointer.tilt + (event.clientY - pointer.y) * 0.15,
    });
  }

  return (
    <div className="w-full bg-black text-white">
      <video
        ref={videoRef}
        src={src}
        playsInline
        preload="metadata"
        className="sr-only"
        onLoadedMetadata={(event) => { setDuration(event.currentTarget.duration || 0); setCurrentTime(event.currentTarget.currentTime); }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onTimeUpdate={(event) => { setCurrentTime(event.currentTarget.currentTime); onTimeUpdate?.(event); }}
        onEnded={(event) => { setPlaying(false); onEnded?.(event); }}
      />
      {viewerError ? <div role="status" className="grid min-h-[360px] place-items-center px-6 text-center font-semibold text-zinc-300">{viewerError}</div> : (
        <div ref={hostRef} className="relative h-[360px] w-full md:h-[500px]">
          <canvas
            ref={canvasRef}
            tabIndex={0}
            aria-label={`Interactive 360 degree view of ${title}. Drag to look around, use arrow keys to turn, and use plus or minus to zoom.`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(event) => { if (pointerRef.current?.id === event.pointerId) pointerRef.current = null; }}
            onPointerCancel={() => { pointerRef.current = null; }}
            onWheel={(event) => { event.preventDefault(); commitView({ ...viewRef.current, fieldOfViewDegrees: viewRef.current.fieldOfViewDegrees + Math.sign(event.deltaY) * 4 }); }}
            onKeyDown={(event) => {
              const delta = event.shiftKey ? 10 : 3;
              if (event.key === "ArrowLeft") commitView({ ...viewRef.current, panDegrees: viewRef.current.panDegrees - delta });
              else if (event.key === "ArrowRight") commitView({ ...viewRef.current, panDegrees: viewRef.current.panDegrees + delta });
              else if (event.key === "ArrowUp") commitView({ ...viewRef.current, tiltDegrees: viewRef.current.tiltDegrees + delta });
              else if (event.key === "ArrowDown") commitView({ ...viewRef.current, tiltDegrees: viewRef.current.tiltDegrees - delta });
              else if (event.key === "+" || event.key === "=") commitView({ ...viewRef.current, fieldOfViewDegrees: viewRef.current.fieldOfViewDegrees - 4 });
              else if (event.key === "-") commitView({ ...viewRef.current, fieldOfViewDegrees: viewRef.current.fieldOfViewDegrees + 4 });
              else return;
              event.preventDefault();
            }}
            className="h-full w-full cursor-grab touch-none outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-sky-400 active:cursor-grabbing"
          />
          <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/20 bg-black/55 px-3 py-2 text-[10px] font-black uppercase tracking-wide backdrop-blur">
            Drag to look · wheel to zoom
          </div>
        </div>
      )}
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-t border-white/10 px-3 py-3">
        <button type="button" onClick={togglePlayback} className="grid min-h-11 min-w-11 place-items-center rounded-full bg-white text-black" aria-label={playing ? "Pause 360 video" : "Play 360 video"}>{playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}</button>
        <label className="grid gap-1"><span className="sr-only">Source position</span><input type="range" min="0" max={Math.max(duration, 0.001)} step="0.001" value={Math.min(currentTime, Math.max(duration, 0.001))} onChange={(event) => { const next = Number(event.target.value); if (videoRef.current) videoRef.current.currentTime = next; setCurrentTime(next); }} className="w-full accent-sky-400" /><span className="font-mono text-[10px] font-bold text-zinc-300">{clock(currentTime)} / {clock(duration)}</span></label>
        <button type="button" onClick={() => commitView(initialView)} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/20 px-3 text-[10px] font-black uppercase tracking-wide"><RotateCcw size={14} aria-hidden="true" />Reset view</button>
      </div>
      <p className="sr-only" aria-live="polite">View pan {view.panDegrees.toFixed(0)} degrees, tilt {view.tiltDegrees.toFixed(0)} degrees, field of view {view.fieldOfViewDegrees.toFixed(0)} degrees.</p>
    </div>
  );
});
