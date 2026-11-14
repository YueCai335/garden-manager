import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { EditorPanel } from "./EditorPanel";
import { editorMode, type EditorMode } from "./EditorWorkbench";
import { ConfirmDialog } from "../ConfirmDialog";
import { GardenWorkspace } from "@/test/WorkspaceHarness";
import { resetTestRouter } from "@/test/router";
import { createDemoGardenWorkspace, GARDEN_WORKSPACE_STORAGE_KEY } from "@/lib/gardenWorkspace";

function mockNarrowViewport() {
  vi.stubGlobal("innerWidth", 1024);
  vi.stubGlobal("matchMedia", (query: string) => ({
    // A phone: a narrow viewport with a touch screen as its primary pointer.
    matches: query === "(width < 768px)" || query === "(pointer: coarse)", addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
}

describe("responsive editor", () => {
  it.each([[0, false, "overlay"], [1079, false, "overlay"], [1080, false, "wide"], [700, false, "overlay"], [1200, true, "mobile"]] as const)("uses content width %s and mobile viewport %s for %s", (content, mobileViewport, expected) => {
    expect(editorMode(content, mobileViewport)).toBe(expected);
  });

  it("preserves the same form node while changing modes and releases the modal scroll lock", () => {
    const props = { title: "Area", headingId: "area-title", returnFocusId: "area-link", onClose: vi.fn(), children: <input aria-label="Draft" defaultValue="Bed" /> };
    const view = render(<EditorPanel {...props} mode="wide" />);
    const input = screen.getByLabelText("Draft");
    fireEvent.change(input, { target: { value: "Unsaved bed" } });
    view.rerender(<EditorPanel {...props} mode="overlay" />);
    expect(screen.getByRole("dialog", { name: "Area" })).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(screen.getByLabelText("Draft")).toBe(input);
    view.rerender(<EditorPanel {...props} mode="mobile" />);
    expect(screen.getByRole("region", { name: "Area" })).not.toHaveAttribute("aria-modal");
    expect(screen.getByLabelText("Draft")).toHaveValue("Unsaved bed");
    expect(screen.getByRole("button", { name: "Back to plan" })).toBeVisible();
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("cycles Tab across the overlay's enabled controls in both directions", () => {
    const { getByRole } = render(<EditorPanel mode="overlay" title="Area" headingId="area-title" returnFocusId="area-link" onClose={vi.fn()}>
      <button disabled>Save</button><button>Last action</button>
    </EditorPanel>);
    const close = getByRole("button", { name: "Close" });
    const last = getByRole("button", { name: "Last action" });
    const visible = [{ width: 44, height: 44 }] as unknown as DOMRectList;
    vi.spyOn(close, "getClientRects").mockReturnValue(visible);
    vi.spyOn(last, "getClientRects").mockReturnValue(visible);

    close.focus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();
  });

  it("restores focus inside the overlay after a nested confirmation and defers resizing until that confirmation closes", async () => {
    function Harness({ mode }: { mode: EditorMode }) {
      const [confirm, setConfirm] = useState(false);
      return <EditorPanel mode={mode} title="Area" headingId="area-title" returnFocusId="area-link" onClose={() => setConfirm(true)}>
        {confirm && <ConfirmDialog message="Discard draft?" confirmLabel="Discard" onCancel={() => setConfirm(false)} onConfirm={() => setConfirm(false)} />}
      </EditorPanel>;
    }
    const user = userEvent.setup();
    const view = render(<Harness mode="overlay" />);
    const close = screen.getByRole("button", { name: "Close" });
    await user.click(close);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(close).toHaveFocus());
    expect(document.body.style.overflow).toBe("hidden");
    await user.click(close);
    view.rerender(<Harness mode="wide" />);
    expect(screen.getByRole("dialog", { name: "Area" })).toHaveAttribute("data-mode", "overlay");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("region", { name: "Area" })).toHaveAttribute("data-mode", "wide"));
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("opens a phone area-properties link as a full editor, guards Back, and returns to the zoomed area", async () => {
    mockNarrowViewport();
    localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(createDemoGardenWorkspace()));
    resetTestRouter("/gardens/demo-garden/plan?area=demo-raised-bed&edit=area");
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    expect(await screen.findByRole("button", { name: "Back to plan" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Move planting areas" })).not.toBeInTheDocument();
    // A blank value cannot apply, so Back asks before discarding it.
    fireEvent.change(screen.getByLabelText("Area X position (m)"), { target: { value: "" } });
    await user.click(screen.getByRole("button", { name: "Back to plan" }));
    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.getByLabelText("Area X position (m)")).toHaveValue(null);
    fireEvent.change(screen.getByLabelText("Area X position (m)"), { target: { value: "2.34" } });
    fireEvent.keyDown(screen.getByLabelText("Area X position (m)"), { key: "Enter" });
    expect(JSON.parse(localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY)!).gardens[0].growingAreas[0].planPlacement.x).toBe(2.3);
    await user.click(screen.getByRole("button", { name: "Back to plan" }));
    expect(location.search).toBe("?area=demo-raised-bed");
    await waitFor(() => expect(screen.getByRole("link", { name: "Edit area" })).toHaveFocus());
    expect(screen.getByRole("button", { name: "Whole garden" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Sample raised bed" })).toContainElement(screen.getByRole("button", { name: "Edit Tomato" }));
  });

  it("zooms a tapped bed on the phone and shows its planting panel below the plan", async () => {
    mockNarrowViewport();
    localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(createDemoGardenWorkspace()));
    resetTestRouter("/gardens/demo-garden/plan");
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await user.click(await screen.findByLabelText("Open Sample raised bed on Garden Plan"));
    expect(location.search).toBe("?area=demo-raised-bed");
    expect(screen.getByRole("button", { name: "Move planting areas" })).toBeVisible();
    const panel = screen.getByRole("region", { name: "Sample raised bed" });
    expect(panel).toHaveTextContent("Raised bed · 3 × 1.2 m");
    expect(screen.getByRole("link", { name: "Edit Sample raised bed" })).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("region", { name: "Edit planting area" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("link", { name: "Edit area" }));
    expect(location.search).toBe("?area=demo-raised-bed&edit=area");
    expect(screen.getByRole("button", { name: "Back to plan" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add plant" })).not.toBeInTheDocument();
  });

  it("keeps the overlay layout's plants below the plan and opens area properties as a dialog", async () => {
    localStorage.setItem(GARDEN_WORKSPACE_STORAGE_KEY, JSON.stringify(createDemoGardenWorkspace()));
    resetTestRouter("/gardens/demo-garden/plan");
    const user = userEvent.setup();
    render(<GardenWorkspace />);
    await user.click(await screen.findByLabelText("Open Sample raised bed on Garden Plan"));
    expect(screen.queryByRole("dialog", { name: "Edit planting area" })).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Sample raised bed" })).toContainElement(screen.getByRole("button", { name: "Add plant" }));
    await user.click(screen.getByRole("link", { name: "Edit area" }));
    const dialog = screen.getByRole("dialog", { name: "Edit planting area" });
    expect(dialog).not.toContainElement(screen.getByRole("button", { name: "Add plant" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(location.search).toBe("?area=demo-raised-bed");
    expect(screen.getByRole("button", { name: "Whole garden" })).toBeInTheDocument();
  });
});
