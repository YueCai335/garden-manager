import Link from "next/link";
import type { ComponentProps, ComponentPropsWithRef } from "react";
import styles from "./Button.module.css";

type Variant = "primary" | "secondary" | "text" | "danger";
/** "pill" is the rounded ADR-0073 shape, used first by the app's page layers. */
type Shape = "default" | "pill";
const classes = (variant: Variant, shape: Shape, className: string) => `${variant}-button ${shape === "pill" ? styles.pill : ""} ${className}`;
export function Button({ variant = "secondary", shape = "default", loading = false, loadingLabel, children, className = "", disabled, type = "button", ...props }: ComponentPropsWithRef<"button"> & { variant?: Variant; shape?: Shape; loading?: boolean; loadingLabel?: string }) {
  return <button {...props} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={classes(variant, shape, className)}>
    <span className={styles.label}>
      <span aria-hidden={loading || undefined} style={loading ? { visibility: "hidden" } : undefined}>{children}</span>
      {(loadingLabel || loading) && <span aria-hidden={!loading || undefined} style={!loading ? { visibility: "hidden" } : undefined}>{loadingLabel ?? "Working…"}</span>}
    </span>
  </button>;
}
export function ButtonLink({ variant = "secondary", shape = "default", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant; shape?: Shape }) {
  return <Link {...props} className={classes(variant, shape, className)} />;
}
