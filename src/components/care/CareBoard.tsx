"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { GardenPlanOverview } from "@/components/GardenPlanOverview";
import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import type { TickFocus } from "@/hooks/useCareTicks";
import type { CareBoard as Board, CareBoardGarden, CareBoardRow } from "@/lib/careBoard";
import { calendarLabel } from "@/lib/careLabels";
import type { CareRow } from "@/lib/careViews";
import type { CareTask } from "@/lib/gardenWorkspace";
import { gardenPath } from "@/lib/workspaceRoutes";
import { CareIcon, PlusIcon, Tick } from "./CareMarks";
import { RowMenu } from "./CareParts";
import styles from "./Care.module.css";

export type CareBoardActions = {
  onTick: (row: CareBoardRow, region: string) => void;
  onUntick: (row: CareBoardRow, region: string) => void;
  onEdit: (source: CareRow<CareTask>) => void;
  onCompleteOn: (source: CareRow<CareTask>) => void;
  onDelete: (source: CareRow<CareTask>) => void;
};

const cardId = (location: string) => `care-garden-${location}`;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

function headline(left: number, total: number) {
  if (!total) return "Nothing due today.";
  if (!left) return "All done for today.";
  return left === 1 ? "1 thing left today." : `${left} things left today.`;
}

/** A row in the band's lists or a garden card's Today: tick it, and in the band, open its menu. */
function TodayRow({ row, region, local, menu, actions }: { row: CareBoardRow; region: string; local?: boolean; menu?: boolean; actions: CareBoardActions }) {
  const title = local ? row.localTitle : row.title;
  const detail = local ? row.localDetail : row.detail;
  const label = [title, detail].filter(Boolean).join(", ");
  const toggle = row.done ? row.completion && (() => actions.onUntick(row, region)) : row.source && (() => actions.onTick(row, region));
  const late = !row.done ? row.late : undefined;
  return <li className={styles.row} data-done={row.done || undefined}>
    <Tick rowKey={row.key} label={label} done={row.done} onToggle={toggle || undefined} className={styles.tick} />
    <CareIcon type={row.type} />
    <span className={styles.rowText}>
      {local && row.source && !row.done
        ? <button type="button" className={`${styles.rowTitle} ${styles.titleButton}`} onClick={() => actions.onEdit(row.source!)}>{title}</button>
        : <span className={styles.rowTitle}>{title}</span>}
      {detail && <span className={styles.rowSub}>{detail}</span>}
      {!local && !row.done && row.note && <span className={styles.rowNote}>{row.note}</span>}
      {late && !local && <span className={styles.lateInline}>{late}</span>}
    </span>
    {late && <span className={styles.lateChip}>{local ? "Overdue" : late}</span>}
    {menu && row.source && !row.done && <RowMenu label={`More actions for ${label}`} items={[
      { label: "Edit task", onSelect: () => actions.onEdit(row.source!) },
      { label: "Complete on another date…", onSelect: () => actions.onCompleteOn(row.source!) },
      { label: "Delete task", onSelect: () => actions.onDelete(row.source!), danger: true },
    ]} />}
  </li>;
}

/** A task in the next seven days: no tick; its title opens the task dialog. */
function UpcomingRow({ row, actions }: { row: CareBoardRow; actions: CareBoardActions }) {
  const date = row.dueDate!;
  return <li className={styles.row}>
    <span className={styles.dateCol}>
      <span className={styles.dateColName}>{calendarLabel(date, { weekday: "short" })}</span>
      <span className={styles.dateColNumber}>{Number(date.slice(8, 10))}</span>
    </span>
    <CareIcon type={row.type} />
    <span className={styles.rowText}>
      {row.source
        ? <button type="button" className={`${styles.rowTitle} ${styles.titleButton}`} onClick={() => actions.onEdit(row.source!)}>{row.localTitle}</button>
        : <span className={styles.rowTitle}>{row.localTitle}</span>}
      {row.localDetail && <span className={styles.rowSub}>{row.localDetail}</span>}
    </span>
  </li>;
}

