import type { ReactNode, Ref } from "react";
import styles from "./PageHeader.module.css";
export function PageHeader({ title, description, headingRef, actions }: { title: string; description?: string; headingRef?: Ref<HTMLHeadingElement>; actions?: ReactNode }) {
  return <div className={styles.header}><div><h1 ref={headingRef} tabIndex={-1}>{title}</h1>{description && <p>{description}</p>}</div>{actions}</div>;
}
