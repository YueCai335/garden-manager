import { describe, expect, it } from "vitest";
import { createGarden, type Garden } from "./gardenWorkspace";
import { emptyPlanHistory, PLAN_HISTORY_LIMIT, recordPlanChange, redoPlanChange, undoPlanChange } from "./planHistory";

const garden = (widthMeters: number, id = "home"): Garden => ({ ...createGarden("Home"), id, plan: { widthMeters, depthMeters: 6 } });
const change = (from: number, to: number, label = `width ${to}`) => ({ label, before: garden(from), after: garden(to) });

describe("Garden Plan undo history", () => {
  it("undoes and redoes in order, writing the stored gardens forward", () => {
    let history = recordPlanChange(emptyPlanHistory(), "home", change(10, 11));
    history = recordPlanChange(history, "home", change(11, 12));
    const first = undoPlanChange(history, "home", garden(12));
    expect(first).toMatchObject({ status: "applied", label: "width 12", garden: garden(11) });
    const second = undoPlanChange(first.history, "home", garden(11));
    expect(second).toMatchObject({ status: "applied", garden: garden(10) });
    expect(undoPlanChange(second.history, "home", garden(10)).status).toBe("empty");
    const redo = redoPlanChange(second.history, "home", garden(10));
    expect(redo).toMatchObject({ status: "applied", label: "width 11", garden: garden(11) });
    expect(redo.history.undo).toHaveLength(1);
    expect(redo.history.redo).toHaveLength(1);
  });

  it("drops redo steps after a new change", () => {
    let history = recordPlanChange(emptyPlanHistory(), "home", change(10, 11));
    history = undoPlanChange(history, "home", garden(11)).history;
    expect(history.redo).toHaveLength(1);
    history = recordPlanChange(history, "home", change(10, 13));
    expect(history.redo).toEqual([]);
    expect(redoPlanChange(history, "home", garden(13)).status).toBe("empty");
  });

  it(`keeps at most ${PLAN_HISTORY_LIMIT} steps, dropping the oldest`, () => {
    let history = emptyPlanHistory();
    for (let width = 1; width <= PLAN_HISTORY_LIMIT + 5; width++) history = recordPlanChange(history, "home", change(width, width + 1));
    expect(history.undo).toHaveLength(PLAN_HISTORY_LIMIT);
    expect(history.undo[0].label).toBe("width 7");
  });

  it("merges a follow-up update from the same action into one step", () => {
    let history = recordPlanChange(emptyPlanHistory(), "home", change(10, 11, "remove Kale"));
    history = recordPlanChange(history, "home", change(11, 12, "archive record"), true);
    expect(history.undo).toEqual([{ label: "remove Kale", before: garden(10), after: garden(12) }]);
    // A merge that does not continue from the newest step stays a separate step.
    history = recordPlanChange(history, "home", change(20, 21), true);
    expect(history.undo).toHaveLength(2);
  });

  it("ignores changes that change nothing", () => {
    expect(recordPlanChange(emptyPlanHistory(), "home", change(10, 10)).undo).toEqual([]);
  });

  it("starts over in another garden and never applies one garden's steps to another", () => {
    let history = recordPlanChange(emptyPlanHistory(), "home", change(10, 11));
    expect(undoPlanChange(history, "allotment", garden(11, "allotment")).status).toBe("empty");
    history = recordPlanChange(history, "allotment", { label: "width", before: garden(3, "allotment"), after: garden(4, "allotment") });
    expect(history).toMatchObject({ gardenId: "allotment", undo: [{ label: "width" }] });
  });

  it("clears instead of overwriting a garden that changed outside the history", () => {
    const history = recordPlanChange(emptyPlanHistory(), "home", change(10, 11));
    const changedElsewhere = { ...garden(11), name: "Renamed in another tab" };
    expect(undoPlanChange(history, "home", changedElsewhere)).toEqual({ status: "stale", history: emptyPlanHistory() });
    const undone = undoPlanChange(history, "home", garden(11)).history;
    expect(redoPlanChange(undone, "home", changedElsewhere).status).toBe("stale");
    expect(undoPlanChange(history, "home", undefined).status).toBe("stale");
  });
});
