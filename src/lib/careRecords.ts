import {
  careDetailFields,
  MAX_PLANT_COUNT,
  plantDisplayName,
  type CareDetailField,
  type CareDetails,
  type CareEvent,
  type CareEventTargetScope,
  type CareEventType,
  type CareTask,
  type Garden,
  type PlantingRecord,
} from "@/lib/gardenWorkspace";

/** The detail inputs every care form holds as text; only the chosen type's are saved (ADR-0085). */
export type CareDetailsForm = Record<CareDetailField, string>;

export type CareForm = CareDetailsForm & {
  type: CareEventType;
  date: string;
  note: string;
  targetScope: CareEventTargetScope;
  growingAreaId: string;
  plantingRecordId: string;
};

export type CareTaskForm = CareDetailsForm & {
  type: CareEventType;
  dueDate: string;
  note: string;
  targetScope: CareEventTargetScope;
  growingAreaId: string;
  plantingRecordId: string;
  repeatIntervalDays: string;
};

export function emptyCareDetailsForm(): CareDetailsForm {
  return { fertilizerProduct: "", fertilizerAmount: "", fertilizerUnit: "", plantName: "", plantCount: "", pruneDetail: "", pestProblem: "", pestTreatment: "" };
}

/** A saved record's or task's details as form text. */
export function careDetailsForm(record: CareDetails): CareDetailsForm {
  const form = emptyCareDetailsForm();
  for (const field of Object.keys(form) as CareDetailField[]) {
    const value = record[field];
    if (value !== undefined) form[field] = String(value);
  }
  return form;
}

/** Whether the form's details differ from a saved record's, for the chosen type only. */
export function careDetailsChanged(type: CareEventType, form: Partial<CareDetailsForm>, record: CareDetails) {
  return careDetailFields[type].some((field) => (form[field] ?? "").trim() !== String(record[field] ?? ""));
}

export type CareDetailsResult = { details: CareDetails } | { error: string; field: CareDetailField };

/**
 * The chosen type's details from form text: blank text is left out, an amount must be above zero,
 * and a plant count is a whole number from 1 to 999. Other types' fields are ignored.
 * `form` is partial because a draft kept from before ADR-0085 has no new fields.
 */
export function careDetailsFromForm(type: CareEventType, form: Partial<CareDetailsForm>): CareDetailsResult {
  const details: CareDetails = {};
  for (const field of careDetailFields[type]) {
    const text = (form[field] ?? "").trim();
    if (!text) continue;
    if (field === "fertilizerAmount") {
      const amount = Number(text);
      if (!Number.isFinite(amount) || amount <= 0) return { error: "Enter a fertilizer amount greater than zero.", field };
      details.fertilizerAmount = amount;
    } else if (field === "plantCount") {
      const count = Number(text);
      if (!Number.isInteger(count) || count < 1 || count > MAX_PLANT_COUNT) return { error: `Enter a whole number of plants from 1 to ${MAX_PLANT_COUNT}.`, field };
      details.plantCount = count;
    } else {
      details[field] = text;
    }
  }
  return { details };
}

export function emptyCareForm(targetScope: CareEventTargetScope = "garden"): CareForm {
  return {
    type: "watering",
    date: "",
    note: "",
    targetScope,
    growingAreaId: "",
    plantingRecordId: "",
    ...emptyCareDetailsForm(),
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
    ...emptyCareDetailsForm(),
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

export function careFertilizerDetails(event: CareDetails) {
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

/**
 * A record's or task's details as one short line, for example "Fish emulsion · 50 ml",
 * "2 plants", "Side shoots", or "Aphids · Soap spray". The plant name is in the title instead.
 */
export function careDetailsText(record: CareDetails & { type: CareEventType }) {
  switch (record.type) {
    case "fertilizing": return careFertilizerDetails(record);
    case "planting": return record.plantCount ? `${record.plantCount} ${record.plantCount === 1 ? "plant" : "plants"}` : "";
    case "pruning": return record.pruneDetail ?? "";
    case "pest-treatment": return [record.pestProblem, record.pestTreatment].filter(Boolean).join(" · ");
    default: return "";
  }
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
