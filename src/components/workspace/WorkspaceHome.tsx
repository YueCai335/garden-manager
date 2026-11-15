"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { GardenPlanOverview } from "@/components/GardenPlanOverview";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { plantDisplayName, type Garden } from "@/lib/gardenWorkspace";
import { homeTasks } from "@/lib/homeTasks";
import { careLocationPath, gardenPath } from "@/lib/workspaceRoutes";
import { OverviewNoteEntry } from "./AppShell";
import { useWorkspace } from "./WorkspaceProvider";
import styles from "./WorkspaceHome.module.css";

const taskGroups = [
  { status: "overdue", label: "Overdue" },
  { status: "due-today", label: "Today" },
  { status: "upcoming", label: "Upcoming" },
] as const;

function GardenCard({ garden }: { garden: Garden }) {
  const areaCount = garden.growingAreas.length;
  const unmeasured = garden.growingAreas.filter((area) => !area.layout).length;
  const crops = [...new Set(garden.plantings.filter((plant) => plant.isActive).map((plant) =>
    plantDisplayName({ plantType: plant.plantType, variety: plant.variety, fallback: plant.commonName })))];
  const detailsId = `garden-card-${garden.id}-details`;
  return <Link aria-label={`Open ${garden.name}`} aria-describedby={detailsId} className={styles.card} href={gardenPath(garden.id)}>
    <div className={styles.map} aria-hidden="true">
      {areaCount > unmeasured
        ? <GardenPlanOverview compact growingAreas={garden.growingAreas} plan={garden.plan} />
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

export function WorkspaceHomeLoading() {
  return <div className={`${styles.home} ${styles.overview}`} role="status">
    <span className={styles.visuallyHidden}>Loading your gardens…</span>
    <div className={`${styles.gallery} ${styles.gardens}`} aria-hidden="true">
      <div className={styles.grid}><div className={styles.skeleton} /><div className={styles.skeleton} /></div>
    </div>
  </div>;
}

export function WorkspaceHome({ onOpenDemoGarden, onboarding }: { onOpenDemoGarden: () => void; onboarding?: ReactNode }) {
  const { workspace, message } = useWorkspace();
  const allGardens = workspace?.gardens ?? [];
  const hasPersonalGardens = allGardens.some((garden) => garden.id !== "demo-garden");
  const gardens = hasPersonalGardens ? allGardens.filter((garden) => garden.id !== "demo-garden") : allGardens;
  const { counts, recent } = workspace ? homeTasks(workspace) : { counts: { overdue: 0, "due-today": 0, upcoming: 0 }, recent: [] };

  return <div className={styles.home}>
    <div className={styles.overview}>
      <div className={styles.daily}>
        <OverviewNoteEntry />
        <aside aria-labelledby="upcoming-care-heading" className={styles.tasks}>
          <h2 id="upcoming-care-heading">Care tasks</h2>
          <p className={styles.hint}>Due now and in the next 7 days</p>
          <dl className={styles.taskCounts}>
            {taskGroups.map(({ status, label }) => <div key={status}>
              <dt>{label}</dt><dd className={status === "overdue" && counts[status] ? styles.overdue : undefined}>{counts[status]}</dd>
            </div>)}
          </dl>
          {recent.length > 0 ? <ul className={styles.taskList}>{recent.map(({ key, task, location, gardenId, status }) => <li key={key}>
            <Link href={careLocationPath(gardenId ?? "all-gardens", "tasks")}>
              <strong>{task.type === "watering" ? "Watering" : "Fertilizing"}</strong>
              <span>{location}</span>
              <span className={status === "overdue" ? styles.overdue : undefined}>{taskGroups.find((group) => group.status === status)?.label} · <time dateTime={task.dueDate}>{task.dueDate}</time></span>
            </Link>
          </li>)}</ul> : <p className={styles.noTasks}>No tasks due in this period.</p>}
          {workspace && <ButtonLink className={styles.taskLink} variant="text" href="/care?view=tasks">{recent.length ? "View all tasks →" : "Add task →"}</ButtonLink>}
        </aside>
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
