import type { ReactNode } from "react";
import type { CareEventType } from "@/lib/gardenWorkspace";
import styles from "./CareShared.module.css";

/**
 * The small marks Care (ADR-0080) and the Gardens home (ADR-0081) both draw: the plus, the care
 * type icon, and the tick circle. `className` adds the page's own hook for placement rules.
 */

const classes = (...names: (string | undefined)[]) => names.filter(Boolean).join(" ");

export function PlusIcon({ size = 16, strokeWidth = 1.8 }: { size?: number; strokeWidth?: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>;
}

const svg = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

/** One shape per care type (ADR-0085), so the shape tells them apart, not only the colour. */
const careTypeShapes: Record<CareEventType, ReactNode> = {
  // A drop.
  watering: <path d="M12 3.5c3 3.6 5.5 6.3 5.5 9.6a5.5 5.5 0 0 1-11 0c0-3.3 2.5-6 5.5-9.6z" />,
  // A sprout.
  fertilizing: <><path d="M12 20v-8" /><path d="M12 12c0-3-2-5-6-5 0 3 2 5 6 5z" /><path d="M12 14.5c0-2.5 2-4.5 6-4.5 0 2.5-2 4.5-6 4.5z" /></>,
  // A trowel.
  planting: <><path d="M13.5 3.5l7 7-7 7a4.95 4.95 0 0 1-7-7z" /><path d="M3.5 20.5l4.2-4.2" /></>,
  // Scissors.
  pruning: <><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" /></>,
  // A bug.
  "pest-treatment": <><rect x="8" y="7" width="8" height="13" rx="4" /><path d="M12 7V4.5M9.5 4 8 2.5M14.5 4 16 2.5M8 11H4.5M8 15H4.5M16 11h3.5M16 15h3.5" /></>,
};

export function CareIcon({ type, className }: { type: CareEventType; className?: string }) {
  return <span className={classes(styles.careIcon, className)} data-type={type} aria-hidden="true">
    <svg {...svg}>{careTypeShapes[type]}</svg>
  </span>;
}

/**
 * The tick circle, inside a row that composes the shared `row` class. An open task or a tick from
 * this visit is a checkbox button; a record from elsewhere shows as done but is corrected in History.
 */
export function Tick({ rowKey, label, done, onToggle, doneLabel = `${label}, done`, className }: {
  rowKey: string;
  label: string;
  done: boolean;
  onToggle?: () => void;
  /** The name of a done record that cannot be unticked here. */
  doneLabel?: string;
  className?: string;
}) {
  const circle = <span className={styles.tickCircle} aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5.5" /></svg>
  </span>;
  return onToggle
    ? <button type="button" role="checkbox" aria-checked={done} aria-label={label} className={classes(styles.tick, className)} data-row-key={rowKey} onClick={onToggle}>{circle}</button>
    : <span className={classes(styles.tick, className)} role="img" aria-label={doneLabel}>{circle}</span>;
}
