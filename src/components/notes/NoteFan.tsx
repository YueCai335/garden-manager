"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "./NoteFlow.module.css";

/**
 * The note's split (ADR-0085): lime branches from one point under the note to each garden card,
 * as on the landing page's AI Note card. The paths follow the cards' real positions and are
 * measured again when the layout changes.
 */
export function NoteFan({ items, highlighted, mode, onLayout }: {
  items: { key: string; node: ReactNode }[];
  /** Keys whose branch is drawn thicker; when any are set, the others fade. */
  highlighted: Set<string>;
  /** "grow" draws the branches once; "flow" keeps them moving while the note is read. */
  mode: "grow" | "flow";
  /** Called after each measurement, so the strip behind can end halfway down the cards. */
  onLayout?: () => void;
}) {
  const split = useRef<HTMLDivElement>(null);
  const row = useRef<HTMLDivElement>(null);
  const [geometry, setGeometry] = useState<{ width: number; height: number; xs: number[] }>();
  const keys = items.map((item) => item.key).join("|");

  useLayoutEffect(() => {
    const measure = () => {
      const box = split.current?.getBoundingClientRect();
      if (!box || !row.current) return;
      const xs = [...row.current.children].map((child) => {
        const rect = child.getBoundingClientRect();
        return rect.left + rect.width / 2 - box.left;
      });
      setGeometry({ width: box.width, height: box.height, xs });
      onLayout?.();
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    if (split.current) observer?.observe(split.current);
    if (row.current) observer?.observe(row.current);
    return () => observer?.disconnect();
  }, [keys, onLayout]);

  const root = geometry ? geometry.width / 2 : 0;
  return <>
    <div ref={split} className={styles.split} data-mode={mode} aria-hidden="true">
      {geometry && <svg viewBox={`0 0 ${geometry.width} ${geometry.height}`} width={geometry.width} height={geometry.height}>
        {geometry.xs.map((x, index) => {
          const key = items[index]?.key;
          const state = highlighted.size ? (key && highlighted.has(key) ? "on" : "off") : undefined;
          return <path key={key ?? index} data-state={state}
            d={`M${root} 2 C${root} ${geometry.height * 0.55} ${x} ${geometry.height * 0.35} ${x} ${geometry.height - 1}`} />;
        })}
        <circle cx={root} cy={3} r={3.2} />
        {geometry.xs.map((x, index) => <circle key={index} className={styles.end} cx={x} cy={geometry.height - 1} r={3.4} />)}
      </svg>}
    </div>
    <div ref={row} className={styles.fanRow} style={{ ["--fan-count" as string]: items.length }}>
      {items.map((item) => <div key={item.key} className={styles.fanItem}>{item.node}</div>)}
    </div>
  </>;
}
