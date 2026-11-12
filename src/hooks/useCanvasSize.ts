"use client";
import { useEffect, useRef, useState } from "react";

export function useCanvasSize() {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = ({ width, height }: { width: number; height: number }) => {
      const next = { width: Math.max(0, Math.floor(width)), height: Math.max(0, Math.floor(height)) };
      setSize((previous) => previous.width === next.width && previous.height === next.height ? previous : next);
    };
    update(element.getBoundingClientRect());
    const observer = new ResizeObserver(([entry]) => { if (entry) update(entry.contentRect); });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, ...size };
}
