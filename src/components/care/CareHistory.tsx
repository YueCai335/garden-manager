"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { careHistory, HistoryType } from "@/lib/careHistory";
import type { CareRow } from "@/lib/careViews";
import type { CareEvent, Garden } from "@/lib/gardenWorkspace";
import { CareIcon, PlusIcon } from "./CareMarks";
import { RowMenu } from "./CareParts";
import styles from "./Care.module.css";

type History = ReturnType<typeof careHistory>;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function Chips<T extends string>({ label, name, options, value, onChange }: { label: string; name: string; options: [T, string][]; value: T; onChange: (value: T) => void }) {
  return <div className={styles.filterGroup} role="group" aria-label={name}>
    <span className={styles.filterLabel} aria-hidden="true">{label}</span>
    {options.map(([key, text]) => <button key={key} type="button" className={styles.chip} aria-pressed={value === key} onClick={() => onChange(key)}>{text}</button>)}
  </div>;
}

/**
 * History (ADR-0080 D8–D10): completed care only, newest day first. A slim textured strip holds
 * the way back to Care, Add record, and the garden and care-type filters.
 */
export function CareHistory({ history, gardens, location, type, careHref, onBack, onLocation, onType, onMore, onClear, onAddRecord, onCorrect, onDelete, status }: {
  history: History;
  gardens: Garden[];
  /** "all", "all-gardens", or a garden ID that exists. */
  location: string;
  type: HistoryType;
  careHref?: string;
  onBack?: () => void;
  onLocation: (location: string) => void;
  onType: (type: HistoryType) => void;
  onMore: () => void;
  onClear: () => void;
  onAddRecord: () => void;
  onCorrect: (source: CareRow<CareEvent>) => void;
  onDelete: (source: CareRow<CareEvent>) => void;
  status?: ReactNode;
}) {
  const { days, shown, total } = history;
  const filtered = location !== "all" || type !== "all";
  const back = <><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.5 3.5L5 8l4.5 4.5" /></svg>Care</>;
  return <>
    <section className={`${styles.band} ${styles.strip}`} aria-labelledby="care-history-heading">
      <div className={styles.stripTop}>
        <div className={styles.stripTitle}>
          {careHref ? <Link className={styles.buttonGhost} href={careHref}>{back}</Link>
            : <button type="button" className={styles.buttonGhost} onClick={onBack}>{back}</button>}
          <div className={styles.stripHeading}>
            <h2 id="care-history-heading" tabIndex={-1}>History</h2>
            <p>Care you have done, newest first.</p>
          </div>
        </div>
        <button type="button" className={styles.buttonWhite} onClick={onAddRecord}><PlusIcon />Add record</button>
      </div>
      <div className={styles.filters}>
        <Chips label="Garden" name="Filter by garden" value={location} onChange={onLocation}
          options={[["all", "All"], ...gardens.map((garden): [string, string] => [garden.id, garden.name]), ["all-gardens", "All gardens"]]} />
        <Chips<HistoryType> label="Care" name="Filter by care type" value={type} onChange={onType} options={[["all", "All"], ["watering", "Watering"], ["fertilizing", "Fertilizing"]]} />
        {/* Announced when a filter or Show earlier records changes it (ADR-0080, 7.6). */}
        <p className={styles.filterCount} aria-live="polite" aria-atomic="true">{shown < total ? `Showing ${shown} of ${total} records` : plural(total, "record")}</p>
      </div>
    </section>
    {status}
    {total === 0
      ? <div className={`${styles.log} ${styles.logEmpty}`}>
        {filtered
          ? <><p>No care records match these filters.</p><button type="button" className={styles.buttonPrimary} onClick={onClear}>Clear filters</button></>
          : <><p>No care records yet.</p><p className={styles.rowSub}>Tick a task on Care, or add a record here.</p></>}
      </div>
      : <div className={styles.log}>
        {days.map((day) => <section key={day.date} className={styles.logDay} aria-labelledby={`care-day-${day.date}`}>
          <div className={styles.logDate}>
            <div className={styles.dateBadge} aria-hidden="true"><span className={styles.dateBadgeNumber}>{day.day}</span><span className={styles.dateBadgeMonth}>{day.month}</span></div>
            <div>
              <h3 id={`care-day-${day.date}`} className={styles.logDayName}>{day.label}<span className={styles.visuallyHidden}>, {day.month} {day.day}</span></h3>
              <p className={styles.rowSub}>{plural(day.rows.length, "record")}</p>
            </div>
          </div>
          <ul className={styles.logRows}>
            {day.rows.map((row) => <li key={row.key} className={styles.row}>
              <CareIcon type={row.type} className={styles.careIcon} />
              <span className={styles.rowText}>
                <span className={styles.rowTitle}>{row.title}</span>
                <span className={styles.rowSub}>{row.detail}</span>
                {row.note && <span className={styles.rowNote}>{row.note}</span>}
              </span>
              <RowMenu label={`More actions for ${row.title}, ${day.month} ${day.day}`} items={[
                { label: "Correct record", onSelect: () => onCorrect(row.source) },
                { label: "Delete record", onSelect: () => onDelete(row.source), danger: true },
              ]} />
            </li>)}
          </ul>
        </section>)}
      </div>}
    {shown < total && <div className={styles.logMore}><button type="button" className={styles.buttonPrimary} onClick={onMore}>Show earlier records</button></div>}
  </>;
}
