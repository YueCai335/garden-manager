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

/** Watering is a drop, fertilizing a sprout: the shape tells them apart, not only the colour. */
export function CareIcon({ type, className }: { type: CareEventType; className?: string }) {
  return <span className={classes(styles.careIcon, className)} data-type={type} aria-hidden="true">
    {type === "watering"
      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3.5c3 3.6 5.5 6.3 5.5 9.6a5.5 5.5 0 0 1-11 0c0-3.3 2.5-6 5.5-9.6z" /></svg>
      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20v-8" /><path d="M12 12c0-3-2-5-6-5 0 3 2 5 6 5z" /><path d="M12 14.5c0-2.5 2-4.5 6-4.5 0 2.5-2 4.5-6 4.5z" /></svg>}
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
