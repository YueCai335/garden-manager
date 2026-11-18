import { describe, expect, it } from "vitest";
import { careHistory } from "./careHistory";
import { createGarden, createGardenWorkspace, type CareEvent } from "./gardenWorkspace";

const TODAY = "2026-11-16";
const event = (id: string, date: string, extra: Partial<CareEvent> = {}): CareEvent => ({ id, date, type: "watering", note: "", targetScope: "garden", ...extra });

function workspace() {
  const value = createGardenWorkspace("Backyard");
  value.gardens[0].id = "back";
  value.gardens.push({ ...createGarden("Front Yard"), id: "front" });
  value.gardens.forEach((garden) => { garden.careTasks = []; garden.careEvents = []; });
  value.careTasks = [{ id: "open", type: "watering", dueDate: "2026-11-01", note: "Overdue task", targetScope: "all-gardens" }];
  value.careEvents = [event("root", "2026-11-13", { targetScope: "all-gardens", type: "fertilizing", fertilizerProduct: "Fish emulsion", fertilizerAmount: 30, fertilizerUnit: "mL" })];
  value.gardens[0].careEvents = [event("b1", "2026-11-14"), event("b2", "2026-11-14", { note: "Long soak\nsecond line" }), event("b3", TODAY)];
  value.gardens[1].careEvents = [event("f1", "2026-11-15", { type: "fertilizing" }), event("f2", "2026-11-02")];
  return value;
}

describe("Care history (ADR-0080)", () => {
  it("groups completed care by day, newest first, with the last added record first within a day", () => {
    const history = careHistory(workspace(), { today: TODAY });
    expect(history.days.map(({ date, label, month, day }) => [date, label, month, day])).toEqual([
      ["2026-11-16", "Today", "Nov", 16], ["2026-11-15", "Yesterday", "Nov", 15], ["2026-11-14", "Saturday", "Nov", 14],
      ["2026-11-13", "Friday", "Nov", 13], ["2026-11-02", "Monday", "Nov", 2],
    ]);
    expect(history.days[2].rows.map(({ source, note }) => [source.record.id, note])).toEqual([["b2", "Long soak\nsecond line"], ["b1", undefined]]);
    expect(history.days[3].rows[0]).toMatchObject({ title: "Fertilized all gardens", detail: "Fish emulsion · 30 mL" });
    expect(history.days[1].rows[0]).toMatchObject({ title: "Fertilized Front Yard", detail: "Whole garden" });
    // Only records: the overdue task never appears.
    expect(history.days.flatMap((day) => day.rows).some((row) => row.note === "Overdue task")).toBe(false);
    expect({ shown: history.shown, total: history.total }).toEqual({ shown: 6, total: 6 });
  });

  it("filters by location and care type and counts the total before the limit", () => {
    const value = workspace();
    expect(careHistory(value, { today: TODAY, location: "back" }).total).toBe(3);
    expect(careHistory(value, { today: TODAY, location: "all-gardens" }).days.map((day) => day.date)).toEqual(["2026-11-13"]);
    expect(careHistory(value, { today: TODAY, type: "fertilizing" }).total).toBe(2);
    expect(careHistory(value, { today: TODAY, location: "front", type: "watering" }).days.map((day) => day.rows[0].source.record.id)).toEqual(["f2"]);
    const limited = careHistory(value, { today: TODAY, limit: 3 });
    expect({ shown: limited.shown, total: limited.total }).toEqual({ shown: 3, total: 6 });
    expect(limited.days.flatMap((day) => day.rows.map((row) => row.source.record.id))).toEqual(["b3", "f1", "b2"]);
  });

  it("names a deleted planting area as a former one", () => {
    const value = workspace();
    value.gardens[0].careEvents = [event("gone", TODAY, { targetScope: "planting-area", growingAreaId: "old", growingAreaName: "Old bed", targetAreaDeleted: true })];
    expect(careHistory(value, { today: TODAY, location: "back" }).days[0].rows[0].detail).toBe("Former planting area: Old bed");
  });
});
