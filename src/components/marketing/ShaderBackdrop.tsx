"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import {
  type TexturePreset,
  canvasPixelRatio,
  createPhotoGrade,
  fragmentShaderSource,
  idleLight,
  luminanceRange,
  nodeOpacity,
  pickVeinNodes,
  placeVeinNodes,
  sampleLuminance,
  textureScale,
  vertexShaderSource,
} from "./landingShader";
import styles from "./ShaderBackdrop.module.css";

type RenderMode = "loading" | "webgl" | "still";

type ShaderBackdropProps = {
  preset: TexturePreset;
  /** The grayscale photo the shader grades. */
  texture: string;
  /** A pre-rendered still of the same grade, for no WebGL2 and for reduced motion. */
  still: string;
  /** Draw lime circuit nodes on the strongest vein points (footer). */
  veinNodes?: boolean;
  /** Wait until the band is near the viewport before loading the photo. */
  lazy?: boolean;
};

function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The textured background of a landing band (ADR-0073, phase S6). It fills its
 * positioned parent. The photo loads after the page text, the light follows the
 * pointer over the band, and the animation pauses while the band is off screen.
 */
export function ShaderBackdrop({ preset, texture, still, veinNodes = false, lazy = false }: ShaderBackdropProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<SVGSVGElement>(null);
  const [mode, setMode] = useState<RenderMode>("loading");
  const [nodes, setNodes] = useState<{ points: Array<[number, number]>; width: number; height: number }>({ points: [], width: 0, height: 0 });

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!root || !canvas) return;
    if (prefersReducedMotion() || typeof WebGL2RenderingContext === "undefined") { setMode("still"); return; }
    const gl = canvas.getContext("webgl2", { antialias: false, premultipliedAlpha: false });
    if (!gl) { setMode("still"); return; }

    let disposed = false;
    let shown = false;
    let frame = 0;
    let visible = true;
    let pointer: [number, number] | null = null;
    let light: [number, number] | null = null;
    let size = { width: 0, height: 0 };
    let veinPoints: Array<{ u: number; v: number }> = [];
    let placed: Array<[number, number]> = [];
    let grade: ReturnType<typeof createPhotoGrade> = null;
    let photo: HTMLImageElement | null = null;
    const startedAt = performance.now();

    const placeNodes = () => {
      if (!veinNodes || !photo || size.width === 0) return;
      placed = placeVeinNodes(veinPoints, preset.angle, size, photo);
      setNodes({ points: placed, width: size.width, height: size.height });
    };
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = canvasPixelRatio(window.devicePixelRatio);
      size = { width: rect.width, height: rect.height };
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      placeNodes();
      request();
    };
    const draw = () => {
      frame = 0;
      if (disposed || !grade || !visible) return;
      const seconds = (performance.now() - startedAt) / 1000;
      const target = pointer ?? idleLight(seconds, size.width, size.height);
      // Ease toward the target so the light glides between the pointer and the idle orbit.
      light = light ? [light[0] + (target[0] - light[0]) * 0.12, light[1] + (target[1] - light[1]) * 0.12] : target;
      const scale = canvas.width / Math.max(1, size.width);
      grade.draw([light[0] * scale, light[1] * scale], seconds % 1000);
      const circles = nodesRef.current?.children;
      if (circles) for (let i = 0; i < circles.length && i < placed.length; i += 1) (circles[i] as SVGElement).style.opacity = nodeOpacity(placed[i], light, size.height).toFixed(2);
      if (!shown) { shown = true; setMode("webgl"); }
      request();
    };
    function request() { if (!frame && visible && grade && !disposed) frame = requestAnimationFrame(draw); }

    const onPointerMove = (event: PointerEvent) => {
      const rect = root.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      pointer = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height ? [x, y] : null;
    };
    const onPointerLeave = () => { pointer = null; };
    const onContextLost = (event: Event) => { event.preventDefault(); disposed = true; setMode("still"); };

    const load = () => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => {
        if (disposed) return;
        const sample = sampleLuminance(image);
        if (!sample) { setMode("still"); return; }
        const { low, high } = luminanceRange(sample.luminance);
        grade = createPhotoGrade(gl, { vertex: vertexShaderSource, fragment: fragmentShaderSource }, image, { preset, low, high, ...textureScale(preset, image.width) });
        if (!grade) { setMode("still"); return; }
        photo = image;
        if (veinNodes) veinPoints = pickVeinNodes(sample);
        resize();
      };
      image.onerror = () => { if (!disposed) setMode("still"); };
      image.src = texture;
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    let loadObserver: IntersectionObserver | null = null;
    const visibilityObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; request(); });
    visibilityObserver.observe(root);
    if (lazy) {
      loadObserver = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        loadObserver?.disconnect();
        load();
      }, { rootMargin: "300px 0px" });
      loadObserver.observe(root);
    } else {
      load();
    }
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      loadObserver?.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      grade?.dispose();
    };
  }, [preset, texture, veinNodes, lazy]);

  return <div ref={rootRef} className={styles.root} data-render={mode} aria-hidden="true" style={{ "--still": `url("${still}")` } as CSSProperties}>
    <div className={styles.still} />
    <canvas ref={canvasRef} className={styles.canvas} />
    <div className={styles.tint} />
    {veinNodes && mode === "webgl" ? <svg ref={nodesRef} className={styles.nodes} viewBox={`0 0 ${nodes.width || 1} ${nodes.height || 1}`}>
      {nodes.points.map(([x, y], index) => <g key={index} style={{ opacity: 0.12 }}>
        <circle className={styles.ring} cx={x.toFixed(1)} cy={y.toFixed(1)} r="9" />
        <circle className={styles.dot} cx={x.toFixed(1)} cy={y.toFixed(1)} r="3.6" />
      </g>)}
    </svg> : null}
  </div>;
}
