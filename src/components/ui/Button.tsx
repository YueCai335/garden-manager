import Link from "next/link";
import type { ComponentProps, ComponentPropsWithRef } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "text" | "danger";
export function Button({ variant = "secondary", loading = false, loadingLabel, children, className = "", disabled, type = "button", ...props }: ComponentPropsWithRef<"button"> & { variant?: Variant; loading?: boolean; loadingLabel?: string }) {
  return <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={`${variant}-button ${className}`}>
    <span className={styles.label}>
      <span aria-hidden={loading || undefined} style={loading ? { visibility: "hidden" } : undefined}>{children}</span>
      {(loadingLabel || loading) && <span aria-hidden={!loading || undefined} style={!loading ? { visibility: "hidden" } : undefined}>{loadingLabel ?? "Working…"}</span>}
    </span>
  </button>;
}
export function ButtonLink({ variant = "secondary", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link {...props} className={`${variant}-button ${className}`} />;
}
