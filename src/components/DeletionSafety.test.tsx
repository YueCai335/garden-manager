import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CareWorkspace } from "./CareWorkspace";
import { createDemoGardenWorkspace, todayDate } from "@/lib/gardenWorkspace";

function setup() {
  const garden = createDemoGardenWorkspace().gardens[0];
  garden.careTasks = [{ id: "one", type: "watering", dueDate: todayDate(), targetScope: "garden", note: "Keep this task" }];
  const onUpdateRecords = vi.fn();
  const onMessage = vi.fn();
  const props = { garden, onUpdateRecords, onMessage };
  return { ...props, ...render(<CareWorkspace {...props} />) };
}
describe("care confirmation and keyboard semantics", () => {
  it("does not update records on cancel or when the confirmed task has disappeared", async () => {
    const user = userEvent.setup(); const state = setup();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(state.onUpdateRecords).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    state.rerender(<CareWorkspace garden={{ ...state.garden, careTasks: [] }} onUpdateRecords={state.onUpdateRecords} onMessage={state.onMessage} />);
    await user.click(screen.getByRole("button", { name: "Delete task" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no longer exists");
    expect(state.onUpdateRecords).not.toHaveBeenCalled();
  });

  it("keeps edited input on Keep editing and discards it only after confirmation", async () => {
    const user = userEvent.setup(); setup();
    await user.click(screen.getByRole("button", { name: "Add task" }));
    const note = screen.getByLabelText("Note (optional)");
    await user.type(note, "Don't lose this");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(note).toHaveValue("Don't lose this");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard changes" }));
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("");
  });

  it("implements roving focus and linked panels for standalone tabs", async () => {
    const user = userEvent.setup(); setup();
    const tasks = screen.getByRole("tab", { name: "Tasks" });
    const history = screen.getByRole("tab", { name: "History" });
    tasks.focus();
    await user.keyboard("{ArrowRight}");
    expect(history).toHaveFocus();
    expect(history).toHaveAttribute("aria-selected", "true");
    expect(tasks).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel", { name: "History" })).toBeVisible();
    fireEvent.keyDown(history, { key: "Home" });
    expect(tasks).toHaveFocus();
    await user.keyboard("{End}");
    expect(history).toHaveFocus();
  });
});
