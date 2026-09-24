import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AllocationAssistant, type AllocationConfirmOutcome } from "@/components/AllocationAssistant";
import type { Garden, GrowingAreaKind } from "@/lib/gardenWorkspace";
import type { SeasonAllocationResult } from "@/lib/seasonAllocation";

const seasonYear = new Date().getFullYear() + 1;
const lastYear = seasonYear - 1;

function garden(areas: { id: string; name: string; kind: GrowingAreaKind }[], id = "garden-1"): Garden {
  return {
    id,
    name: "Home garden",
    plan: { widthMeters: 10, depthMeters: 6 },
    growingAreas: areas.map((area) => ({ ...area, planPlacement: { x: 0, y: 0, rotationDegrees: 0 } })),
    plantings: [
      { id: "tomatoes", commonName: "Tomatoes", cropFamily: "nightshade", quantity: 4, plantingDate: `${lastYear}-05-01`, growingAreaId: "bed", isActive: true },
    ],
    seasonPlans: [],
    careEvents: [],
    careTasks: [],
    healthRecords: [],
  };
}

const twoAreas = garden([
  { id: "bed", name: "North bed", kind: "raised-bed" },
  { id: "ground", name: "Back plot", kind: "in-ground" },
]);

function draftResponse(overrides: Partial<SeasonAllocationResult> = {}): SeasonAllocationResult {
  return {
    status: "draft",
    seasonYear,
    scope: {
      seasonYear,
      areas: [
        { id: "bed", name: "North bed", kind: "raised-bed" },
        { id: "ground", name: "Back plot", kind: "in-ground" },
      ],
      crops: ["tomato", "bean"],
      preference: "tomatoes near the path",
    },
    allocation: [
      { growingAreaId: "bed", crop: "tomato" },
      { growingAreaId: "ground", crop: "bean" },
    ],
    explanation: "Tomatoes stay near the path even though the bed grew them last year.",
    warnings: [
      {
        growingAreaId: "bed",
        crop: "tomato",
        rotationGroup: "nightshade",
        warning: true,
        repeatedYears: [lastYear],
        rotationFriendlyGroups: ["legume"],
      },
    ],
    rotationSummary: [{ growingAreaId: "bed", year: lastYear, rotationGroup: "nightshade" }],
    missingInputs: [],
    failureReason: null,
    trace: [
      { step: 1, tool: "get_planting_history", args: {}, shortResult: "1 history rows for 2 areas" },
      {
        step: 2,
        tool: "check_allocation",
        args: { assignments: [{ growing_area_id: "bed", crop: "tomato" }] },
        shortResult: "2 checked, 1 rotation warnings",
      },
    ],
    ...overrides,
  };
}

