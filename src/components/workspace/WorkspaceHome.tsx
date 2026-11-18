"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { GardenPlanOverview } from "@/components/GardenPlanOverview";
import { CareIcon, PlusIcon, Tick } from "@/components/care/CareMarks";
import { ButtonLink } from "@/components/ui/Button";
import { useCareTicks } from "@/hooks/useCareTicks";
import { SLOW_LOAD_HINT, useSlowLoadHint } from "@/hooks/useSlowLoadHint";
import { updateCareOwner } from "@/lib/careViews";
import { isDemoGardenId, todayDate, type Garden } from "@/lib/gardenWorkspace";
import { gardenCardSummary, gardenPlants, gardensSummary } from "@/lib/homeGardens";
import { careBoard, type CareBoard, type CareBoardRow } from "@/lib/careBoard";
import { gardenPath } from "@/lib/workspaceRoutes";
import { OverviewNoteEntry } from "./AppShell";
import { useWorkspace } from "./WorkspaceProvider";
import styles from "./WorkspaceHome.module.css";

/** Today's care for one garden: open rows left, and all of today's rows. */
type GardenToday = { left: number; total: number };

/** Today's Today rows shown on the page; more go to Care (ADR-0081). */
const TODAY_ROWS = 6;

const localDay = (date: string, options: Intl.DateTimeFormatOptions) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });

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
    <span className={styles.newMark}><PlusIcon size={20} strokeWidth={1.6} /></span>
    <span id="new-garden-title" className={styles.newTitle}>New garden</span>
    <span id="new-garden-sub" className={styles.newSub}>Draw the outline, then add planting areas</span>
  </Link>;
}

function TaskRow({ row, onTick, onUntick }: { row: CareBoardRow; onTick: (row: CareBoardRow) => void; onUntick: (row: CareBoardRow) => void }) {
  const late = row.late && !row.done ? row.late : undefined;
  return <li className={styles.row} data-done={row.done || undefined}>
    {/* Done earlier (in Care or from a note), a row has no toggle: it is corrected in Care history. */}
    <Tick rowKey={row.key} label={[row.title, row.target].filter(Boolean).join(", ")} done={row.done} doneLabel="Done"
      onToggle={row.source || row.completion ? () => row.done ? onUntick(row) : onTick(row) : undefined} />
    <CareIcon type={row.type} />
    <span className={styles.rowText}>
      <span className={styles.rowTitle}>{row.title}</span>
      {row.target && <span className={styles.rowSub}>{row.target}</span>}
      {late && <span className={styles.lateInline}>{late}</span>}
    </span>
    {late && <span className={styles.lateChip}>{late}</span>}
  </li>;
}

/** ADR-0081: today's care only (overdue, due today, done today), ticked off in place. Care owns the week. */
function TodayCard({ board, hasGardens, focusKey, onTick, onUntick }: {
  board?: CareBoard;
  hasGardens: boolean;
  focusKey?: string;
  onTick: (row: CareBoardRow) => void;
  onUntick: (row: CareBoardRow) => void;
}) {
  const rows = board?.today ?? [];
  const { done, total } = board?.progress ?? { done: 0, total: 0 };
  const left = total - done;
  const list = useRef<HTMLUListElement>(null);
  // A ticked row is a new record row; keep the keyboard on its circle.
  useEffect(() => {
    if (!focusKey) return;
    [...list.current?.querySelectorAll<HTMLButtonElement>("button[data-row-key]") ?? []].find((button) => button.dataset.rowKey === focusKey)?.focus();
  }, [focusKey, rows.length, done]);
  const date = todayDate();
  const heading = !total ? "Nothing due today" : !left ? "All done for today" : left === 1 ? "1 thing left" : `${left} things left`;
  const nothingAtAll = total === 0 && !board?.days.some((day) => day.rows.length);
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
  // After five seconds the band's summary line explains a sleeping demo server (ADR-0079).
  const slow = useSlowLoadHint();
  return <div className={styles.home} role="status">
    <span className={styles.visuallyHidden}>{slow ? SLOW_LOAD_HINT : "Loading your gardens…"}</span>
    <section className={styles.gardens} aria-hidden="true">
      <GardensBand summary={slow ? SLOW_LOAD_HINT : undefined} />
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
  const board = workspace ? careBoard(workspace, todayDate(), completions) : undefined;
  // Each card's label counts that garden's own rows; workspace-wide care belongs to no card.
  const gardenToday = new Map<string, GardenToday>(board?.gardens.map(({ garden, left, total }) => [garden.id, { left, total }]));
  const tick = (row: CareBoardRow) => tickRow({ key: row.key, owner: row.owner, task: row.source?.record });
  const untick = (row: CareBoardRow) => untickRow(row.completion);

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
      <TodayCard board={board} hasGardens={gardens.length > 0} focusKey={focusKey} onTick={tick} onUntick={untick} />
      <OverviewNoteEntry />
    </div>
    {workspace && message && <p className={styles.hint} role="status">{message}</p>}
  </div>;
}
