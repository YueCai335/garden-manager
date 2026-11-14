import { createGarden, createGardenWorkspace, type CareEvent } from "@/lib/gardenWorkspace";

export function careFixture() {
  const workspace = createGardenWorkspace("Front garden");
  workspace.gardens[0].id = "front";
  workspace.selectedGardenId = "front";
  workspace.gardens.push({ ...createGarden("Back garden"), id: "back" });
  const record = (id: string, note: string): CareEvent => ({ id, note, type: "watering", date: "2026-06-01", targetScope: "garden" });
  workspace.gardens[0].careEvents = [record("same", "Front one"), record("front-2", "Front two")];
  workspace.gardens[1].careEvents = [record("same", "Back one"), record("back-2", "Back two"), record("back-3", "Back three")];
  workspace.careEvents = [{ ...record("root", "Every garden"), targetScope: "all-gardens" }];
  workspace.gardens[0].careTasks = [{ id: "repeat", note: "Front task", type: "watering", dueDate: "2026-06-01", targetScope: "garden" }];
  workspace.gardens[1].careTasks = [{ id: "repeat", note: "Back repeat", type: "watering", dueDate: "2026-06-01", targetScope: "garden", repeatIntervalDays: 3 }];
  return workspace;
}

