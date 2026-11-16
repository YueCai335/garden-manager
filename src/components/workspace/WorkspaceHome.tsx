"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { GardenPlanOverview } from "@/components/GardenPlanOverview";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { careEventForTask, completeCareTask, undoCareTaskCompletion, updateCareOwner } from "@/lib/careViews";
import { createId, isDemoGardenId, plantDisplayName, todayDate, type Garden } from "@/lib/gardenWorkspace";
import { homeTasks, type HomeCompletion, type HomeTaskRow } from "@/lib/homeTasks";
import { gardenPath } from "@/lib/workspaceRoutes";
import { OverviewNoteEntry } from "./AppShell";
import { useWorkspace } from "./WorkspaceProvider";
import styles from "./WorkspaceHome.module.css";

function GardenCard({ garden }: { garden: Garden }) {
  const areaCount = garden.growingAreas.length;
  const unmeasured = garden.growingAreas.filter((area) => !area.layout).length;
  const crops = [...new Set(garden.plantings.filter((plant) => plant.isActive).map((plant) =>
    plantDisplayName({ plantType: plant.plantType, variety: plant.variety, fallback: plant.commonName })))];
  const detailsId = `garden-card-${garden.id}-details`;
  return <Link aria-label={`Open ${garden.name}`} aria-describedby={detailsId} className={styles.card} href={gardenPath(garden.id)}>
    <div className={styles.map} aria-hidden="true">
      {areaCount > unmeasured
        ? <GardenPlanOverview compact growingAreas={garden.growingAreas} plantings={garden.plantings} plan={garden.plan} />
        : <span>{areaCount ? "Planting areas need a size" : "No planting areas yet"}</span>}
    </div>
    <div className={styles.cardDetails}>
      <h3><span>{garden.name}</span><span className={styles.cardArrow} aria-hidden="true">→</span></h3>
      <div className={styles.metadata} id={detailsId}>
        <span>{areaCount} planting {areaCount === 1 ? "area" : "areas"}{unmeasured > 0 && ` · ${unmeasured} need${unmeasured === 1 ? "s" : ""} a size`}</span>
        <span>{crops.length ? `Growing now: ${crops.slice(0, 3).join(", ")}${crops.length > 3 ? ` + ${crops.length - 3} more` : ""}` : "No current plantings"}</span>
      </div>
    </div>
  </Link>;
}

type HomeTasks = ReturnType<typeof homeTasks>;

function TaskRow({ row, titleId, onTick, onUntick }: { row: HomeTaskRow; titleId: string; onTick: (row: HomeTaskRow) => void; onUntick: (row: HomeTaskRow) => void }) {
  const check = <span className={styles.circle} aria-hidden="true">
    <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
  </span>;
  return <li className={styles.task} data-done={row.done || undefined} data-upcoming={row.when ? true : undefined}>
    <span className={styles.careDot} data-type={row.type} aria-hidden="true" />
    <span className={styles.taskText}>
      <span id={titleId}>{row.title}</span>
      {row.detail && <small>{row.detail}</small>}
    </span>
    {row.when ? <span className={styles.when}>{row.when}</span>
      : row.task || row.completion
        ? <button type="button" role="checkbox" aria-checked={row.done} aria-labelledby={titleId} className={styles.tick}
          onClick={() => row.done ? onUntick(row) : onTick(row)}>{check}</button>
        // Done earlier (on another visit, in Care, or from a note): it is corrected in Care history.
        : <span className={styles.tick} role="img" aria-label="Done">{check}</span>}
  </li>;
}

function TaskGroup({ id, label, rows, late, empty, onTick, onUntick }: { id: string; label: string; rows: HomeTaskRow[]; late?: boolean; empty?: string; onTick: (row: HomeTaskRow) => void; onUntick: (row: HomeTaskRow) => void }) {
  return <div className={styles.taskGroup}>
    <h3 id={id} className={late ? styles.late : undefined}>{label}</h3>
    {rows.length
      ? <ul className={styles.taskList} aria-labelledby={id}>{rows.map((row, index) =>
        <TaskRow key={row.key} row={row} titleId={`${id}-${index}`} onTick={onTick} onUntick={onUntick} />)}</ul>
      : <p className={styles.taskEmpty}>{empty}</p>}
  </div>;
}

