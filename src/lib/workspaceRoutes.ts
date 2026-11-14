export type WorkspaceModule = "home" | "new" | "plan" | "care" | "season" | "notes" | "guide" | "doctor";
export type WorkspaceRoute = { module: WorkspaceModule; gardenId?: string };
export const gardenPath = (gardenId: string, module: "plan" | "care" | "season" = "plan") => `/gardens/${encodeURIComponent(gardenId)}/${module}`;
export const areaPath = (gardenId: string, areaId: string) => `${gardenPath(gardenId)}?${new URLSearchParams({ area: areaId })}`;
/** The area's properties editor; on narrower layouts it opens over the zoomed plan. */
export const areaEditPath = (gardenId: string, areaId: string) => `${gardenPath(gardenId)}?${new URLSearchParams({ area: areaId, edit: "area" })}`;
export const careView = (value: string | null): "tasks" | "history" => value === "history" ? "history" : "tasks";
export function routeFromPath(path: string): WorkspaceRoute {
  if (path === "/gardens/new") return { module: "new" };
  const match = /^\/gardens\/([^/]+)\/(plan|care|season)$/.exec(path);
  if (match) {
    try { return { module: match[2] as WorkspaceModule, gardenId: decodeURIComponent(match[1]) }; }
    catch { return { module: match[2] as WorkspaceModule, gardenId: match[1] }; }
  }
  return { module: ({ "/notes": "notes", "/care": "care", "/season": "season", "/guide": "guide", "/doctor": "doctor" } as Record<string, WorkspaceModule>)[path] ?? "home" };
}
