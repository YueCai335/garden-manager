import { render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import LandingPage from "@/app/(marketing)/page";
import { LandingFooter } from "./LandingFooter";
import { LandingHeader } from "./LandingHeader";

function renderLanding() {
  return render(<><LandingHeader /><main><LandingPage /></main><LandingFooter /></>);
}

it("presents the product and links every entry point into the app without calling the API", () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  renderLanding();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Draw your garden. Log it in one sentence.");
  expect(within(screen.getByRole("banner")).getByRole("link", { name: "Open app" })).toHaveAttribute("href", "/gardens");
  expect(screen.getByRole("link", { name: "Open the app" })).toHaveAttribute("href", "/gardens");
  const features = screen.getByRole("region", { name: "Features" });
  const tryLinks = within(features).getAllByRole("link", { name: "Try it" });
  expect(tryLinks.map((link) => link.getAttribute("href"))).toEqual(["/gardens", "/notes", "/season"]);
  expect(tryLinks[1]).toHaveAccessibleDescription("Write one note, get reviewed records");
  expect(within(features).getByRole("link", { name: "Try Plant Doctor" })).toHaveAttribute("href", "/doctor");
  expect(within(features).getByRole("link", { name: "Try Plant Guide" })).toHaveAttribute("href", "/guide");
  expect(within(screen.getByRole("banner")).getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/YueCai335/garden-manager");
  expect(fetch).not.toHaveBeenCalled();
});

it("links the site navigation to the sections on the page", () => {
  renderLanding();
  const site = screen.getByRole("navigation", { name: "Site" });
  for (const link of within(site).getAllByRole("link")) {
    const id = link.getAttribute("href")!.slice(1);
    expect(document.getElementById(id), id).not.toBeNull();
  }
  const footer = screen.getByRole("contentinfo");
  expect(within(footer).getByRole("link", { name: "GitHub" })).toHaveAttribute("href", "https://github.com/YueCai335/garden-manager");
  expect(within(footer).getByRole("link", { name: "Victoria Knyshova" })).toHaveAttribute("href", "https://www.pexels.com/photo/12321610/");
});

it("shows the pre-rendered stills when the browser has no WebGL2", () => {
  // jsdom has no WebGL2RenderingContext, like a browser without WebGL2.
  const { container } = renderLanding();
  const backdrops = container.querySelectorAll("[data-render]");
  expect(backdrops).toHaveLength(2);
  for (const backdrop of backdrops) {
    expect(backdrop).toHaveAttribute("data-render", "still");
    expect(backdrop).toHaveAttribute("aria-hidden", "true");
  }
  expect((backdrops[0] as HTMLElement).style.getPropertyValue("--still")).toBe('url("/landing/hero-still.webp")');
  expect((backdrops[1] as HTMLElement).style.getPropertyValue("--still")).toBe('url("/landing/footer-still.webp")');
});
