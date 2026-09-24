import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GardenWorkspace, SERVER_WORKSPACE_STORAGE_KEY } from "@/components/GardenWorkspace";
import { createDemoGardenWorkspace, type GardenWorkspace as Workspace } from "@/lib/gardenWorkspace";
import type { SeasonAllocationResult } from "@/lib/seasonAllocation";

// Pinned so the demo garden's 2026 plantings fall inside the 2027 plan's history window.
const NOW = new Date("2026-09-24T12:00:00");

const draft: SeasonAllocationResult = {
  status: "draft",
  seasonYear: 2027,
  scope: {
    seasonYear: 2027,
    areas: [
      { id: "demo-raised-bed", name: "Sample raised bed", kind: "raised-bed" },
      { id: "demo-in-ground-area", name: "Sample in-ground area", kind: "in-ground" },
      { id: "demo-container-group", name: "Sample container group", kind: "container" },
    ],
    crops: ["tomato", "bean"],
    preference: "",
  },
  allocation: [
    { growingAreaId: "demo-container-group", crop: "tomato" },
    { growingAreaId: "demo-raised-bed", crop: "bean" },
  ],
  explanation: "Tomatoes move to the containers; beans follow tomatoes in the bed.",
  warnings: [],
  rotationSummary: [
    { growingAreaId: "demo-in-ground-area", year: 2026, rotationGroup: "legume" },
    { growingAreaId: "demo-raised-bed", year: 2026, rotationGroup: "nightshade" },
  ],
  missingInputs: [],
  failureReason: null,
  trace: [{ step: 1, tool: "get_planting_history", args: {}, shortResult: "2 history rows for 3 areas" }],
};

type SentWorkspace = Workspace & { revision: number };

/** A server-backed demo workspace whose saves are answered at once, or held until the test answers them. */
function serverHarness({ holdSaves = false } = {}) {
  const workspace = createDemoGardenWorkspace();
  let revision = 0;
  const saved: SentWorkspace[] = [];
  const held: Array<{ sent: SentWorkspace; resolve: (response: unknown) => void }> = [];
  const accept = (sent: SentWorkspace) => {
    revision += 1;
    saved.push(sent);
    return { ok: true, status: 200, json: async () => ({ ...sent, revision }) };
  };
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/runtime-config")) return Promise.resolve({ ok: true, json: async () => ({ portfolioDemo: false }) });
      if (url.includes("/season-allocation")) return Promise.resolve({ ok: true, status: 200, json: async () => draft });
      if (init?.method === "PUT") {
        const sent = JSON.parse(String(init.body)) as SentWorkspace;
        if (holdSaves) return new Promise((resolve) => held.push({ sent, resolve }));
        return Promise.resolve(accept(sent));
      }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ workspaceId: "server-workspace", revision, ...workspace }) });
    }),
  );
  window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, "server-workspace");
  return {
    saved,
    held,
    answerOldestSave() {
      const save = held.shift();
      if (!save) throw new Error("no held save");
      save.resolve(accept(save.sent));
    },
    failOldestSave() {
      const save = held.shift();
      if (!save) throw new Error("no held save");
      save.resolve({ ok: false, status: 500, json: async () => ({}) });
    },
  };
}

function plan2027(workspace: SentWorkspace | undefined) {
  return workspace?.gardens[0].seasonPlans
    ?.find((plan) => plan.seasonYear === 2027)
    ?.plantings.map((planting) => `${planting.commonName}@${planting.growingAreaId}`);
}

async function openPlanner(user: ReturnType<typeof userEvent.setup>) {
  render(<GardenWorkspace />);
  await user.click(await screen.findByRole("button", { name: "Next season plan" }));
  return screen.findByRole("region", { name: "Allocation Assistant" });
}

async function planTomatoAndBean(user: ReturnType<typeof userEvent.setup>, panel: HTMLElement) {
  await user.click(within(panel).getByRole("checkbox", { name: "Tomato" }));
  await user.click(within(panel).getByRole("checkbox", { name: "Bean" }));
  await waitFor(() => expect(within(panel).getByRole("button", { name: "Plan with AI" })).toBeEnabled());
  await user.click(within(panel).getByRole("button", { name: "Plan with AI" }));
  await within(panel).findByRole("region", { name: "Draft allocation" });
}

async function addPlanByHand(user: ReturnType<typeof userEvent.setup>, areaName: string, plantType: string) {
  const card = screen.getByRole("heading", { name: areaName, level: 3 }).closest("article")!;
  await user.click(within(card).getByRole("button", { name: "Choose a plant" }));
  fireEvent.change(within(card).getByLabelText("Plant type"), { target: { value: plantType } });
  await user.click(within(card).getByRole("button", { name: "Add to 2027 plan" }));
}

