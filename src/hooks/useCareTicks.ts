"use client";

import { useState } from "react";
import { careEventForTask, completeCareTask, undoCareTaskCompletion, type CareOwner, type CareRecords } from "@/lib/careViews";
import { createId, todayDate, type CareTask } from "@/lib/gardenWorkspace";
import type { CareCompletion } from "@/lib/careBoard";

/** Where the keyboard goes after a tick: the row's circle, in the list (`region`) the click came from. */
export type TickFocus = { key: string; region?: string };

/**
 * Ticking care off in place, shared by Gardens (ADR-0081) and Care (ADR-0080). A tick completes
 * the task today and writes its history record to the task's own owner; it can be undone until the
 * page is left. `update` applies a change to one owner's care records.
 */
export function useCareTicks(update: (owner: CareOwner, change: (records: CareRecords) => CareRecords) => void) {
  const [completions, setCompletions] = useState<CareCompletion[]>([]);
  const [focus, setFocus] = useState<TickFocus>();
  const tick = (row: { key: string; owner: CareOwner; task?: CareTask }, region?: string) => {
    const { task, owner } = row;
    if (!task) return;
    const event = careEventForTask(task, todayDate(), owner, createId("care"));
    update(owner, (records) => completeCareTask(records, task, event));
    setCompletions((current) => [...current, { taskKey: row.key, task, owner, eventId: event.id }]);
    setFocus({ key: `done:${event.id}`, region });
  };
  const untick = (completion: CareCompletion | undefined, region?: string) => {
    if (!completion) return;
    update(completion.owner, (records) => undoCareTaskCompletion(records, completion.task, completion.eventId));
    setCompletions((current) => current.filter((item) => item !== completion));
    setFocus({ key: completion.taskKey, region });
  };
  return { completions, focus, tick, untick };
}
