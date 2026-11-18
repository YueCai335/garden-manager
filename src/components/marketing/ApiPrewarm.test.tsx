import { render } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ApiPrewarm } from "./ApiPrewarm";

it("sends one fire-and-forget request that wakes the API", () => {
  const fetch = vi.fn(() => Promise.resolve(new Response(null)));
  vi.stubGlobal("fetch", fetch);
  const { container } = render(<ApiPrewarm />);
  expect(container).toBeEmptyDOMElement();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("http://localhost:8000/health", { mode: "no-cors", cache: "no-store" });
});

it("ignores an unreachable API", async () => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))));
  expect(() => render(<ApiPrewarm />)).not.toThrow();
  // A rejected request must not surface as an unhandled rejection.
  await Promise.resolve();
});
