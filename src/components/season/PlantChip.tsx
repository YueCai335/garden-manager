import type { PlantColors } from "@/lib/planAppearance";
import styles from "./Season.module.css";

/** A plant's colour dot and name, in the colours the Garden Plan draws it in (ADR-0076). */
export function PlantChip({ name, colors }: { name: string; colors: PlantColors }) {
  return (
    <span className={styles.plant}>
      <i data-plant-swatch style={{ background: colors.fill, borderColor: colors.stroke }} aria-hidden="true" />
      {name}
    </span>
  );
}
