import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SeasonPlanner } from "./SeasonPlanner";
import { createDemoGardenWorkspace, type Garden } from "@/lib/gardenWorkspace";

// Pinned so the sample garden's 2026 plantings fall inside the 2027 plan's history window.
const NOW = new Date("2026-09-24T12:00:00");
const actions = () => ({ isSynced: true, onSavePlan: vi.fn(), onRemovePlan: vi.fn(), onConfirmAllocation: vi.fn() });

function sampleGarden(): Garden {
  return createDemoGardenWorkspace().gardens[0];
}

function withPlan(garden: Garden, plantings: { id: string; areaId: string; name: string; family: Garden["plantings"][number]["cropFamily"] }[]): Garden {
  return {
    ...garden,
    seasonPlans: [{ id: "plan", seasonYear: 2027, plantings: plantings.map(({ id, areaId, name, family }) => ({ id, growingAreaId: areaId, commonName: name, plantType: name, cropFamily: family })) }],
  };
}

describe("Next Season rotation sheet (ADR-0082)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ portfolioDemo: true }) })));
  });
  afterEach(() => vi.useRealTimers());

  it("shows one row per area with its history, the families it rests from, and its plan on the lane", () => {
    const garden = withPlan(sampleGarden(), [
      { id: "kale", areaId: "demo-raised-bed", name: "Kale", family: "brassica" },
      { id: "pepper", areaId: "demo-raised-bed", name: "Pepper", family: "nightshade" },
      { id: "basil", areaId: "demo-raised-bed", name: "Basil", family: "other" },
    ]);
    render(<SeasonPlanner gardens={[garden]} {...actions()} />);

    const sheet = screen.getByRole("region", { name: "2027 rotation sheet for Demo Garden" });
    expect(within(sheet).getByRole("heading", { level: 2, name: "Demo Garden" })).toBeVisible();
    expect(within(sheet).getByText("3 planting areas")).toBeVisible();
    expect(within(sheet).getByText("Grown 2024–2026")).toBeVisible();
    expect(within(sheet).getByText("2027")).toBeVisible();
    expect(within(sheet).getByText("1 of 3 areas planned")).toBeVisible();
    // Pepper repeats the bed's 2026 tomatoes; Kale is new here and Basil's "Other" family never counts.
    expect(within(sheet).getByText("1 to check")).toBeVisible();

    const bed = within(sheet).getByRole("group", { name: "Sample raised bed" });
    expect(within(bed).getByText("Raised bed")).toBeVisible();
    expect(within(bed).getByText("2026")).toBeVisible();
    expect(within(bed).getByText("Tomato · Sun Gold")).toBeVisible();
    expect(within(bed).getByTitle("Nightshade (tomato, pepper, eggplant)")).toHaveTextContent("Nightshade");
    expect(within(bed).getAllByText(/again$/).map((tag) => tag.textContent)).toEqual(["Nightshade again"]);
    expect(within(bed).getByRole("button", { name: "Remove Kale from Sample raised bed" })).toBeInTheDocument();
    expect(within(bed).getByRole("button", { name: "Add a plant to Sample raised bed" })).toBeInTheDocument();
    expect(within(bed).queryByRole("button", { name: /^Choose a plant/ })).not.toBeInTheDocument();
    // No companion note applies to kale, pepper, and basil, so no note line shows.
    expect(within(bed).queryByRole("link")).not.toBeInTheDocument();

    const container = within(sheet).getByRole("group", { name: "Sample container group" });
    expect(within(container).getByText("No record")).toBeVisible();
    expect(within(container).getByText("Any family")).toBeVisible();
    expect(within(container).getByRole("button", { name: "Choose a plant for Sample container group" })).toBeVisible();

    // Nothing from the assistant is on the page until Plan with AI is pressed.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("opens the chooser in place, warns about a repeated family, saves, and returns focus", async () => {
    const user = userEvent.setup();
    const handlers = actions();
    render(<SeasonPlanner gardens={[sampleGarden()]} {...handlers} />);
    const bed = screen.getByRole("group", { name: "Sample raised bed" });

    await user.click(within(bed).getByRole("button", { name: "Choose a plant for Sample raised bed" }));
    const field = within(bed).getByLabelText("Plant type");
    expect(field).toHaveFocus();
    expect(within(bed).getByText("Good fit here: Brassica, Cucurbit, Legume, Allium.")).toBeVisible();
    expect(within(bed).queryByText(/Crop family:/)).not.toBeInTheDocument();

    await user.click(within(bed).getByRole("button", { name: "Add to 2027 plan" }));
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(within(bed).getByText("Enter a plant type.")).toBeVisible();

    await user.type(field, "Cherry tomato");
    expect(within(bed).getByText(/Crop family:/)).toHaveTextContent("Crop family: Nightshade");
    expect(within(bed).getByText("Nightshade grew here in 2026")).toBeVisible();
    await user.click(within(bed).getByRole("button", { name: "Change" }));
    await user.selectOptions(within(bed).getByLabelText("Crop family"), "brassica");
    expect(within(bed).queryByText("Nightshade grew here in 2026")).not.toBeInTheDocument();
    await user.click(field);
    await user.keyboard("{Enter}");

    expect(handlers.onSavePlan).toHaveBeenCalledWith("demo-garden", "demo-raised-bed", { plantType: "Cherry tomato", cropFamily: "brassica" });
    expect(within(bed).queryByLabelText("Plant type")).not.toBeInTheDocument();
    await waitFor(() => expect(within(bed).getByRole("button", { name: "Choose a plant for Sample raised bed" })).toHaveFocus());
  });

  it("closes an empty chooser on Escape and keeps a typed one until the discard is confirmed", async () => {
    const user = userEvent.setup();
    render(<SeasonPlanner gardens={[sampleGarden()]} {...actions()} />);
    const bed = screen.getByRole("group", { name: "Sample raised bed" });

    await user.click(within(bed).getByRole("button", { name: "Choose a plant for Sample raised bed" }));
    await user.keyboard("{Escape}");
    expect(within(bed).queryByLabelText("Plant type")).not.toBeInTheDocument();

    await user.click(within(bed).getByRole("button", { name: "Choose a plant for Sample raised bed" }));
    await user.type(within(bed).getByLabelText("Plant type"), "Kale");
    await user.click(within(bed).getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(within(bed).getByLabelText("Plant type")).toHaveValue("Kale");
  });

  it("asks before removing a planned plant", async () => {
    const user = userEvent.setup();
    const handlers = actions();
    const garden = withPlan(sampleGarden(), [{ id: "kale", areaId: "demo-raised-bed", name: "Kale", family: "brassica" }]);
    render(<SeasonPlanner gardens={[garden]} {...handlers} />);

    await user.click(screen.getByRole("button", { name: "Remove Kale from Sample raised bed" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Remove “Kale” from the 2027 plan for Demo Garden · Sample raised bed?");
    await user.click(within(dialog).getByRole("button", { name: "Remove plan item" }));
    expect(handlers.onRemovePlan).toHaveBeenCalledWith("demo-garden", 2027, "kale");
  });

  it("shows a short companion note with its source only when one applies", () => {
    const garden = withPlan(sampleGarden(), [
      { id: "tomato", areaId: "demo-container-group", name: "Tomato", family: "nightshade" },
      { id: "basil", areaId: "demo-container-group", name: "Basil", family: "other" },
    ]);
    render(<SeasonPlanner gardens={[garden]} {...actions()} />);
    const container = screen.getByRole("group", { name: "Sample container group" });
    expect(within(container).getByText("Basil may reduce some tomato pests.")).toBeVisible();
    expect(within(container).getByRole("link", { name: "University of Minnesota Extension" })).toHaveAttribute("target", "_blank");
    expect(screen.queryByText(/No companion notes/)).not.toBeInTheDocument();
  });

  it("numbers each area on the map like its row and links the two", async () => {
    const user = userEvent.setup();
    const garden = withPlan(sampleGarden(), [{ id: "kale", areaId: "demo-in-ground-area", name: "Kale", family: "brassica" }]);
    garden.growingAreas = [...garden.growingAreas, { id: "pots", name: "Unmeasured pots", kind: "container", planPlacement: { x: 0, y: 0, rotationDegrees: 0 } }];
    render(<SeasonPlanner gardens={[garden]} {...actions()} />);

    const map = screen.getByRole("region", { name: "2027 map" });
    expect(within(map).getByRole("img", { name: "2027 plan preview for Demo Garden" })).toBeInTheDocument();
    expect(within(map).getByRole("link", { name: /Open Garden Plan/ })).toHaveAttribute("href", "/gardens/demo-garden/plan");
    expect(screen.getByTestId("season-area-label-demo-raised-bed")).toHaveTextContent("1");
    expect(screen.getByTestId("season-area-label-demo-in-ground-area")).toHaveTextContent("2");
    expect(screen.getByTestId("season-area-label-demo-container-group")).toHaveTextContent("3");
    expect(screen.queryByTestId("season-area-label-pots")).not.toBeInTheDocument();
    expect(within(map).getByText("1 planting area needs a size to appear here.")).toBeVisible();
    // The legend lists the planned plants; one circle per planned plant type sits in its area.
    expect(within(map).getByText("Kale")).toBeVisible();
    expect(within(map).getByLabelText("Kale")).toBeInTheDocument();

    const bedOnMap = screen.getByTestId("season-area-label-demo-raised-bed").closest("g")!;
    const row = screen.getByRole("group", { name: "Sample raised bed" });
    fireEvent.mouseEnter(row);
    expect(bedOnMap).toHaveAttribute("data-hot");
    fireEvent.mouseLeave(row);
    expect(bedOnMap).not.toHaveAttribute("data-hot");
    fireEvent.mouseEnter(bedOnMap);
    expect(row).toHaveAttribute("data-hot");

    // Clicking an unplanned area on the map opens its chooser.
    await user.click(bedOnMap);
    expect(within(row).getByLabelText("Plant type")).toBeInTheDocument();
  });

  it("says plants appear on the map once chosen when nothing is planned", () => {
    render(<SeasonPlanner gardens={[sampleGarden()]} {...actions()} />);
    expect(screen.getByText("Plants appear on the map as you choose them.")).toBeVisible();
    expect(screen.queryByText(/to check$/)).not.toBeInTheDocument();
  });

  it("opens Plan with AI in a drawer that keeps its choices and returns focus when closed", async () => {
    const user = userEvent.setup();
    render(<SeasonPlanner gardens={[sampleGarden()]} workspaceId="w" {...actions()} />);
    const opener = screen.getByRole("button", { name: "Plan with AI" });

    await user.click(opener);
    const drawer = screen.getByRole("dialog", { name: "Plan with AI" });
    expect(within(drawer).getByRole("button", { name: "Close" })).toHaveFocus();
    expect(within(drawer).getByText(/Nothing is added until you confirm\./)).toBeVisible();
    const tomato = await within(drawer).findByRole("checkbox", { name: "Tomato" });
    await user.click(tomato);

    await user.click(within(drawer).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();

    await user.click(opener);
    expect(within(screen.getByRole("dialog", { name: "Plan with AI" })).getByRole("checkbox", { name: "Tomato" })).toBeChecked();
    fireEvent(screen.getByRole("dialog", { name: "Plan with AI" }), new Event("cancel", { cancelable: true }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it("offers the recorded run for the demo garden in the public demo without any AI request", async () => {
    const user = userEvent.setup();
    render(<SeasonPlanner gardens={[sampleGarden()]} {...actions()} />);
    await user.click(screen.getByRole("button", { name: "Plan with AI" }));
    const drawer = screen.getByRole("dialog", { name: "Plan with AI" });
    await user.click(await within(drawer).findByRole("button", { name: "View example run" }));
    expect(within(drawer).getByText(/Live AI runs are closed/)).toBeVisible();
    expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).endsWith("/runtime-config"))).toBe(true);
  });
});

describe("Next Season garden switch and empty states", () => {
  const two = () => {
    const first = withPlan(sampleGarden(), [{ id: "kale", areaId: "demo-raised-bed", name: "Kale", family: "brassica" }]);
    const second: Garden = { ...sampleGarden(), id: "back", name: "Back garden", growingAreas: [{ ...first.growingAreas[0], id: "back-bed", name: "Back bed" }], plantings: [], seasonPlans: [] };
    return [first, second];
  };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ portfolioDemo: true }) })));
  });
  afterEach(() => vi.useRealTimers());

  it("shows the first garden by default and one garden at a time from the URL", () => {
    const gardens = two();
    const { rerender } = render(<SeasonPlanner gardens={gardens} {...actions()} />);
    const switcher = within(screen.getByRole("navigation", { name: "Garden" }));
    const links = switcher.getAllByRole("link");
    expect(links.map((link) => link.getAttribute("aria-label"))).toEqual(["Demo Garden, 1 of 3 areas planned", "Back garden, 0 of 1 areas planned"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/season?garden=demo-garden", "/season?garden=back"]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[0]).toHaveTextContent("Demo Garden1/3");
    expect(screen.getByRole("group", { name: "Sample raised bed" })).toBeVisible();

    rerender(<SeasonPlanner gardens={gardens} gardenId="back" {...actions()} />);
    expect(screen.getByRole("group", { name: "Back bed" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Sample raised bed" })).not.toBeInTheDocument();
    expect(screen.getByText("1 planting area")).toBeVisible();
    expect(screen.getByText("0 of 1 area planned")).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Garden" })).getAllByRole("link")[1]).toHaveAttribute("aria-current", "page");

    rerender(<SeasonPlanner gardens={gardens} gardenId="missing" {...actions()} />);
    expect(screen.getByRole("heading", { name: "Garden unavailable" })).toBeVisible();
    expect(screen.getByText("Choose another garden to see its plan.")).toBeVisible();
    expect(within(screen.getByRole("navigation", { name: "Garden" })).getAllByRole("link").filter((link) => link.hasAttribute("aria-current"))).toHaveLength(0);
  });

  it("offers a concrete next action for no gardens and for a garden without areas", () => {
    const handlers = actions();
    const { rerender } = render(<SeasonPlanner gardens={[]} {...handlers} />);
    expect(screen.getByRole("heading", { name: "Create a garden to start planning" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Create a garden" })).toHaveAttribute("href", "/gardens/new");
    expect(screen.queryByRole("navigation", { name: "Garden" })).not.toBeInTheDocument();

    const garden = { ...sampleGarden(), growingAreas: [] };
    rerender(<SeasonPlanner gardens={[garden]} {...handlers} />);
    expect(screen.getByRole("heading", { name: "Add a planting area first" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Open Garden Plan for Demo Garden" })).toHaveAttribute("href", "/gardens/demo-garden/plan");
    expect(screen.getByRole("navigation", { name: "Garden" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Plan with AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: /map$/ })).not.toBeInTheDocument();
  });
});