function TodayBand({ board, today, onAddTask, historyHref, onHistory, onTile, actions }: {
  board: Board;
  today: string;
  onAddTask: () => void;
  historyHref?: string;
  onHistory?: () => void;
  onTile: (location: string) => void;
  actions: CareBoardActions;
}) {
  const { todo, doneToday, overdue, dueToday, progress } = board;
  const summary = [overdue && `${overdue} overdue`, dueToday && `${dueToday} due today`, doneToday.length && `${doneToday.length} already done`].filter(Boolean).join(" · ");
  return <section className={`${styles.band} ${styles.today}`} aria-labelledby="care-today-heading">
    <div className={styles.bandMain}>
      <div className={styles.bandIntro}>
        <p className={styles.bandKicker}>Today · {calendarLabel(today, { weekday: "long" })}, {calendarLabel(today, { month: "short", day: "numeric" })}</p>
        <h2 id="care-today-heading" className={styles.headline} tabIndex={-1}>{headline(todo.length, progress.total)}</h2>
        {summary && <p className={styles.summary}>{summary}</p>}
        {progress.total > 0 && <div className={styles.progress}>
          <div className={styles.progressTrack} role="progressbar" aria-label="Today's care done" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.done}>
            <div className={styles.progressFill} style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
          </div>
          <span className={styles.progressLabel}>{progress.done} of {progress.total} done</span>
        </div>}
      </div>
      {board.gardens.length > 0 && <div>
        <p className={styles.tilesLabel} id="care-tiles-label">Today by garden</p>
        <nav className={styles.tiles} aria-labelledby="care-tiles-label">
          {board.gardens.map(({ garden, left, total }) => <a key={garden.id} className={styles.tile} href={`#${cardId(garden.id)}`}
            onClick={(event) => {
              // A modified click keeps the link's own behaviour, such as opening a new tab.
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              onTile(garden.id);
            }}>
            <span className={styles.tileName}>{garden.name}</span>
            <span className={styles.tileCount}>{left ? `${left} left` : total ? "All done" : "Nothing"}</span>
            <span className={styles.tileSub}>{total ? `${total - left} of ${total} done` : "No care today"}</span>
          </a>)}
        </nav>
      </div>}
      <div className={styles.bandActions}>
        <button type="button" className={styles.buttonWhite} onClick={onAddTask}><PlusIcon />Add task</button>
        {historyHref ? <Link className={styles.buttonGhost} href={historyHref}>History</Link>
          : <button type="button" className={styles.buttonGhost} onClick={onHistory}>History</button>}
      </div>
    </div>
    <div className={`${styles.glass} ${styles.todo}`} data-tick-region="today">
      <h3 id="care-todo-heading">To do · {todo.length}</h3>
      {todo.length
        ? <ul aria-labelledby="care-todo-heading">{todo.map((row) => <TodayRow key={row.key} row={row} region="today" menu actions={actions} />)}</ul>
        : <p className={styles.todoEmpty}>Nothing left. Everything for today is done.</p>}
      <h3 id="care-done-heading" className={styles.doneLabel}>Done today · {doneToday.length}</h3>
      {doneToday.length
        ? <ul aria-labelledby="care-done-heading">{doneToday.map((row) => <TodayRow key={row.key} row={row} region="today" actions={actions} />)}</ul>
        : <p className={styles.todoEmpty}>Nothing ticked off yet.</p>}
    </div>
  </section>;
}

