import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import LandingPage from "@/app/(marketing)/page";
import { LandingHeader } from "./LandingHeader";

it("presents the product and links every entry point into the app without calling the API", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<><LandingHeader /><main><LandingPage /></main></>);
  expect(screen.getByRole("heading", { level: 1 })).toBeVisible();
  expect(screen.getByRole("link", { name: "Open app" })).toHaveAttribute("href", "/gardens");
  expect(screen.getByRole("link", { name: "Open the app" })).toHaveAttribute("href", "/gardens");
  const features = screen.getByRole("region", { name: "Features" });
  const tryLinks = within(features).getAllByRole("link", { name: "Try it" });
  expect(tryLinks.map((link) => link.getAttribute("href"))).toEqual(["/gardens", "/notes"]);
  expect(tryLinks[1]).toHaveAccessibleDescription("Write one note, get reviewed records");
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});
