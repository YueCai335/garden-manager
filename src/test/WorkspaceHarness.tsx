import { usePathname } from "next/navigation";
import { GardenWorkspace as Screen } from "@/components/GardenWorkspace";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { AppShell } from "@/components/workspace/AppShell";
import { routeFromPath } from "@/lib/workspaceRoutes";
export { SERVER_WORKSPACE_STORAGE_KEY } from "@/hooks/useWorkspaceSync";
export function GardenWorkspace() {
  const pathname = usePathname();
  return <WorkspaceProvider><AppShell><Screen key={pathname} route={routeFromPath(pathname)} /></AppShell></WorkspaceProvider>;
}