describe("Allocation Assistant in the Season Planner", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("appends a confirmed draft to the 2027 plan in one saved change", async () => {
    const user = userEvent.setup();
    const server = serverHarness();
    const panel = await openPlanner(user);

    await planTomatoAndBean(user, panel);
    const savesBefore = server.saved.length;
    await user.click(within(panel).getByRole("button", { name: "Add to 2027 plan" }));

    expect(await within(panel).findByText("Added 2, skipped 0 already in the 2027 plan.")).toBeInTheDocument();
    await waitFor(() => expect(server.saved.length).toBe(savesBefore + 1));
    expect(plan2027(server.saved.at(-1))).toEqual(["Tomato@demo-container-group", "Bean@demo-raised-bed"]);
    expect(within(panel).getByRole("button", { name: "Add to 2027 plan" })).toBeDisabled();
  });

  it("keeps plan entries added after the draft and confirms against the newest workspace", async () => {
    const user = userEvent.setup();
    const server = serverHarness();
    const panel = await openPlanner(user);

    await planTomatoAndBean(user, panel);
    await addPlanByHand(user, "Sample raised bed", "Kale");
    await user.click(within(panel).getByRole("button", { name: "Add to 2027 plan" }));

    await waitFor(() =>
      expect(plan2027(server.saved.at(-1))).toEqual([
        "Kale@demo-raised-bed",
        "Tomato@demo-container-group",
        "Bean@demo-raised-bed",
      ]),
    );
  });

  it("re-reads the season year at the moment of confirmation", async () => {
    const user = userEvent.setup();
    const server = serverHarness();
    const panel = await openPlanner(user);

    await planTomatoAndBean(user, panel);
    const savesBefore = server.saved.length;
    vi.setSystemTime(new Date("2027-01-01T00:00:05"));
    await user.click(within(panel).getByRole("button", { name: "Add to 2027 plan" }));

    expect(within(panel).getByText("This draft is out of date. Plan again before adding it.")).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(server.saved.length).toBe(savesBefore);
  });

  it("keeps planning disabled until every queued save is confirmed", async () => {
    const user = userEvent.setup();
    const server = serverHarness({ holdSaves: true });
    const panel = await openPlanner(user);
    await user.click(within(panel).getByRole("checkbox", { name: "Tomato" }));
    const planButton = () => within(panel).getByRole("button", { name: "Plan with AI" });
    await waitFor(() => expect(planButton()).toBeEnabled());

    // Two quick edits: the first save is sent, the second waits in the queue.
    await addPlanByHand(user, "Sample raised bed", "Kale");
    await waitFor(() => expect(server.held).toHaveLength(1));
    await addPlanByHand(user, "Sample in-ground area", "Carrot");
    expect(planButton()).toBeDisabled();

    server.answerOldestSave();
    await waitFor(() => expect(server.held).toHaveLength(1));
    // The first save finished, but the second edit is still unsaved.
    expect(planButton()).toBeDisabled();

    server.answerOldestSave();
    await waitFor(() => expect(planButton()).toBeEnabled());
  });

  it("stays disabled when an edit is undone while its saves are still pending", async () => {
    const user = userEvent.setup();
    const server = serverHarness({ holdSaves: true });
    const panel = await openPlanner(user);
    await user.click(within(panel).getByRole("checkbox", { name: "Tomato" }));
    const planButton = () => within(panel).getByRole("button", { name: "Plan with AI" });
    await waitFor(() => expect(planButton()).toBeEnabled());

    // A -> B: add Kale; the save of B is sent and held.
    await addPlanByHand(user, "Sample raised bed", "Kale");
    await waitFor(() => expect(server.held).toHaveLength(1));
    // B -> A: remove it again. The content matches the saved copy, but B and A are still unsaved.
    const card = screen.getByRole("heading", { name: "Sample raised bed", level: 3 }).closest("article")!;
    await user.click(within(card).getByRole("button", { name: "Remove" }));
    expect(planButton()).toBeDisabled();

    server.answerOldestSave();
    await waitFor(() => expect(server.held).toHaveLength(1));
    expect(planButton()).toBeDisabled();

    server.answerOldestSave();
    await waitFor(() => expect(planButton()).toBeEnabled());
  });

  it("keeps planning disabled after a failed save", async () => {
    const user = userEvent.setup();
    const server = serverHarness({ holdSaves: true });
    const panel = await openPlanner(user);
    await user.click(within(panel).getByRole("checkbox", { name: "Tomato" }));

    await addPlanByHand(user, "Sample raised bed", "Kale");
    await waitFor(() => expect(server.held).toHaveLength(1));
    server.failOldestSave();
    // Let the failed response settle; the save request has ended but nothing was confirmed.
    await new Promise((resolve) => setTimeout(resolve, 30));

    expect(within(panel).getByRole("button", { name: "Plan with AI" })).toBeDisabled();
    expect(within(panel).getByText("Waiting for your latest changes to save before planning.")).toBeInTheDocument();
  });
});
