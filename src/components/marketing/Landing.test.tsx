import { act, render, screen, within } from "@testing-library/react";
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

it("shows the Garden Plan showcase as the finished plan when the browser cannot play it", () => {
  // jsdom has no IntersectionObserver, like reduced motion: the section shows the end state.
  renderLanding();
  const section = screen.getByRole("article", { name: "Draw your garden to scale" });
  expect(within(section).getAllByRole("listitem").map((item) => item.querySelector("b")?.textContent)).toEqual(["Draw your garden", "Add planting areas", "Plant at real spacing"]);
  expect(within(section).getByRole("img", { name: /10 by 6 metre sample backyard/ })).toHaveAttribute("data-state", "finished");
  expect(within(section).getByText("One plan, from the whole garden down to every plant.")).toBeInTheDocument();
  expect(within(section).getByRole("link", { name: "Try it" })).toHaveAttribute("href", "/gardens");
  expect(within(section).getByRole("button", { name: "Replay" })).toBeInTheDocument();
});

it("starts the Garden Plan showcase on the finished plan with reduced motion, and Replay keeps it there", async () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
  renderLanding();
  const stage = screen.getByRole("img", { name: /sample backyard/ });
  expect(stage).toHaveAttribute("data-state", "finished");
  within(screen.getByRole("article", { name: "Draw your garden to scale" })).getByRole("button", { name: "Replay" }).click();
  expect(stage).toHaveAttribute("data-state", "finished");
  vi.unstubAllGlobals();
});

it("shows the AI Note showcase with its saved records when the browser cannot play it", () => {
  // jsdom has no IntersectionObserver, like reduced motion: the section shows the end state.
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  renderLanding();
  const section = screen.getByRole("article", { name: "Write one note, get reviewed records" });
  expect(within(section).getAllByRole("listitem").map((item) => item.querySelector("b")?.textContent)).toEqual(["Write it your way", "AI splits it into records", "You review, then save"]);
  const stage = within(section).getByRole("img", { name: /^Sample note: “Watered the tomatoes/ });
  expect(stage).toHaveAttribute("data-state", "saved");
  expect(stage).toHaveAccessibleName(/3 reviewed records: Watering in Backyard, Fertilizing in Backyard, Pest treatment in Allotment/);
  expect(within(section).getByRole("button", { name: "Watered the tomatoes…" })).toHaveAttribute("aria-pressed", "true");
  expect(within(section).getByRole("link", { name: "Try it" })).toHaveAttribute("href", "/notes");
  // The samples are pre-recorded: the showcase never calls the note API.
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

it("plays another AI Note sample from its button, and Replay keeps it, with reduced motion", () => {
  vi.stubGlobal("IntersectionObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query, addEventListener() {}, removeEventListener() {} }));
  renderLanding();
  const section = screen.getByRole("article", { name: "Write one note, get reviewed records" });
  act(() => within(section).getByRole("button", { name: "Planted 6 lettuce…" }).click());
  expect(within(section).getByRole("button", { name: "Planted 6 lettuce…" })).toHaveAttribute("aria-pressed", "true");
  const stage = within(section).getByRole("img", { name: /^Sample note: “Planted 6 lettuce/ });
  expect(stage).toHaveAttribute("data-state", "saved");
  act(() => within(section).getByRole("button", { name: "Replay" }).click());
  expect(within(section).getByRole("img", { name: /^Sample note: “Planted 6 lettuce/ })).toHaveAttribute("data-state", "saved");
  vi.unstubAllGlobals();
});
