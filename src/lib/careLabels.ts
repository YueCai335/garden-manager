import { careTargetLabel } from "./careRecords";
import { carePathLabel } from "./careViews";
import { addDays, type CareEvent, type CareEventType, type CareTask, type Garden } from "./gardenWorkspace";

/**
 * The words Gardens (ADR-0081) and Care (ADR-0080) both use for a care row, so the two pages
 * describe the same task the same way.
 */

/** The five care types (ADR-0085) as a task verb, a done verb, and a lowercase noun. */
export const careTypeVerb: Record<CareEventType, string> = {
  watering: "Water", fertilizing: "Fertilize", planting: "Plant", pruning: "Prune", "pest-treatment": "Treat pests",
};
export const careTypeDoneVerb: Record<CareEventType, string> = {
  watering: "Watered", fertilizing: "Fertilized", planting: "Planted", pruning: "Pruned", "pest-treatment": "Treated pests",
};
export const careTypeNoun: Record<CareEventType, string> = {
  watering: "watering", fertilizing: "fertilizing", planting: "planting", pruning: "pruning", "pest-treatment": "pest treatment",
};
/** The type's name in forms, filters, and messages: "Pest treatment task added." */
export const careTypeName: Record<CareEventType, string> = {
  watering: "Watering", fertilizing: "Fertilizing", planting: "Planting", pruning: "Pruning", "pest-treatment": "Pest treatment",
};

type Titled = Pick<CareTask, "type" | "targetScope"> & { plantName?: string };

/** "Plant Basil in", "Treat pests in", or the verb alone, ready for a place. */
function titleLead(record: Titled, verbs: Record<CareEventType, string>) {
  if (record.type === "planting") return record.plantName ? `${verbs.planting} ${record.plantName} in` : `${verbs.planting} in`;
  if (record.type === "pest-treatment") return `${verbs["pest-treatment"]} in`;
  return verbs[record.type];
}

/** Verb and place: "Water Front garden", "Plant Basil in Front Yard", "Treat pests in all gardens". */
export function careTitle(record: Titled, garden: Garden) {
  return `${titleLead(record, careTypeVerb)} ${record.targetScope === "all-gardens" ? "all gardens" : garden.name}`;
}

/** History's past tense: "Watered Front garden", "Planted Basil in Front Yard". */
export function careDoneTitle(record: Titled, garden: Garden) {
  return `${titleLead(record, careTypeDoneVerb)} ${record.targetScope === "all-gardens" ? "all gardens" : garden.name}`;
}

/**
 * The title inside a garden card, where the garden name is already shown: "Prune Pepper",
 * "Plant Basil", "Treat pests on Kale", "Water whole garden".
 */
export function careLocalTitle(record: Titled, place: { area?: string; plant?: string }) {
  const where = place.plant ?? place.area ?? "whole garden";
  if (record.type === "planting") return record.plantName ? `Plant ${record.plantName}` : `Plant in ${where}`;
  if (record.type === "pest-treatment") return place.plant ? `Treat pests on ${place.plant}` : `Treat pests in ${where}`;
  return `${careTypeVerb[record.type]} ${where}`;
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
