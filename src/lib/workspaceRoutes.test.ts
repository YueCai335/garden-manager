import { expect, it } from "vitest";
import { areaPath, careView, gardenPath, routeFromPath } from "./workspaceRoutes";
it("encodes entity IDs and parses garden modules without a remembered selection", () => {
  const id = "前院 / A?B";
  expect(routeFromPath(gardenPath(id, "season"))).toEqual({ module: "season", gardenId: id });
  expect(new URL(areaPath(id, "Bed & 1"), "http://localhost").searchParams.get("area")).toBe("Bed & 1");
  expect(routeFromPath("/gardens/new")).toEqual({ module: "new" });
  expect(careView("invalid")).toBe("tasks");
  expect(careView("history")).toBe("history");
});
