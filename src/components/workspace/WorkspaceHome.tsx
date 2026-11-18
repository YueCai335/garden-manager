"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { GardenPlanOverview } from "@/components/GardenPlanOverview";
import { ButtonLink } from "@/components/ui/Button";
import { useCareTicks } from "@/hooks/useCareTicks";
import { updateCareOwner } from "@/lib/careViews";
import { isDemoGardenId, todayDate, type CareEventType, type Garden } from "@/lib/gardenWorkspace";
import { gardenCardSummary, gardenPlants, gardensSummary } from "@/lib/homeGardens";
import { homeTasks, type HomeTaskRow } from "@/lib/homeTasks";
import { gardenPath } from "@/lib/workspaceRoutes";
import { OverviewNoteEntry } from "./AppShell";
import { useWorkspace } from "./WorkspaceProvider";
import styles from "./WorkspaceHome.module.css";

type HomeTasks = ReturnType<typeof homeTasks>;
/** Today's care for one garden: open rows left, and all of today's rows. */
type GardenToday = { left: number; total: number };

/** Today's Today rows shown on the page; more go to Care (ADR-0081). */
const TODAY_ROWS = 6;

const localDay = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });

function PlusIcon({ size }: { size: number }) {
  return <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>;
}

function CareIcon({ type }: { type: CareEventType }) {
  return <span className={styles.careIcon} data-type={type} aria-hidden="true">
    {type === "watering"
      ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3.5c3 3.6 5.5 6.3 5.5 9.6a5.5 5.5 0 0 1-11 0c0-3.3 2.5-6 5.5-9.6z" /></svg>
      : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20v-8" /><path d="M12 12c0-3-2-5-6-5 0 3 2 5 6 5z" /><path d="M12 14.5c0-2.5 2-4.5 6-4.5 0 2.5-2 4.5-6 4.5z" /></svg>}
  </span>;
}

/** ADR-0081: the textured band carries only the date, the title, the totals, and Demo garden. */
function GardensBand({ summary, onOpenDemoGarden }: { summary?: string; onOpenDemoGarden?: () => void }) {
  return <div className={`${styles.band} ${styles.ridges} ${styles.gardensBand}`}>
    <div className={styles.bandIntro}>
      <p className={styles.bandKicker}>{localDay(todayDate(), { weekday: "long", month: "short", day: "numeric" })}</p>
      <h2 id="your-gardens-heading" className={styles.bandHeadline}>Your gardens</h2>
      <p className={styles.bandSummary}>{summary}</p>
    </div>
    {onOpenDemoGarden && <button type="button" className={styles.buttonGhost} onClick={onOpenDemoGarden}>Demo garden</button>}
  </div>;
}

function GardenCard({ garden, today }: { garden: Garden; today?: GardenToday }) {
  const areaCount = garden.growingAreas.length;
  const measured = garden.growingAreas.some((area) => area.layout);
  const plants = gardenPlants(garden);
  const id = `garden-card-${garden.id}`;
  const chip = today && today.total > 0 ? today.left ? `${today.left} to do today` : "All done today" : undefined;
  // The link's name is the garden; the description reads the counts, the plants, and today's label.
  const described = [`${id}-meta`, plants.length ? `${id}-plants` : "", chip ? `${id}-today` : ""].filter(Boolean).join(" ");
  return <Link aria-label={`Open ${garden.name}`} aria-describedby={described} className={styles.card} href={gardenPath(garden.id)}>
    <div className={styles.map} aria-hidden="true">
      {measured
        ? <GardenPlanOverview compact growingAreas={garden.growingAreas} plantings={garden.plantings} plan={garden.plan} />
        : <span className={styles.mapEmpty}>{areaCount ? "Planting areas need a size" : "No planting areas yet"}</span>}
    </div>
    <div className={styles.cardBody}>
      {chip && <span id={`${id}-today`} className={styles.chip} data-open={today!.left > 0 || undefined}>{chip}</span>}
      <h3 className={styles.cardName}>{garden.name}</h3>
      <span id={`${id}-meta`} className={styles.cardMeta}>{gardenCardSummary(garden)}</span>
      {plants.length > 0 && <span id={`${id}-plants`} className={styles.cardPlants}>
        {plants.slice(0, 3).map((plant) => <span key={plant.key} className={styles.cardPlant}>
          {/* The plan's own plant colours (ADR-0076): the same fill and outline as the thumbnail. */}
          <i data-plant-swatch style={{ background: plant.colors.fill, borderColor: plant.colors.stroke }} />{plant.name}
        </span>)}
        {plants.length > 3 && <span className={styles.cardMore}>+{plants.length - 3} more</span>}
      </span>}
    </div>
  </Link>;
}

function NewGardenCard() {
  return <Link className={styles.newCard} href="/gardens/new" aria-labelledby="new-garden-title" aria-describedby="new-garden-sub">
    <span className={styles.newMark}><PlusIcon size={20} /></span>
    <span id="new-garden-title" className={styles.newTitle}>New garden</span>
    <span id="new-garden-sub" className={styles.newSub}>Draw the outline, then add planting areas</span>
  </Link>;
}

function TaskRow({ row, onTick, onUntick }: { row: HomeTaskRow; onTick: (row: HomeTaskRow) => void; onUntick: (row: HomeTaskRow) => void }) {
  const circle = <span className={styles.tickCircle} aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 6.5l2.5 2.5 4.5-5.5" /></svg>
  </span>;
  const late = row.late && !row.done ? row.late : undefined;
  return <li className={styles.row} data-done={row.done || undefined}>
    {row.task || row.completion
      ? <button type="button" role="checkbox" aria-checked={row.done} aria-label={[row.title, row.detail].filter(Boolean).join(", ")}
        className={styles.tick} data-row-key={row.key} onClick={() => row.done ? onUntick(row) : onTick(row)}>{circle}</button>
      // Done earlier (in Care or from a note): it is corrected in Care history.
      : <span className={styles.tick} role="img" aria-label="Done">{circle}</span>}
    <CareIcon type={row.type} />
    <span className={styles.rowText}>
      <span className={styles.rowTitle}>{row.title}</span>
      {row.detail && <span className={styles.rowSub}>{row.detail}</span>}
      {late && <span className={styles.lateInline}>{late}</span>}
    </span>
    {late && <span className={styles.lateChip}>{late}</span>}
  </li>;
}

/** ADR-0081: today's care only (overdue, due today, done today), ticked off in place. Care owns the week. */
function TodayCard({ tasks, hasGardens, focusKey, onTick, onUntick }: {
  tasks: HomeTasks;
  hasGardens: boolean;
  focusKey?: string;
  onTick: (row: HomeTaskRow) => void;
  onUntick: (row: HomeTaskRow) => void;
}) {
  const { overdue, today, upcoming, done, total } = tasks;
  const rows = [...overdue, ...today];
  const left = total - done;
  const list = useRef<HTMLUListElement>(null);
  // A ticked row is a new record row; keep the keyboard on its circle.
  useEffect(() => {
    if (!focusKey) return;
    [...list.current?.querySelectorAll<HTMLButtonElement>("button[data-row-key]") ?? []].find((button) => button.dataset.rowKey === focusKey)?.focus();
  }, [focusKey, rows.length, done]);
  const date = todayDate();
  const heading = !total ? "Nothing due today" : !left ? "All done for today" : left === 1 ? "1 thing left" : `${left} things left`;
  const nothingAtAll = total === 0 && upcoming.length === 0;
  return <section className={styles.todayCard} aria-label="Care today">
    <div className={`${styles.band} ${styles.ridges} ${styles.dateTile}`}>
      <p className={`${styles.bandKicker} ${styles.dateDay}`}>{localDay(date, { weekday: "long" })}</p>
      <p className={styles.dateBig}>{Number(date.slice(8, 10))}</p>
      <p className={styles.dateMonth}>{localDay(date, { month: "long" })}</p>
      {total > 0 && <div className={styles.progress}>
        <div className={styles.progressTrack}><div className={styles.progressFill} style={{ width: `${Math.round((done / total) * 100)}%` }} /></div>
        <span className={styles.progressLabel}>{done} of {total} done</span>
      </div>}
    </div>
    <div className={styles.todayBody}>
      <div className={styles.todayHead}>
        <div className={styles.todayHeading}>
          <p className={styles.kicker}>Care today</p>
          <h2 className={styles.todayTitle}>{heading}</h2>
        </div>
        <Link className={styles.textLink} href="/care?view=tasks">{nothingAtAll ? "Add a care task" : "Open Care"} <span aria-hidden="true">→</span></Link>
      </div>
      {rows.length
        ? <ul ref={list} className={styles.rows}>{rows.slice(0, TODAY_ROWS).map((row) => <TaskRow key={row.key} row={row} onTick={onTick} onUntick={onUntick} />)}</ul>
        : <p className={styles.todayEmpty}>{hasGardens ? "No watering or fertilizing is due today." : "Care tasks appear here on the day they are due."}</p>}
      {rows.length > TODAY_ROWS && <div className={styles.todayMore}>
        <Link className={styles.textLink} href="/care?view=tasks">+{rows.length - TODAY_ROWS} more in Care <span aria-hidden="true">→</span></Link>
      </div>}
    </div>
  </section>;
}

export function WorkspaceHomeLoading() {
  return <div className={styles.home} role="status">
    <span className={styles.visuallyHidden}>Loading your gardens…</span>
    <section className={styles.gardens} aria-hidden="true">
      <GardensBand />
      <div className={styles.gardenGrid}><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
    </section>
  </div>;
}

export function WorkspaceHome({ onOpenDemoGarden, onboarding }: { onOpenDemoGarden: () => void; onboarding?: ReactNode }) {
  const { workspace, message, setWorkspace } = useWorkspace();
  // Ticks from this visit; each can be unticked until the page is left (ADR-0073).
  const { completions, focus, tick: tickRow, untick: untickRow } = useCareTicks((owner, change) =>
    setWorkspace((current) => current ? updateCareOwner(current, owner, change) : current));
  const focusKey = focus?.key;
  const allGardens = workspace?.gardens ?? [];
  const hasPersonalGardens = allGardens.some((garden) => !isDemoGardenId(garden.id));
  const gardens = hasPersonalGardens ? allGardens.filter((garden) => !isDemoGardenId(garden.id)) : allGardens;
  const tasks = workspace ? homeTasks(workspace, todayDate(), completions) : undefined;
  // Each card's label counts that garden's own rows; workspace-wide care belongs to no card.
  const gardenToday = new Map<string, GardenToday>();
  for (const row of tasks ? [...tasks.overdue, ...tasks.today] : []) {
    if (row.owner.ownerScope !== "garden") continue;
    const entry = gardenToday.get(row.owner.gardenId) ?? { left: 0, total: 0 };
    gardenToday.set(row.owner.gardenId, { left: entry.left + (row.done ? 0 : 1), total: entry.total + 1 });
  }
  const tick = (row: HomeTaskRow) => tickRow(row);
  const untick = (row: HomeTaskRow) => untickRow(row.completion);

  const firstGarden = onboarding
    ? <div className={styles.firstGarden}>{onboarding}</div>
    : !gardens.length && <div className={styles.firstGarden}>
      <p className={styles.firstText}>Add your first garden to start recording care.</p>
      <div><ButtonLink variant="primary" href="/gardens/new">Create garden</ButtonLink></div>
    </div>;

  // ADR-0081: the gardens stand half on a textured band; Today and AI Garden Notes are two blocks below.
  return <div className={styles.home}>
    <section className={styles.gardens} aria-labelledby="your-gardens-heading">
      <GardensBand summary={gardensSummary(onboarding ? [] : gardens)} onOpenDemoGarden={!onboarding && hasPersonalGardens ? onOpenDemoGarden : undefined} />
      <div className={styles.gardenGrid}>
        {firstGarden || <>
          {gardens.map((garden) => <GardenCard key={garden.id} garden={garden} today={gardenToday.get(garden.id)} />)}
          <NewGardenCard />
        </>}
      </div>
    </section>
    <div className={styles.lower}>
      {tasks
        ? <TodayCard tasks={tasks} hasGardens={gardens.length > 0} focusKey={focusKey} onTick={tick} onUntick={untick} />
        : <TodayCard tasks={{ overdue: [], today: [], upcoming: [], done: 0, total: 0 }} hasGardens={false} onTick={tick} onUntick={untick} />}
      <OverviewNoteEntry />
    </div>
    {workspace && message && <p className={styles.hint} role="status">{message}</p>}
  </div>;
}
