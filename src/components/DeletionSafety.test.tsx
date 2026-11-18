import { render, screen, within } from "@testing-library/react";
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
const moreActions = () => screen.getByRole("button", { name: /^More actions for Water Demo Garden/ });
describe("care confirmation and keyboard semantics", () => {
  it("does not update records on cancel or when the confirmed task has disappeared", async () => {
    const user = userEvent.setup(); const state = setup();
    await user.click(moreActions());
    await user.click(screen.getByRole("menuitem", { name: "Delete task" }));
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));
    expect(state.onUpdateRecords).not.toHaveBeenCalled();
    await user.click(moreActions());
    await user.click(screen.getByRole("menuitem", { name: "Delete task" }));
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
    expect(screen.queryByRole("dialog", { name: "Add care task" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add task" }));
    expect(screen.getByLabelText("Note (optional)")).toHaveValue("");
  });

  it("moves through the row menu with the arrow keys and returns to its button on Escape", async () => {
    const user = userEvent.setup(); setup();
    const button = moreActions();
    button.focus();
    await user.keyboard("{ArrowDown}");
    expect(button).toHaveAttribute("aria-expanded", "true");
    const items = within(screen.getByRole("menu")).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual(["Edit task", "Complete on another date…", "Delete task"]);
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{ArrowUp}{ArrowUp}");
    expect(items[2]).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("switches to History and back without a route", async () => {
    const user = userEvent.setup(); setup();
    await user.click(screen.getByRole("button", { name: "History" }));
    expect(screen.getByRole("heading", { name: "History" })).toBeVisible();
    expect(screen.getByText("No care records yet.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Care" }));
    expect(screen.getByRole("heading", { level: 2, name: "1 thing left today." })).toBeVisible();
  });
});
