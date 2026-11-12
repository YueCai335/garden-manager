import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FeedbackForm, FormField } from "./FormFeedback";

describe("form feedback", () => {
  it("reports all invalid fields in DOM order, preserving hints and preventing the action", async () => {
    const save = vi.fn();
    render(<FeedbackForm onSubmit={save} validate={() => ({ amount: undefined })}>
      <FormField id="name"><label htmlFor="name">Name</label><input id="name" required defaultValue="   " aria-describedby="name-hint" /><p id="name-hint">Use a familiar name.</p></FormField>
      <FormField id="amount"><label htmlFor="amount">Amount</label><input id="amount" required type="number" min="1" defaultValue="0" /></FormField>
      <button>Save</button>
    </FeedbackForm>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Name")).toHaveFocus();
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("Use a familiar name. Enter name.");
    expect(screen.getByLabelText("Amount")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText("Amount")).toHaveAccessibleDescription("Enter a value of at least 1.");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Garden" } });
    expect(screen.getByLabelText("Name")).toHaveAccessibleDescription("Use a familiar name.");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByLabelText("Amount")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "1" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledOnce();
  });

  it("uses domain errors and leaves server errors next to the unchanged input", async () => {
    const save = vi.fn();
    render(<FeedbackForm onSubmit={save} error="Could not save. Try again." validate={() => ({ target: "Choose an existing target." })}>
      <FormField id="target"><label htmlFor="target">Target</label><input id="target" defaultValue="Deleted bed" /></FormField>
      <button>Save</button>
    </FeedbackForm>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByLabelText("Target")).toHaveValue("Deleted bed");
    expect(screen.getByLabelText("Target")).toHaveAccessibleDescription("Choose an existing target.");
    expect(screen.getByLabelText("Target")).toHaveFocus();
    expect(screen.getByText("Could not save. Try again.").closest("form")).toBe(screen.getByLabelText("Target").closest("form"));
    expect(save).not.toHaveBeenCalled();
  });
});