function Ribbon({ board, actions }: { board: Board; actions: CareBoardActions }) {
  return <section className={styles.block} aria-labelledby="care-upcoming-heading">
    <div className={styles.blockHead}>
      <p className={styles.kicker}>Next 7 days</p>
      <h2 id="care-upcoming-heading" className={styles.blockTitle}>Upcoming</h2>
    </div>
    <div className={styles.ribbon}>
      <ol className={styles.ribbonGrid} aria-labelledby="care-upcoming-heading">
        {board.days.map((day) => <li key={day.date} className={styles.day}>
          <div className={styles.dayHead}><span className={styles.dayName}>{day.weekday}</span><span className={styles.dayNumber}>{day.day}</span></div>
          {day.rows.length
            ? <ul className={styles.dayItems}>{day.rows.map((row) => <li key={row.key} className={styles.mini}>
              <CareIcon type={row.type} className={styles.careIcon} />
              <span className={styles.miniText}>
                {row.source
                  ? <button type="button" className={`${styles.miniTitle} ${styles.titleButton}`} onClick={() => actions.onEdit(row.source!)}>{row.title}</button>
                  : <span className={styles.miniTitle}>{row.title}</span>}
                {row.detail && <span className={styles.rowSub}>{row.detail}</span>}
              </span>
            </li>)}</ul>
            : <p className={styles.dayEmpty}>Nothing planned</p>}
        </li>)}
      </ol>
    </div>
  </section>;
}

function GardenCard({ entry, highlighted, actions }: { entry: CareBoardGarden; highlighted: boolean; actions: CareBoardActions }) {
  const { garden, today, upcoming, left, total, areas } = entry;
  const region = `garden:${garden.id}`;
  const measured = garden.growingAreas.some((area) => area.layout);
  return <article id={cardId(garden.id)} className={`${styles.card} ${styles.gardenCard}`} data-highlight={highlighted || undefined} data-tick-region={region} aria-labelledby={`${cardId(garden.id)}-name`}>
    <div className={styles.gardenMap} aria-hidden="true">
      {measured
        ? <GardenPlanOverview compact growingAreas={garden.growingAreas} plantings={garden.plantings} plan={garden.plan} />
        : <span className={styles.mapEmpty}>{areas ? "Planting areas need a size" : "No planting areas yet"}</span>}
    </div>
    <header className={styles.gardenHead}>
      <div>
        <h3 id={`${cardId(garden.id)}-name`} className={styles.gardenName} tabIndex={-1}>{garden.name}</h3>
        <p className={styles.rowSub}>{plural(areas, "planting area")}</p>
      </div>
      <span className={styles.countChip} data-open={left > 0 || undefined}>{left ? `${left} to do today` : total ? "Done for today" : "Nothing today"}</span>
    </header>
    <div className={styles.gardenSection}>
      <h4 className={styles.groupLabel}>Today</h4>
      {today.length ? <ul>{today.map((row) => <TodayRow key={row.key} row={row} region={region} local actions={actions} />)}</ul>
        : <p className={styles.gardenEmpty}>Nothing due today.</p>}
    </div>
    <div className={styles.gardenSection}>
      <h4 className={styles.groupLabel}>Upcoming</h4>
      {upcoming.length ? <ul>{upcoming.map((row) => <UpcomingRow key={row.key} row={row} actions={actions} />)}</ul>
        : <p className={styles.gardenEmpty}>Nothing in the next 7 days.</p>}
    </div>
    <footer className={styles.gardenFoot}><Link className={styles.gardenLink} href={gardenPath(garden.id)}>Open {garden.name} <span aria-hidden="true">→</span></Link></footer>
  </article>;
}

