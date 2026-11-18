import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PortfolioFeatureLoading } from "@/components/PortfolioFeaturePreview";
import { WorkspaceHomeLoading } from "@/components/workspace/WorkspaceHome";
import { SLOW_LOAD_HINT } from "./useSlowLoadHint";

afterEach(() => vi.useRealTimers());

it("tells the visitor the server is starting once the gardens take over five seconds", () => {
  vi.useFakeTimers();
  render(<WorkspaceHomeLoading />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading your gardens…");
  act(() => vi.advanceTimersByTime(4_999));
  expect(screen.queryByText(SLOW_LOAD_HINT)).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByRole("status")).toHaveTextContent(SLOW_LOAD_HINT);
});

it("explains a slow feature check the same way", () => {
  vi.useFakeTimers();
  render(<PortfolioFeatureLoading feature="plant-health" />);
  expect(screen.getByRole("status")).toHaveTextContent("Checking feature availability…");
  act(() => vi.advanceTimersByTime(5_000));
  expect(screen.getByRole("status")).toHaveTextContent(SLOW_LOAD_HINT);
});
