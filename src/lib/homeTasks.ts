import { careTargetLabel } from "./careRecords";
import { addDays, careTaskStatus, todayDate, type CareEvent, type CareEventType, type CareTask, type Garden, type GardenWorkspace } from "./gardenWorkspace";
import { careLocationKey, carePathLabel, careRows, workspaceCareGarden, type CareOwner } from "./careViews";

/** A task ticked off on Gardens this visit; it stays in its place, struck through, and can be unticked. */
export type HomeCompletion = { taskKey: string; task: CareTask; owner: CareOwner; eventId: string };

export type HomeTaskRow = {
  key: string;
  type: CareEventType;
  /** Verb and place, for example "Water Front garden". */
  title: string;
  /** The place below the garden: a planting area, "area · plant group", or "Whole garden". */
  detail?: string;
  /** For an overdue task: "Due yesterday" or "Due 3 days ago" (ADR-0081). */
  late?: string;
  /** For Coming up: "Tomorrow" or a weekday. */
  when?: string;
  done: boolean;
  /** An open task can be ticked; a task ticked this visit can be unticked. Earlier history rows have neither. */
  task?: CareTask;
  owner: CareOwner;
  completion?: HomeCompletion;
};

function title(record: CareTask | CareEvent, garden: Garden) {
  const verb = record.type === "watering" ? "Water" : "Fertilize";
  return `${verb} ${record.targetScope === "all-gardens" ? "all gardens" : garden.name}`;
}

/** The part below the garden: a planting area, an area and a plant group, or the whole garden. */
function target(record: CareTask | CareEvent, garden: Garden) {
  if (record.targetScope === "planting-area") return careTargetLabel(record);
  if (record.targetScope === "plant-group") return carePathLabel(record, garden).split(" / ").slice(1).join(" · ");
  if (record.targetScope === "garden") return "Whole garden";
  return undefined;
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function lateLabel(dueDate: string, today: string) {
  const days = daysBetween(dueDate, today);
  return days === 1 ? "Due yesterday" : `Due ${days} days ago`;
}

function whenLabel(dueDate: string, today: string) {
  if (dueDate === addDays(today, 1)) return "Tomorrow";
  return new Date(`${dueDate}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

const byDue = (a: { dueDate: string; id: string }, b: { dueDate: string; id: string }) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id);

/**
 * Care on the Gardens home (ADR-0081). Overdue and Today can be ticked off; a row ticked here
 * stays in its place, struck through. Care recorded earlier today, in Care or from a note, ends
 * Today as a done row. Coming up (the next seven days) is not shown on the page; it only tells
 * whether the workspace has any care tasks.
 */
export function homeTasks(workspace: GardenWorkspace, today = todayDate(), completions: HomeCompletion[] = []) {
  const sources = [workspaceCareGarden(workspace), ...workspace.gardens];
  const cutoff = addDays(today, 7);
  const eventKey = (owner: CareOwner, id: string) => `${careLocationKey(owner)}:${id}`;
  const todaysEvents = careRows(sources, "careEvents").filter(({ record }) => record.date === today);
  const eventKeys = new Set(todaysEvents.map(({ owner, record }) => eventKey(owner, record.id)));
  // A tick whose history record was removed elsewhere no longer counts.
  const live = completions.filter((completion) => eventKeys.has(eventKey(completion.owner, completion.eventId)));
  const ticked = new Set(live.map((completion) => eventKey(completion.owner, completion.eventId)));

  type Sortable = HomeTaskRow & { dueDate: string; id: string };
  const groups = { overdue: [] as Sortable[], today: [] as Sortable[], upcoming: [] as Sortable[] };
  const group = (dueDate: string) => {
    const status = careTaskStatus({ dueDate }, today);
    return status === "overdue" ? groups.overdue : status === "due-today" ? groups.today : groups.upcoming;
  };

  for (const { key, record, owner, garden } of careRows(sources, "careTasks")) {
    if (record.dueDate > cutoff) continue;
    const late = record.dueDate < today ? lateLabel(record.dueDate, today) : undefined;
    group(record.dueDate).push({
      key, id: record.id, dueDate: record.dueDate, type: record.type, title: title(record, garden), detail: target(record, garden), late,
      when: record.dueDate > today ? whenLabel(record.dueDate, today) : undefined, done: false, task: record, owner,
    });
  }
  for (const completion of live) {
    const garden = sources.find((source) => source.id === careLocationKey(completion.owner));
    if (!garden) continue;
    const { task } = completion;
    const late = task.dueDate < today;
    (late ? groups.overdue : groups.today).push({
      key: `done:${completion.eventId}`, id: task.id, dueDate: late ? task.dueDate : today, type: task.type, title: title(task, garden),
      detail: target(task, garden), late: late ? lateLabel(task.dueDate, today) : undefined, done: true, owner: completion.owner, completion,
    });
  }
  const earlier: HomeTaskRow[] = todaysEvents
    .filter(({ owner, record }) => !ticked.has(eventKey(owner, record.id)))
    .map(({ key, record, owner, garden }) => ({ key: `done:${key}`, type: record.type, title: title(record, garden), detail: target(record, garden), done: true, owner }));

  const strip = ({ dueDate: _dueDate, id: _id, ...row }: Sortable): HomeTaskRow => row;
  const overdue = groups.overdue.sort(byDue).map(strip);
  const todayRows = [...groups.today.sort(byDue).map(strip), ...earlier];
  const upcoming = groups.upcoming.sort(byDue).map(strip);
  const actionable = [...overdue, ...todayRows];
  return { overdue, today: todayRows, upcoming, done: actionable.filter((row) => row.done).length, total: actionable.length };
}
