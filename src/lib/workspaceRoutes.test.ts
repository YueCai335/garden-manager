import { expect, it } from "vitest";
import nextConfig from "../../next.config";
import { areaPath, careLocationPath, careView, gardenPath, legacyGardenRedirects, routeFromPath, seasonGardenPath, workspaceHomePath } from "./workspaceRoutes";
it("encodes entity IDs and parses garden modules without a remembered selection", () => {
  const id = "前院 / A?B";
  expect(routeFromPath(gardenPath(id))).toEqual({ module: "plan", gardenId: id });
  expect(new URL(areaPath(id, "Bed & 1"), "http://localhost").searchParams.get("area")).toBe("Bed & 1");
  expect(routeFromPath("/gardens/new")).toEqual({ module: "new" });
  expect(careView("invalid")).toBe("tasks");
  expect(careView("history")).toBe("history");
});
it("puts the app home at /gardens, outside the landing page", () => {
  expect(workspaceHomePath).toBe("/gardens");
  expect(routeFromPath("/gardens")).toEqual({ module: "home" });
  expect(routeFromPath("/gardens/new")).toEqual({ module: "new" });
  expect(routeFromPath("/gardens/front/plan")).toEqual({ module: "plan", gardenId: "front" });
});
it("links a garden's care and season plan to the filtered L1 modules", () => {
  const id = "前院 / A?B";
  const care = new URL(careLocationPath(id, "history"), "http://localhost");
  expect(care.pathname).toBe("/care");
  expect(care.searchParams.get("location")).toBe(id);
  expect(care.searchParams.get("view")).toBe("history");
  expect(careLocationPath("front")).toBe("/care?location=front");
  const season = new URL(seasonGardenPath(id), "http://localhost");
  expect(season.pathname).toBe("/season");
  expect(season.searchParams.get("garden")).toBe(id);
  // Care and Next Season are L1 modules only; no garden-level route parses as them.
  expect(routeFromPath("/care")).toEqual({ module: "care" });
  expect(routeFromPath("/season")).toEqual({ module: "season" });
  expect(routeFromPath("/gardens/front/care").gardenId).toBeUndefined();
});
it("redirects the old garden-level Care and Next Season routes to the filtered views with a temporary redirect", async () => {
  const config = await nextConfig.redirects!();
  expect(config).toEqual([...legacyGardenRedirects]);
  expect(config).toEqual([
    // 307, not 308: browsers do not cache it, so the redirect can change later.
    { source: "/gardens/:gardenId/care", destination: "/care?location=:gardenId", permanent: false },
    { source: "/gardens/:gardenId/season", destination: "/season?garden=:gardenId", permanent: false },
  ]);
  // Each destination is the same filtered L1 view the app links to.
  for (const rule of config) {
    const destination = new URL(rule.destination.replace(":gardenId", "front"), "http://localhost");
    expect(routeFromPath(destination.pathname).gardenId).toBeUndefined();
  }
  expect(config[0].destination.replace(":gardenId", "front")).toBe(careLocationPath("front"));
  expect(config[1].destination.replace(":gardenId", "front")).toBe(seasonGardenPath("front"));
  // The Garden Plan is the only garden route left, and no rule touches it.
  expect(config.some((rule) => rule.source.endsWith("/plan"))).toBe(false);
});
