import { addDays, careTaskStatus, todayDate, type GardenWorkspace } from "./gardenWorkspace";
import { careRows, workspaceCareGarden } from "./careViews";

/** Share global Care ownership and deduplication semantics. */
export function homeTasks(workspace: GardenWorkspace, today = todayDate()) {
  const cutoff = addDays(today, 7);
  const counts = { overdue: 0, "due-today": 0, upcoming: 0 };
  const tasks = careRows([workspaceCareGarden(workspace), ...workspace.gardens], "careTasks")
    .filter(({ record }) => record.dueDate <= cutoff)
    .map(({ key, record, owner, targetLabel }) => {
      const status = careTaskStatus(record, today);
      counts[status]++;
      return { key, task: record, gardenId: owner.ownerScope === "garden" ? owner.gardenId : undefined, location: targetLabel, status };
    });
  tasks.sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate) || a.task.id.localeCompare(b.task.id));
  return { counts, recent: tasks.slice(0, 5) };
}
