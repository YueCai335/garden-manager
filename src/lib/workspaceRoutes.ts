export type WorkspaceModule = "home" | "new" | "plan" | "care" | "season" | "notes" | "guide" | "doctor";
export type WorkspaceRoute = { module: WorkspaceModule; gardenId?: string };
/** The app's home, the Gardens overview. `/` is the landing page, outside the app (ADR-0073). */
export const workspaceHomePath = "/gardens";
/** A garden's own page, the Garden Plan; it is the only garden-level (L2) route. */
export const gardenPath = (gardenId: string) => `/gardens/${encodeURIComponent(gardenId)}/plan`;
/** An area open on the Plants level, zoomed in for planting (ADR-0075). */
export const areaPath = (gardenId: string, areaId: string) => `${gardenPath(gardenId)}?${new URLSearchParams({ area: areaId })}`;
/**
 * A plan level, with an optional area: open on Plants, selected on Planting
 * areas. Garden is the bare plan address, its default level (ADR-0078).
 */
export const planLevelPath = (gardenId: string, level: "garden" | "areas" | "plants", areaId?: string) =>
  level === "garden" ? gardenPath(gardenId)
    : level === "plants" && areaId ? areaPath(gardenId, areaId)
    : `${gardenPath(gardenId)}?${new URLSearchParams({ level, ...(areaId ? { area: areaId } : {}) })}`;
/** The area's properties editor on Planting areas; on narrower layouts it opens over the plan. */
export const areaEditPath = (gardenId: string, areaId: string) => `${gardenPath(gardenId)}?${new URLSearchParams({ level: "areas", area: areaId, edit: "area" })}`;
export const careView = (value: string | null): "tasks" | "history" => value === "history" ? "history" : "tasks";
/** Care filtered to one location: a garden ID, or "all-gardens" for workspace-wide records. */
export const careLocationPath = (location: string, view?: "tasks" | "history") =>
  `/care?${new URLSearchParams({ ...(view ? { view } : {}), location })}`;
/** History's care-type filter from `?type=`; anything else means every type (ADR-0080). */
export const careHistoryType = (value: string | null): "all" | "watering" | "fertilizing" => value === "watering" || value === "fertilizing" ? value : "all";
/** History with its filters; "all" leaves a filter out of the address. */
export const careHistoryPath = (location: string, type: "all" | "watering" | "fertilizing") =>
  `/care?${new URLSearchParams({ view: "history", ...(location !== "all" ? { location } : {}), ...(type !== "all" ? { type } : {}) })}`;
/** Next Season filtered to one garden. */
export const seasonGardenPath = (gardenId: string) => `/season?${new URLSearchParams({ garden: gardenId })}`;
/**
 * The old garden-level Care and Next Season routes now land on the L1 module
 * filtered to that garden (ADR-0073, phase S3). `next.config.ts` serves these
 * as HTTP 307 redirects before any page renders, so the old URL never becomes
 * a history entry. Next.js appends the incoming query, so Care keeps `view`.
 */
export const legacyGardenRedirects = [
  { source: "/gardens/:gardenId/care", destination: "/care?location=:gardenId", permanent: false },
  { source: "/gardens/:gardenId/season", destination: "/season?garden=:gardenId", permanent: false },
] as const;
export function routeFromPath(path: string): WorkspaceRoute {
  if (path === "/gardens/new") return { module: "new" };
  if (path === workspaceHomePath) return { module: "home" };
  const match = /^\/gardens\/([^/]+)\/plan$/.exec(path);
  if (match) {
    try { return { module: "plan", gardenId: decodeURIComponent(match[1]) }; }
    catch { return { module: "plan", gardenId: match[1] }; }
  }
  return { module: ({ "/notes": "notes", "/care": "care", "/season": "season", "/guide": "guide", "/doctor": "doctor" } as Record<string, WorkspaceModule>)[path] ?? "home" };
}
