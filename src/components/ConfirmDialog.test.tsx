import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./ConfirmDialog";

function Harness({ action, removeTrigger = false }: { action: () => Promise<void> | void; removeTrigger?: boolean }) {
  const [open, setOpen] = useState(false);
  const [deleted, setDeleted] = useState(false);
  return <><h2 id="items-heading" tabIndex={-1}>Items</h2>{!deleted && <button onClick={() => setOpen(true)}>Delete item</button>}
    {open && <ConfirmDialog confirmLabel="Delete item" message="This item will be deleted." fallbackFocusId="items-heading" onCancel={() => setOpen(false)} onConfirm={async () => { await action(); setDeleted(removeTrigger); setOpen(false); }} />}</>;
}
describe("confirmation safety", () => {
  it("names the modal, focuses cancel, ignores backdrop clicks and restores focus after cancellation", async () => {
    const user = userEvent.setup(); const action = vi.fn();
    render(<Harness action={action} />);
    const trigger = screen.getByRole("button", { name: "Delete item" });
    await user.click(trigger);
    const dialog = screen.getByRole("alertdialog", { name: "Delete item" });
    expect(dialog).toHaveAccessibleDescription("This item will be deleted.");
    const cancel = within(dialog).getByRole("button", { name: "Cancel" });
    const confirm = within(dialog).getByRole("button", { name: "Delete item" });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: "Tab" });
    expect(cancel).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.click(dialog);
    expect(dialog).toBeInTheDocument();
    fireEvent(dialog, new Event("cancel", { bubbles: false, cancelable: true }));
    expect(action).not.toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("blocks same-tick duplicate confirmations, keeps a failed action open, then permits an explicit retry", async () => {
    let reject!: (error: Error) => void;
    const action = vi.fn().mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail; })).mockResolvedValue(undefined);
    const user = userEvent.setup(); render(<Harness action={action} removeTrigger />);
    await user.click(screen.getByRole("button", { name: "Delete item" }));
    const confirm = within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete item" });
    act(() => { fireEvent.click(confirm); fireEvent.click(confirm); });
    expect(action).toHaveBeenCalledTimes(1);
    expect(confirm).toBeDisabled();
    const dialog = screen.getByRole("alertdialog");
    fireEvent(dialog, new Event("cancel", { cancelable: true }));
    expect(dialog).toBeInTheDocument();
    await act(async () => reject(new Error("The item changed. Review it again.")));
    expect(screen.getByRole("alert")).toHaveTextContent("The item changed");
    await user.click(within(dialog).getByRole("button", { name: "Delete item" }));
    expect(action).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Items" })).toHaveFocus());
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
