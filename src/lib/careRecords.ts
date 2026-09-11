import {
  plantDisplayName,
  type CareEvent,
  type CareEventTargetScope,
  type CareEventType,
  type CareTask,
  type Garden,
  type PlantingRecord,
} from "@/lib/gardenWorkspace";

export type CareForm = {
  type: CareEventType;
  date: string;
  note: string;
  targetScope: CareEventTargetScope;
  growingAreaId: string;
  plantingRecordId: string;
  fertilizerProduct: string;
  fertilizerAmount: string;
  fertilizerUnit: string;
};

export type CareTaskForm = {
  type: CareEventType;
  dueDate: string;
  note: string;
  targetScope: CareEventTargetScope;
  growingAreaId: string;
  plantingRecordId: string;
  repeatIntervalDays: string;
};

export function emptyCareForm(targetScope: CareEventTargetScope = "garden"): CareForm {
  return {
    type: "watering",
    date: "",
    note: "",
    targetScope,
    growingAreaId: "",
    plantingRecordId: "",
    fertilizerProduct: "",
    fertilizerAmount: "",
    fertilizerUnit: "",
  };
}

export function emptyCareTaskForm(targetScope: CareEventTargetScope = "garden"): CareTaskForm {
  return {
    type: "watering",
    dueDate: "",
    note: "",
    targetScope,
    growingAreaId: "",
    plantingRecordId: "",
    repeatIntervalDays: "",
  };
}

export function careTargetLabel(event: CareEvent | CareTask, gardenName?: string) {
  if (event.targetScope === "all-gardens") return "All gardens";
  if (event.targetScope === "garden") return gardenName ?? "Garden";
  if (event.targetScope === "plant-group")
    return event.targetPlantingRecordDeleted
      ? `Former plant group: ${event.plantingRecordName}`
      : event.plantingRecordName ?? "Plant group";
  return event.targetAreaDeleted
    ? `Former planting area: ${event.growingAreaName}`
    : event.growingAreaName ?? "Planting area";
}

export function plantGroupDisplayName(planting: PlantingRecord, garden: Garden) {
  const area = garden.growingAreas.find(
    (candidate) => candidate.id === planting.growingAreaId,
  );
  return `${plantDisplayName({ plantType: planting.plantType, variety: planting.variety, fallback: planting.commonName })} · ${area?.name ?? "Planting area"}`;
}

export function careFertilizerDetails(event: CareEvent) {
  const amount =
    event.fertilizerAmount === undefined
      ? undefined
      : `${event.fertilizerAmount}${event.fertilizerUnit ? ` ${event.fertilizerUnit}` : ""}`;
  return [
    event.fertilizerProduct,
    amount,
    amount ? undefined : event.fertilizerUnit,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
