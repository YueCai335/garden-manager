import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { SetupProgress } from "./SetupProgress";

it("shows the step number, checks completed steps, emphasises the current one, and locks later steps", async () => {
  const onStep = vi.fn();
  render(<SetupProgress setup={{ step: "plants", reached: "plants" }} onStep={onStep} />);
  const track = within(screen.getByRole("navigation", { name: "Guided setup" }));
  expect(track.getByText("Step 3 of 4 · Plants")).toBeInTheDocument();
  const items = track.getAllByRole("listitem");
  expect(items.map((item) => item.getAttribute("data-status"))).toEqual(["complete", "complete", "current", "locked"]);
  expect(items[0]).toHaveTextContent("✓");
  expect(items[3]).toHaveTextContent("4");
  expect(track.getByText("Plants, current step").closest("[aria-current]")).toHaveAttribute("aria-current", "step");
  expect(track.getAllByRole("button").map((button) => button.textContent?.replace(/^✓(.+)\1/, "$1"))).toEqual(["Garden size, completed", "Planting areas, completed"]);
  expect(track.getByText("Ready, not started")).toBeInTheDocument();
  expect(track.queryByRole("button", { name: /Ready/ })).not.toBeInTheDocument();

  await userEvent.setup().click(track.getByRole("button", { name: "Garden size, completed" }));
  expect(onStep).toHaveBeenCalledWith("size");
});

it("keeps a step reached but not passed clickable after going back", () => {
  render(<SetupProgress setup={{ step: "size", reached: "ready" }} onStep={() => undefined} />);
  expect(screen.getByRole("button", { name: "Ready, reached" })).toBeInTheDocument();
  expect(screen.getByText("Step 1 of 4 · Garden size")).toBeInTheDocument();
});
