import { careTargetLabel } from "./careRecords";
import { carePathLabel } from "./careViews";
import { addDays, type CareEvent, type CareTask, type Garden } from "./gardenWorkspace";

/**
 * The words Gardens (ADR-0081) and Care (ADR-0080) both use for a care row, so the two pages
 * describe the same task the same way.
 */

/** Verb and place, for example "Water Front garden" or "Fertilize all gardens". */
export function careTitle(record: CareTask | CareEvent, garden: Garden) {
  const verb = record.type === "watering" ? "Water" : "Fertilize";
  return `${verb} ${record.targetScope === "all-gardens" ? "all gardens" : garden.name}`;
}

/** History's past tense: "Watered Front garden", "Fertilized all gardens". */
export function careDoneTitle(record: CareEvent, garden: Garden) {
  const verb = record.type === "watering" ? "Watered" : "Fertilized";
  return `${verb} ${record.targetScope === "all-gardens" ? "all gardens" : garden.name}`;
}

/** The part below the garden: a planting area, an area and a plant group, or the whole garden. */
export function careTarget(record: CareTask | CareEvent, garden: Garden) {
  if (record.targetScope === "planting-area") return careTargetLabel(record);
  if (record.targetScope === "plant-group") {
    const { area, plant } = careTargetParts(record, garden);
    return [area, plant].filter(Boolean).join(" · ");
  }
  if (record.targetScope === "garden") return "Whole garden";
  return undefined;
}

/** The target split for a garden card, where the garden name is already the card's title. */
export function careTargetParts(record: CareTask | CareEvent, garden: Garden): { area?: string; plant?: string } {
  if (record.targetScope === "planting-area") return { area: careTargetLabel(record) };
  if (record.targetScope !== "plant-group") return {};
  const parts = carePathLabel(record, garden).slice(garden.name.length + 3).split(" / ");
  return parts.length > 1 ? { area: parts[0], plant: parts.slice(1).join(" / ") } : { plant: parts[0] };
}

/** "Every 3 days" for a repeating task. */
export function careRepeat(task: CareTask) {
  return task.repeatIntervalDays ? `Every ${task.repeatIntervalDays} ${task.repeatIntervalDays === 1 ? "day" : "days"}` : undefined;
}

export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** For an overdue task: "Due yesterday" or "Due 3 days ago". */
export function careLateLabel(dueDate: string, today: string) {
  const days = daysBetween(dueDate, today);
  return days === 1 ? "Due yesterday" : `Due ${days} days ago`;
}

/** A calendar date read in UTC, so the label never shifts with the viewer's time zone. */
export function calendarLabel(date: string, options: Intl.DateTimeFormatOptions) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

/** For a task in the next seven days: "Tomorrow" or a short weekday. */
export function careWhenLabel(dueDate: string, today: string) {
  if (dueDate === addDays(today, 1)) return "Tomorrow";
  return calendarLabel(dueDate, { weekday: "short" });
}

/** Earliest due first; equal dates keep a stable order. */
export const byDue = (a: { dueDate: string; id: string; key?: string }, b: { dueDate: string; id: string; key?: string }) =>
  a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id) || (a.key ?? "").localeCompare(b.key ?? "");
