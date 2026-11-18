import { Suspense, type ReactNode } from "react";
import { WorkspaceProvider } from "@/components/workspace/WorkspaceProvider";
import { AppShell } from "@/components/workspace/AppShell";
import { displayFont } from "@/styles/fonts";
export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  // Hydrate the provider and its consumers together; restoration must not update
  // a still-dehydrated shell with different saving-status text.
  // The wrapper only carries the display font's variable (ADR-0081); it adds no box.
  return <div className={displayFont.variable} style={{ display: "contents" }}>
    <Suspense fallback={<p>Loading your workspace…</p>}><WorkspaceProvider><AppShell>{children}</AppShell></WorkspaceProvider></Suspense>
  </div>;
}
