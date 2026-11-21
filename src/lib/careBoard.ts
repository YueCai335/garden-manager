import { byDue, calendarLabel, careLateLabel, careRepeat, careLocalTitle, careTarget, careTargetParts, careTitle } from "./careLabels";
import { careDetailsText } from "./careRecords";
import { careLocationKey, careRows, workspaceCareGarden, type CareOwner, type CareRow } from "./careViews";
import { addDays, type CareEvent, type CareEventType, type CareTask, type Garden, type GardenWorkspace } from "./gardenWorkspace";

/** A task ticked off this visit, on Care or Gardens: it stays in its place, struck through, and can be unticked. */
export type CareCompletion = { taskKey: string; task: CareTask; owner: CareOwner; eventId: string };

/** How many days ahead Care looks (ADR-0080 D5): tomorrow through the seventh day. */
export const CARE_WINDOW_DAYS = 7;

export type CareBoardRow = {
  key: string;
  type: CareEventType;
  /** Workspace-wide words: "Water Backyard", "Fertilize all gardens". */
  title: string;
  /** Target, then the repeat: "Raised bed A · Pepper · Every 3 days". */
  detail?: string;
  /** The target alone, as the Gardens home shows it: "Raised bed A · Pepper", "Whole garden". */
  target?: string;
  /** Garden-card words, where the card already names the garden: "Water Pepper", "Water whole garden". */
  localTitle: string;
  localDetail?: string;
  note?: string;
  /** "Due yesterday" on an open overdue task. */
  late?: string;
  dueDate?: string;
  done: boolean;
  owner: CareOwner;
  /** "all-gardens" or the garden ID. */
  location: string;
  /** An open task: tick it, edit it, delete it, or complete it on another date. */
  source?: CareRow<CareTask>;
  /** A task ticked off this visit: it can be unticked. */
  completion?: CareCompletion;
};

export type CareBoardDay = { date: string; weekday: string; day: number; rows: CareBoardRow[] };
export type CareBoardGarden = { garden: Garden; today: CareBoardRow[]; upcoming: CareBoardRow[]; left: number; total: number; areas: number };
export type CareBoard = {
  /** Today's rows for every location, as the Gardens home lists them (ADR-0081): ticks stay in place, records from elsewhere last. */
  today: CareBoardRow[];
  todo: CareBoardRow[];
  doneToday: CareBoardRow[];
  overdue: number;
  dueToday: number;
  progress: { done: number; total: number };
  days: CareBoardDay[];
  gardens: CareBoardGarden[];
  allGardens: { today: CareBoardRow[]; upcoming: CareBoardRow[] };
};

type CareSource = Pick<GardenWorkspace, "careEvents" | "careTasks" | "gardens">;

function rowText(record: CareTask | CareEvent, garden: Garden, repeat?: string) {
  const target = careTarget(record, garden);
  const { area, plant } = careTargetParts(record, garden);
  const localTitle = record.targetScope === "all-gardens" ? careTitle(record, garden) : careLocalTitle(record, { area, plant });
  const details = careDetailsText(record) || undefined;
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" · ") || undefined;
  return { title: careTitle(record, garden), detail: join(target, details, repeat), target, localTitle, localDetail: join(plant ? area : undefined, details, repeat) };
}

/**
 * Care as a Today board (ADR-0080). One projection feeds the band, the seven-day ribbon, and the
 * garden cards, so a task drawn twice on the page always reads and ticks the same in both places.
 * Done today comes from today's history records, whichever way they were written; only ticks
 * from this visit (`completions`) can be unticked.
 */
export function careBoard(workspace: CareSource, today: string, completions: CareCompletion[] = []): CareBoard {
  const root = workspaceCareGarden({ careEvents: workspace.careEvents, careTasks: workspace.careTasks });
  const sources = [root, ...workspace.gardens];
  const last = addDays(today, CARE_WINDOW_DAYS);
  const eventKey = (owner: CareOwner, id: string) => `${careLocationKey(owner)}:${id}`;
  const ticks = new Map(completions.map((completion) => [eventKey(completion.owner, completion.eventId), completion]));

  const open: (CareBoardRow & { dueDate: string; id: string })[] = [];
  for (const source of careRows(sources, "careTasks")) {
    const { record, owner, garden, key } = source;
    if (record.dueDate > last) continue;
    open.push({
      key, id: record.id, dueDate: record.dueDate, type: record.type, ...rowText(record, garden, careRepeat(record)),
      ...(record.note ? { note: record.note } : {}),
      ...(record.dueDate < today ? { late: careLateLabel(record.dueDate, today) } : {}),
      done: false, owner, location: careLocationKey(owner), source,
    });
  }
  open.sort(byDue);

  // Today's records, oldest first; a tick from this visit carries its task so it can be undone.
  const doneToday: (CareBoardRow & { order: string; id: string })[] = careRows(sources, "careEvents")
    .filter(({ record }) => record.date === today)
    .map(({ key, record, owner, garden }) => {
      const completion = ticks.get(eventKey(owner, record.id));
      const task = completion?.task;
      return {
        key: completion ? `done:${record.id}` : `done:${key}`, id: task?.id ?? record.id,
        // A tick keeps its task's place among today's rows in a garden card.
        order: task && task.dueDate < today ? task.dueDate : today,
        type: record.type, ...rowText(task ?? record, garden, task ? careRepeat(task) : undefined),
        done: true, owner, location: careLocationKey(owner), ...(completion ? { completion } : {}),
      };
    });

  const todo = open.filter((row) => row.dueDate <= today);
  const upcoming = open.filter((row) => row.dueDate > today);
  const strip = <T extends CareBoardRow>({ id: _id, order: _order, ...row }: T & { id: string; order?: string }): CareBoardRow => row;
  // Ticks stay where the task was; records from elsewhere follow the open rows. No location: every row.
  const todayIn = (location?: string) => {
    const here = (row: CareBoardRow) => location === undefined || row.location === location;
    return [
      ...[...todo, ...doneToday.filter((row) => row.completion).map((row) => ({ ...row, dueDate: row.order }))].filter(here).sort(byDue),
      ...doneToday.filter((row) => !row.completion && here(row)),
    ].map(strip);
  };
  const upcomingIn = (location: string) => upcoming.filter((row) => row.location === location).map(strip);

  return {
    today: todayIn(),
    todo: todo.map(strip),
    doneToday: doneToday.map(strip),
    overdue: todo.filter((row) => row.dueDate < today).length,
    dueToday: todo.filter((row) => row.dueDate === today).length,
    progress: { done: doneToday.length, total: todo.length + doneToday.length },
    days: Array.from({ length: CARE_WINDOW_DAYS }, (_, index) => {
      const date = addDays(today, index + 1);
      return { date, weekday: calendarLabel(date, { weekday: "short" }), day: Number(date.slice(8, 10)), rows: upcoming.filter((row) => row.dueDate === date).map(strip) };
    }),
    gardens: workspace.gardens.map((garden) => {
      const rows = todayIn(garden.id);
      const left = rows.filter((row) => !row.done).length;
      return { garden, today: rows, upcoming: upcomingIn(garden.id), left, total: rows.length, areas: garden.growingAreas.length };
    }),
    allGardens: { today: todayIn("all-gardens"), upcoming: upcomingIn("all-gardens") },
  };
}
