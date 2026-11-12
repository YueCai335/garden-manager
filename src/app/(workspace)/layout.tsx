import { Suspense, type ReactNode } from "react";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { AppShell } from "@/components/workspace/AppShell";
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  // Hydrate the provider and its consumers together; restoration must not update
  // a still-dehydrated shell with different saving-status text.
  return <Suspense fallback={<p>Loading your workspace…</p>}><WorkspaceProvider><AppShell>{children}</AppShell></WorkspaceProvider></Suspense>;
}
