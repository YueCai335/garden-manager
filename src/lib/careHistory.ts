import { careDetailsText } from "./careRecords";
import { calendarLabel, careDoneTitle, careTarget, daysBetween } from "./careLabels";
import { careLocationKey, careRows, workspaceCareGarden, type CareRow } from "./careViews";
import type { CareEvent, CareEventType, GardenWorkspace } from "./gardenWorkspace";

/** History shows this many records at first and adds this many on each Show earlier records (ADR-0080 D8). */
export const HISTORY_PAGE = 15;

/** "all" (every record), "all-gardens" (workspace-wide records), or a garden ID (ADR-0067). */
export type HistoryLocation = string;
export type HistoryType = "all" | CareEventType;
export type HistoryRow = { key: string; type: CareEventType; title: string; detail: string; note?: string; source: CareRow<CareEvent> };
export type HistoryDay = { date: string; label: string; month: string; day: number; rows: HistoryRow[] };

type CareSource = Pick<GardenWorkspace, "careEvents" | "careTasks" | "gardens">;

/**
 * Completed care only, newest day first and grouped by day (ADR-0080). Within a day the record
 * added last comes first. `limit` counts records, not days.
 */
export function careHistory(workspace: CareSource, options: { today: string; location?: HistoryLocation; type?: HistoryType; limit?: number }) {
  const { today, location = "all", type = "all", limit = HISTORY_PAGE } = options;
  const sources = [workspaceCareGarden({ careEvents: workspace.careEvents, careTasks: workspace.careTasks }), ...workspace.gardens];
  const matching = careRows(sources, "careEvents")
    .map((source, index) => ({ source, index }))
    .filter(({ source }) => (location === "all" || careLocationKey(source.owner) === location) && (type === "all" || source.record.type === type))
    .sort((a, b) => b.source.record.date.localeCompare(a.source.record.date) || b.index - a.index);
  const shown = matching.slice(0, Math.max(0, limit));
  const days: HistoryDay[] = [];
  for (const { source } of shown) {
    const { record, garden } = source;
    const date = record.date;
    if (days.at(-1)?.date !== date) {
      const ago = daysBetween(date, today);
      days.push({
        date, rows: [], day: Number(date.slice(8, 10)), month: calendarLabel(date, { month: "short" }),
        label: ago === 0 ? "Today" : ago === 1 ? "Yesterday" : calendarLabel(date, { weekday: "long" }),
      });
    }
    const details = careDetailsText(record);
    days.at(-1)!.rows.push({
      key: source.key, type: record.type, title: careDoneTitle(record, garden), source,
      detail: [careTarget(record, garden), details].filter(Boolean).join(" · ") || "Applies to every garden",
      ...(record.note ? { note: record.note } : {}),
    });
  }
  return { days, shown: shown.length, total: matching.length };
}
