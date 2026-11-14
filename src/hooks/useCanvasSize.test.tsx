import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { useCanvasSize } from "./useCanvasSize";

it("measures an initially hidden container, follows resizes, and disconnects on unmount", () => {
  let notify: ResizeObserverCallback;
  const observe = vi.fn();
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { notify = callback; }
    observe = observe;
    disconnect = disconnect;
  });
  vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockReturnValueOnce({ width: 0, height: 0 } as DOMRect);
  function Surface() {
    const { ref, width, height } = useCanvasSize();
    return <div ref={ref} data-testid="surface">{width} × {height}</div>;
  }
  const view = render(<Surface />);
  expect(observe).toHaveBeenCalledWith(screen.getByTestId("surface"));
  expect(screen.getByTestId("surface")).toHaveTextContent("0 × 0");
  const resize = (width: number, height: number) => act(() => notify([
    { contentRect: { width, height } } as ResizeObserverEntry,
  ], {} as ResizeObserver));
  resize(358.75, 320.5);
  expect(screen.getByTestId("surface")).toHaveTextContent("358 × 320");
  resize(1100, 480);
  expect(screen.getByTestId("surface")).toHaveTextContent("1100 × 480");
  resize(0, 0);
  expect(screen.getByTestId("surface")).toHaveTextContent("0 × 0");
  view.unmount();
  expect(disconnect).toHaveBeenCalledOnce();
});