function respondWith(body: unknown, status = 200) {
  const fetch = vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function renderPanel(props: Partial<Parameters<typeof AllocationAssistant>[0]> = {}) {
  const onConfirm = vi.fn<Parameters<typeof AllocationAssistant>[0]["onConfirm"]>(() => ({
    status: "added",
    added: 2,
    skipped: 0,
    seasonYear,
  }));
  const view = render(
    <AllocationAssistant
      garden={twoAreas}
      isPortfolioDemo={false}
      isSynced
      onConfirm={onConfirm}
      workspaceId="server-workspace"
      {...props}
    />,
  );
  return { ...view, onConfirm };
}

async function fillAndPlan(user: ReturnType<typeof userEvent.setup>, preference = "tomatoes near the path") {
  await user.click(screen.getByRole("checkbox", { name: "Tomato" }));
  await user.click(screen.getByRole("checkbox", { name: "Bean" }));
  await user.type(screen.getByLabelText("Preference (optional)"), preference);
  await user.click(screen.getByRole("button", { name: "Plan with AI" }));
}

const confirmButton = () => screen.queryByRole("button", { name: `Add to ${seasonYear} plan` });

describe("AllocationAssistant", () => {
  it("sends a camelCase request and shows the draft, warnings, explanation, and ordered steps", async () => {
    const user = userEvent.setup();
    const fetch = respondWith(draftResponse());
    const { onConfirm } = renderPanel();

    await fillAndPlan(user);

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/workspaces\/server-workspace\/gardens\/garden-1\/ai\/season-allocation$/);
    expect(JSON.parse(String(init.body))).toEqual({ crops: ["tomato", "bean"], preference: "tomatoes near the path" });

    const draft = await screen.findByRole("region", { name: "Draft allocation" });
    expect(within(draft).getByText("North bed")).toBeInTheDocument();
    expect(within(draft).getByText("Tomato")).toBeInTheDocument();
    expect(within(draft).getByText(`Rotation warning: Tomato is nightshade, grown here in ${lastYear}.`)).toBeInTheDocument();
    expect(within(draft).getByText(/Tomatoes stay near the path/)).toBeInTheDocument();

    const steps = within(screen.getByRole("region", { name: "Agent steps" })).getAllByRole("listitem");
    expect(steps.map((step) => step.textContent)).toEqual([
      "Step 1 · get_planting_history{}1 history rows for 2 areas",
      'Step 2 · check_allocation{"assignments":[{"growing_area_id":"bed","crop":"tomato"}]}2 checked, 1 rotation warnings',
    ]);

    await user.click(confirmButton()!);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm.mock.calls[0][2]).toEqual({ crops: ["tomato", "bean"], preference: "tomatoes near the path", chosenAreaIds: [] });
    expect(await screen.findByText(`Added 2, skipped 0 already in the ${seasonYear} plan.`)).toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
  });

  it("sends growingAreaIds only when more than three eligible areas require a choice", async () => {
    const user = userEvent.setup();
    const fetch = respondWith(draftResponse({ status: "needs_input", scope: null }));
    renderPanel({
      garden: garden([
        { id: "a", name: "Bed A", kind: "raised-bed" },
        { id: "b", name: "Bed B", kind: "raised-bed" },
        { id: "c", name: "Bed C", kind: "container" },
        { id: "d", name: "Bed D", kind: "in-ground" },
        { id: "g", name: "Glasshouse", kind: "greenhouse" },
      ]),
    });

    expect(screen.queryByRole("checkbox", { name: "Glasshouse" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Tomato" }));
    expect(screen.getByRole("button", { name: "Plan with AI" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Bed D" }));
    await user.click(screen.getByRole("checkbox", { name: "Bed A" }));
    await user.click(screen.getByRole("checkbox", { name: "Bed B" }));
    expect(screen.getByRole("checkbox", { name: "Bed C" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Plan with AI" }));

    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ crops: ["tomato"], preference: "", growingAreaIds: ["a", "b", "d"] });
  });

  it("does not ask for areas when greenhouses are the only extra areas", async () => {
    renderPanel({
      garden: garden([
        { id: "bed", name: "North bed", kind: "raised-bed" },
        { id: "g1", name: "Glass one", kind: "greenhouse" },
        { id: "bed-2", name: "South bed", kind: "raised-bed" },
        { id: "g2", name: "Glass two", kind: "greenhouse" },
      ]),
    });

    expect(screen.queryByRole("group", { name: /Planting areas/ })).not.toBeInTheDocument();
    expect(screen.getByText("North bed · South bed")).toBeInTheDocument();
  });

  it.each([
    ["needs_input", draftResponse({ status: "needs_input", scope: null, missingInputs: ["Choose up to 3 growing areas for this plan."] }), "Choose up to 3 growing areas for this plan."],
    ["budget_exhausted", draftResponse({ status: "budget_exhausted", allocation: [] }), "The portfolio demo has used its AI run budget. No plan was created."],
    ["provider_unavailable", draftResponse({ status: "provider_unavailable", allocation: [] }), "The AI planner is not available right now. No plan was created."],
    ["generation_failed", draftResponse({ status: "generation_failed", allocation: [], failureReason: "step_limit" }), "It used all five model requests without finishing."],
  ])("offers no confirm action for a %s result", async (_status, body, message) => {
    const user = userEvent.setup();
    respondWith(body);
    renderPanel();

    await fillAndPlan(user);

    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(confirmButton()).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Draft allocation" })).not.toBeInTheDocument();
  });

  it.each([
    [429, { detail: "Another example run is in progress. Try again in a moment." }, "Another example run is in progress. Try again in a moment."],
    [404, { detail: "The portfolio demo plans the demo garden only." }, "The portfolio demo plans the demo garden only."],
    [422, { detail: [{ msg: "too long" }] }, "The Allocation Assistant could not handle this request. Nothing was changed."],
    [500, {}, "The Allocation Assistant could not handle this request. Nothing was changed."],
  ])("shows an error and no draft for HTTP %s", async (status, body, message) => {
    const user = userEvent.setup();
    respondWith(body, status);
    renderPanel();

    await fillAndPlan(user);

    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(confirmButton()).not.toBeInTheDocument();
  });

  it("shows a connection error when the server cannot be reached", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    renderPanel();

    await fillAndPlan(user);

    expect(await screen.findByRole("alert")).toHaveTextContent("The garden server could not be reached.");
  });

  it("disables confirmation when the preference, crops, or history change after the draft", async () => {
    const user = userEvent.setup();
    respondWith(draftResponse());
    const { rerender, onConfirm } = renderPanel();

    await fillAndPlan(user);
    await screen.findByRole("region", { name: "Draft allocation" });
    expect(confirmButton()).toBeEnabled();

    await user.type(screen.getByLabelText("Preference (optional)"), "!");
    expect(confirmButton()).toBeDisabled();
    expect(screen.getByText(/changed after this draft was made/)).toBeInTheDocument();
    await user.type(screen.getByLabelText("Preference (optional)"), "{Backspace}");
    expect(confirmButton()).toBeEnabled();

    await user.click(screen.getByRole("checkbox", { name: "Carrot" }));
    expect(confirmButton()).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Carrot" }));
    expect(confirmButton()).toBeEnabled();

    const moreHistory: Garden = {
      ...twoAreas,
      plantings: [
        ...twoAreas.plantings,
        { id: "kale", commonName: "Kale", cropFamily: "brassica", quantity: 1, plantingDate: `${lastYear}-03-01`, growingAreaId: "ground", isActive: false },
      ],
    };
    rerender(
      <AllocationAssistant garden={moreHistory} isPortfolioDemo={false} isSynced onConfirm={onConfirm} workspaceId="server-workspace" />,
    );
    expect(confirmButton()).toBeDisabled();
  });

  it("reports a draft the confirm-time check found out of date", async () => {
    const user = userEvent.setup();
    respondWith(draftResponse());
    renderPanel({ onConfirm: vi.fn((): AllocationConfirmOutcome => ({ status: "stale" })) });

    await fillAndPlan(user);
    await user.click(await screen.findByRole("button", { name: `Add to ${seasonYear} plan` }));

    expect(screen.getByText("This draft is out of date. Plan again before adding it.")).toBeInTheDocument();
  });

  it("waits for saves to finish before planning in the local app", async () => {
    const user = userEvent.setup();
    renderPanel({ isSynced: false });

    await user.click(screen.getByRole("checkbox", { name: "Tomato" }));

    expect(screen.getByRole("button", { name: "Plan with AI" })).toBeDisabled();
    expect(screen.getByText("Waiting for your latest changes to save before planning.")).toBeInTheDocument();
  });

  it.each([
    ["while demo mode is loading", { isPortfolioDemo: undefined }, "Checking whether the AI planner is available…"],
    ["for another garden in the portfolio demo", { isPortfolioDemo: true }, "In the portfolio demo, the Allocation Assistant plans the Demo Garden only."],
    ["before the workspace reaches the server", { workspaceId: undefined }, "The Allocation Assistant works once this workspace is saved to the garden server."],
    ["without an eligible area", { garden: garden([{ id: "g", name: "Glass", kind: "greenhouse" }]) }, "Add a raised bed, in-ground area, or container group to plan with the Allocation Assistant."],
  ])("explains that planning is unavailable %s", (_case, props, message) => {
    renderPanel(props);

    expect(screen.getByText(message)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Plan with AI" })).not.toBeInTheDocument();
  });

  it("plans the demo garden in the portfolio demo without waiting for a server save", async () => {
    const user = userEvent.setup();
    const fetch = respondWith(draftResponse({ status: "provider_unavailable" }));
    renderPanel({ garden: garden([{ id: "bed", name: "North bed", kind: "raised-bed" }], "demo-garden"), isPortfolioDemo: true, isSynced: false, workspaceId: undefined });

    await user.click(screen.getByRole("checkbox", { name: "Tomato" }));
    await user.click(screen.getByRole("button", { name: "Plan with AI" }));

    const [url] = fetch.mock.calls[0] as unknown as [string];
    expect(url).toMatch(/\/workspaces\/portfolio-demo\/gardens\/demo-garden\/ai\/season-allocation$/);
  });

  it("clears a returned draft and the choices when the workspace changes", async () => {
    const user = userEvent.setup();
    respondWith(draftResponse());
    const { rerender, onConfirm } = renderPanel();

    await fillAndPlan(user);
    await screen.findByRole("region", { name: "Draft allocation" });

    // Same garden id, areas, and history in another workspace: only the identity differs.
    rerender(<AllocationAssistant garden={twoAreas} isPortfolioDemo={false} isSynced onConfirm={onConfirm} workspaceId="other-workspace" />);

    expect(screen.queryByRole("region", { name: "Draft allocation" })).not.toBeInTheDocument();
    expect(confirmButton()).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Tomato" })).not.toBeChecked();
    expect(screen.getByLabelText("Preference (optional)")).toHaveValue("");
  });

  it("ignores a response that arrives after the workspace changed or the panel closed", async () => {
    const user = userEvent.setup();
    let answer: (value: unknown) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise((resolve) => { answer = resolve; })));
    const { rerender, onConfirm, unmount } = renderPanel();

    await fillAndPlan(user);
    expect(screen.getByRole("button", { name: "Planning…" })).toBeDisabled();

    rerender(<AllocationAssistant garden={twoAreas} isPortfolioDemo={false} isSynced onConfirm={onConfirm} workspaceId="other-workspace" />);
    answer({ ok: true, status: 200, json: async () => draftResponse() });

    // The panel remounted for the new workspace: no draft, no pending request, fresh choices.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("region", { name: "Draft allocation" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Plan with AI" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Tomato" })).not.toBeChecked();

    await user.click(screen.getByRole("checkbox", { name: "Tomato" }));
    await user.click(screen.getByRole("button", { name: "Plan with AI" }));
    unmount();
    answer({ ok: true, status: 200, json: async () => draftResponse() });
  });
});
