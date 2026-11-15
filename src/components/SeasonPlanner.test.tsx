import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SeasonPlanner } from "./SeasonPlanner";
import { createDemoGardenWorkspace } from "@/lib/gardenWorkspace";

const actions = () => ({ isSynced: true, onSavePlan: vi.fn(), onRemovePlan: vi.fn(), onConfirmAllocation: vi.fn() });

describe("Next Season hierarchy", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ portfolioDemo: true }) }))));

  it("prioritizes area plans and keeps rotation evidence and recorded AI behind disclosures", async () => {
    const user = userEvent.setup();
    const garden = createDemoGardenWorkspace().gardens[0];
    const year = new Date().getFullYear() + 1;
    garden.seasonPlans = [{ id: "plan", seasonYear: year, plantings: [{ id: "future", growingAreaId: garden.growingAreas[0].id, commonName: "Kale", cropFamily: "brassica" }] }];
    const handlers = actions();
    render(<SeasonPlanner gardens={[garden]} {...handlers} />);
    expect(screen.getByRole("region", { name: "Planting plans" })).toBeVisible();
    expect(screen.getByText("1 of 3 areas planned")).toBeVisible();
    const card = screen.getByRole("heading", { name: "Sample raised bed" }).closest("article")!;
    expect(within(card).getByText("Kale")).toBeVisible();
    expect(within(card).getByRole("button", { name: "Add a plant" })).toBeVisible();
    expect(within(card).getByText("Good rotation fit")).not.toBeVisible();
    await user.click(within(card).getByText("Rotation details", { selector: "summary" }));
    expect(within(card).getByText("Good rotation fit")).toBeVisible();
    expect(within(card).getByText(/2026-05-18/)).toBeVisible();
    expect(screen.getByRole("region", { name: "Allocation Assistant" })).not.toBeVisible();
    await user.click(screen.getByText("Allocation Assistant · Demo Garden", { selector: "summary" }));
    await user.click(await screen.findByRole("button", { name: "View example run" }));
    expect(screen.getByText(/Live AI runs are closed/)).toBeVisible();
    expect(handlers.onConfirmAllocation).not.toHaveBeenCalled();
    expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).endsWith("/runtime-config"))).toBe(true);
  });

  it("filters history and plans together and follows a filter the page's URL owns", async () => {
    const user = userEvent.setup();
    const first = createDemoGardenWorkspace().gardens[0];
    const second = { ...first, id: "back", name: "Back garden", growingAreas: [{ ...first.growingAreas[0], id: "back-bed", name: "Back bed" }], plantings: [] };
    const handlers = actions();
    const { rerender } = render(<SeasonPlanner gardens={[first, second]} {...handlers} />);
    await user.selectOptions(screen.getByLabelText("Garden"), "back");
    expect(screen.getByRole("heading", { name: "Back bed" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Sample raised bed" })).not.toBeInTheDocument();
    expect(screen.queryByText("Tomato · Sun Gold")).not.toBeInTheDocument();
    const onGardenFilterChange = vi.fn();
    rerender(<SeasonPlanner gardens={[first, second]} gardenFilter={first.id} onGardenFilterChange={onGardenFilterChange} {...handlers} />);
    expect(screen.getByLabelText("Garden")).toHaveValue(first.id);
    expect(screen.getByRole("heading", { name: "Sample raised bed" })).toBeVisible();
    expect(screen.queryByRole("heading", { name: "Back bed" })).not.toBeInTheDocument();
    expect(screen.getByText(/Only Demo Garden/)).toBeVisible();
    expect(screen.getByRole("link", { name: "Show all" })).toHaveAttribute("href", "/season");
    await user.selectOptions(screen.getByLabelText("Garden"), "back");
    expect(onGardenFilterChange).toHaveBeenCalledWith("back");
    rerender(<SeasonPlanner gardens={[first, second]} gardenFilter="missing" onGardenFilterChange={onGardenFilterChange} {...handlers} />);
    expect(screen.getByRole("heading", { name: "Garden unavailable" })).toBeVisible();
    expect(screen.getByText(/Only an unavailable garden/)).toBeVisible();
    expect(handlers.onSavePlan).not.toHaveBeenCalled();
  });

  it("offers a concrete next action for no gardens and for gardens without areas", () => {
    const handlers = actions();
    const { rerender } = render(<SeasonPlanner gardens={[]} {...handlers} />);
    expect(screen.getByRole("link", { name: "Create a garden" })).toHaveAttribute("href", "/gardens/new");
    const garden = { ...createDemoGardenWorkspace().gardens[0], growingAreas: [] };
    rerender(<SeasonPlanner gardens={[garden]} {...handlers} />);
    expect(screen.getByRole("link", { name: "Open Garden Plan for Demo Garden" })).toHaveAttribute("href", "/gardens/demo-garden/plan");
    expect(screen.queryByText("Allocation Assistant · Demo Garden")).not.toBeInTheDocument();
  });
});
