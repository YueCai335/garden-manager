import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

vi.mock("react-konva", async () => {
  const React = await import("react");
  const Node = ({ children, text, onClick, onDblClick, onDblTap, onDragEnd, onTap, listening: _listening, closed: _closed, ...props }: { children?: React.ReactNode; text?: string; onClick?: React.MouseEventHandler<HTMLDivElement>; onDblClick?: React.MouseEventHandler<HTMLDivElement>; onDblTap?: React.MouseEventHandler<HTMLDivElement>; onDragEnd?: React.PointerEventHandler<HTMLDivElement>; onTap?: React.MouseEventHandler<HTMLDivElement>; listening?: boolean; closed?: boolean; [key: string]: unknown }) =>
    React.createElement("div", { ...props, onClick: onClick ?? onTap, onDoubleClick: onDblClick ?? onDblTap, onPointerUp: onDragEnd }, children ?? text);
  return { Stage: Node, Layer: Node, Line: Node, Rect: Node, Circle: Node, Group: Node, Text: Node };
});

const canvasContext = {
  beginPath: vi.fn(),
  clearRect: vi.fn(),
  ellipse: vi.fn(),
  fill: vi.fn(),
  fillText: vi.fn(),
  roundRect: vi.fn(),
  setTransform: vi.fn(),
  stroke: vi.fn()
} as unknown as CanvasRenderingContext2D;

const storage = new Map<string, string>();
const localStorageMock: Storage = {
  clear: () => storage.clear(),
  getItem: (key) => storage.get(key) ?? null,
  key: (index) => [...storage.keys()][index] ?? null,
  get length() {
    return storage.size;
  },
  removeItem: (key) => storage.delete(key),
  setItem: (key, value) => storage.set(key, String(value))
};

Object.defineProperty(window, "localStorage", {
  configurable: true,
  value: localStorageMock
});

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: vi.fn(() => canvasContext)
});

Object.defineProperty(HTMLCanvasElement.prototype, "setPointerCapture", {
  value: vi.fn()
});

Object.defineProperty(HTMLCanvasElement.prototype, "hasPointerCapture", {
  value: vi.fn(() => false)
});

Object.defineProperty(HTMLCanvasElement.prototype, "releasePointerCapture", {
  value: vi.fn()
});

Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
  value: vi.fn(
    () =>
      ({
        bottom: 640,
        height: 640,
        left: 0,
        right: 1000,
        toJSON: () => ({}),
        top: 0,
        width: 1000,
        x: 0,
        y: 0
      }) as DOMRect
  )
});

class ResizeObserverMock {
  disconnect() {}
  observe() {}
  unobserve() {}
}

Object.defineProperty(window, "ResizeObserver", { value: ResizeObserverMock });

beforeEach(() => {
  // Default every test to "no network reachable" so results never depend on
  // whether something real happens to be listening on localhost:8000. A test
  // that needs real request/response behavior stubs its own fetch, which
  // simply overrides this default for that test.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("Unmocked fetch call in test — stub fetch explicitly if this test needs network behavior.");
    }),
  );
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});
