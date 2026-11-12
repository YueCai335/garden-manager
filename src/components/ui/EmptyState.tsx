import type { ReactNode } from "react";
export function EmptyState({ children, action }: { children: ReactNode; action: ReactNode }) {
  return <div><p>{children}</p>{action}</div>;
}