/** ADR-0073: "Care to do" beside the gardens. Tick off what is due; the full task list lives in Care. */
function CareToDo({ tasks, onTick, onUntick }: { tasks: HomeTasks; onTick: (row: HomeTaskRow) => void; onUntick: (row: HomeTaskRow) => void }) {
  const { overdue, today, upcoming, done, total } = tasks;
  const nothing = total === 0 && upcoming.length === 0;
  return <section aria-labelledby="care-todo-heading" className={styles.today}>
    <div className={styles.todayHeader}>
      <h2 id="care-todo-heading">Care to do</h2>
      {total > 0 && <span className={styles.todayCount}>{done === total ? "All done" : `${done} of ${total} done`}</span>}
    </div>
    {overdue.length > 0 && <TaskGroup id="care-todo-overdue" label="Overdue" late rows={overdue} onTick={onTick} onUntick={onUntick} />}
    <TaskGroup id="care-todo-today" label="Today" rows={today} empty={nothing ? "No care tasks this week." : "Nothing due today."} onTick={onTick} onUntick={onUntick} />
    {upcoming.length > 0 && <TaskGroup id="care-todo-upcoming" label="Coming up" rows={upcoming} onTick={onTick} onUntick={onUntick} />}
    <Link className={styles.todayLink} href="/care?view=tasks">{nothing ? "Add a care task" : "All tasks"} <span aria-hidden="true">→</span></Link>
  </section>;
}

export function WorkspaceHomeLoading() {
  return <div className={`${styles.home} ${styles.overview}`} role="status">
    <span className={styles.visuallyHidden}>Loading your gardens…</span>
    <div className={`${styles.gallery} ${styles.gardens}`} aria-hidden="true">
      <div className={styles.grid}><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
    </div>
  </div>;
}

export function WorkspaceHome({ onOpenDemoGarden, onboarding }: { onOpenDemoGarden: () => void; onboarding?: ReactNode }) {
  const { workspace, message, setWorkspace } = useWorkspace();
  // Ticks from this visit; each can be unticked until the page is left (ADR-0073).
  const [completions, setCompletions] = useState<HomeCompletion[]>([]);
  const allGardens = workspace?.gardens ?? [];
  const hasPersonalGardens = allGardens.some((garden) => !isDemoGardenId(garden.id));
  const gardens = hasPersonalGardens ? allGardens.filter((garden) => !isDemoGardenId(garden.id)) : allGardens;
  const tasks = workspace ? homeTasks(workspace, todayDate(), completions) : undefined;
  const tick = (row: HomeTaskRow) => {
    const { task, owner } = row;
    if (!task) return;
    const event = careEventForTask(task, todayDate(), owner, createId("care"));
    setWorkspace((current) => current ? updateCareOwner(current, owner, (records) => completeCareTask(records, task, event)) : current);
    setCompletions((current) => [...current, { taskKey: row.key, task, owner, eventId: event.id }]);
  };
  const untick = (row: HomeTaskRow) => {
    const { completion } = row;
    if (!completion) return;
    setWorkspace((current) => current ? updateCareOwner(current, completion.owner, (records) => undoCareTaskCompletion(records, completion.task, completion.eventId)) : current);
    setCompletions((current) => current.filter((item) => item !== completion));
  };

  // ADR-0073 (amended 2026-11-16): the gardens fill the left; Today and AI Garden Notes stack on the right.
  return <div className={styles.home}>
    <div className={styles.overview}>
      {tasks && <div className={styles.todayArea}><CareToDo tasks={tasks} onTick={tick} onUntick={untick} /></div>}
      <div className={styles.noteArea}>
        <OverviewNoteEntry />
      </div>
      <div className={styles.gallery}>
        {onboarding ?? <section aria-labelledby="your-gardens-heading" className={styles.gardens}>
          <div className={styles.sectionHeading}>
            <h2 id="your-gardens-heading">Your gardens <span className={styles.gardenCount}>({gardens.length})</span></h2>
            {gardens.length > 0 && <ButtonLink href="/gardens/new">Add garden</ButtonLink>}
          </div>
          {gardens.length
            ? <div className={styles.grid}>{gardens.map((garden) => <GardenCard key={garden.id} garden={garden} />)}</div>
            : <EmptyState action={<ButtonLink variant="primary" href="/gardens/new">Create garden</ButtonLink>}>Add your first garden to start recording care.</EmptyState>}
          {hasPersonalGardens && <Button className={styles.demoLink} variant="text" onClick={onOpenDemoGarden}>Demo garden</Button>}
        </section>}
      </div>
    </div>
    {workspace && message && <p className={styles.hint} role="status">{message}</p>}
  </div>;
}