function Gardens({ board, highlighted, actions }: { board: Board; highlighted?: string; actions: CareBoardActions }) {
  const { today, upcoming } = board.allGardens;
  const region = "garden:all-gardens";
  return <section className={styles.block} aria-labelledby="care-gardens-heading">
    <div className={styles.blockHead}>
      <p className={styles.kicker}>By garden</p>
      <h2 id="care-gardens-heading" className={styles.blockTitle}>Coming up in each garden</h2>
    </div>
    {today.length + upcoming.length > 0 && <div id={cardId("all-gardens")} className={`${styles.card} ${styles.allGardens}`} data-highlight={highlighted === "all-gardens" || undefined} data-tick-region={region}>
      <div className={styles.allGardensHead}>
        <span className={styles.allGardensMark} aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="2" width="5.5" height="5.5" rx="1.5" /><rect x="10.5" y="2" width="5.5" height="5.5" rx="1.5" /><rect x="2" y="10.5" width="5.5" height="5.5" rx="1.5" /><rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1.5" /></svg>
        </span>
        <div>
          <h3 id={`${cardId("all-gardens")}-name`} className={styles.gardenName} tabIndex={-1}>All gardens</h3>
          <p className={styles.rowSub}>Applies to every garden</p>
        </div>
      </div>
      <ul aria-labelledby={`${cardId("all-gardens")}-name`}>
        {today.map((row) => <TodayRow key={row.key} row={row} region={region} local actions={actions} />)}
        {upcoming.map((row) => <UpcomingRow key={row.key} row={row} actions={actions} />)}
      </ul>
    </div>}
    {board.gardens.length
      ? <div className={styles.gardenGrid}>{board.gardens.map((entry) => <GardenCard key={entry.garden.id} entry={entry} highlighted={highlighted === entry.garden.id} actions={actions} />)}</div>
      : <div className={styles.card}><div className={styles.emptyGardens}>
        <EmptyState action={<ButtonLink variant="primary" shape="pill" href="/gardens/new">Create garden</ButtonLink>}>Add a garden to see its care here.</EmptyState>
      </div></div>}
  </section>;
}

/**
 * Care as a Today board (ADR-0080): the textured Today band, the seven-day ribbon, and one card
 * per garden. Every block reads the same `board`, so ticking in one place updates the others.
 */
export function CareBoard({ board, today, focus, scrollTo, onAddTask, historyHref, onHistory, actions, status }: {
  board: Board;
  today: string;
  focus?: TickFocus;
  /** A garden ID or "all-gardens" from `?location=`: scroll to that card and highlight it. */
  scrollTo?: string;
  onAddTask: () => void;
  historyHref?: string;
  onHistory?: () => void;
  actions: CareBoardActions;
  status?: ReactNode;
}) {
  const [highlighted, setHighlighted] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const showCard = (location: string, moveFocus: boolean) => {
    const card = document.getElementById(cardId(location));
    if (!card) return;
    const reduced = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
    if (moveFocus) document.getElementById(`${cardId(location)}-name`)?.focus({ preventScroll: true });
    setHighlighted(location);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setHighlighted(undefined), 2000);
  };
  const showCardRef = useRef(showCard);
  showCardRef.current = showCard;
  // After this render's effects, so the app shell's page-title focus on load does not cancel the scroll.
  useEffect(() => {
    if (!scrollTo) return;
    const later = setTimeout(() => showCardRef.current(scrollTo, false));
    return () => clearTimeout(later);
  }, [scrollTo]);
  useEffect(() => () => clearTimeout(timer.current), []);
  // A ticked row moves (To do → Done today) or changes key; keep the keyboard on its circle.
  useEffect(() => {
    if (!focus) return;
    const regions = [...document.querySelectorAll<HTMLElement>("[data-tick-region]")].filter((node) => !focus.region || node.dataset.tickRegion === focus.region);
    regions.flatMap((node) => [...node.querySelectorAll<HTMLElement>("[data-row-key]")]).find((node) => node.dataset.rowKey === focus.key)?.focus();
  }, [focus]);

  return <>
    <TodayBand board={board} today={today} onAddTask={onAddTask} historyHref={historyHref} onHistory={onHistory} onTile={(location) => showCard(location, true)} actions={actions} />
    {status}
    <Ribbon board={board} actions={actions} />
    <Gardens board={board} highlighted={highlighted} actions={actions} />
  </>;
}
