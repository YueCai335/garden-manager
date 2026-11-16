"use client";

import type { CSSProperties, ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useRuntimeConfig } from "@/components/PortfolioFeaturePreview";
import { useOpenGardenNote } from "@/components/workspace/AppShell";
import { setupStepLabels, setupSteps, setupTrack, stepIndex, type GuidedSetup, type SetupStep } from "@/lib/guidedSetup";
import { planLevelHints, planLevelLabels, planLevelShortLabels, planLevels, type PlanLevel } from "@/lib/planLevels";
import styles from "./Setup.module.css";

/**
 * The guided setup's four-step track (ADR-0072, phase G6): "Step N of 4",
 * a check on completed steps, and an emphasised current step. Steps already
 * reached are buttons; later steps are plain text and cannot be skipped to.
 */
export function SetupProgress({ setup, onStep }: { setup: Pick<GuidedSetup, "step" | "reached">; onStep: (step: SetupStep) => void }) {
  const track = setupTrack(setup);
  const current = stepIndex(setup.step);
  return <nav className={styles.setup} aria-label="Guided setup">
    <p className={styles.status} aria-live="polite">Step {current + 1} of {setupSteps.length} · {setupStepLabels[setup.step]}</p>
    <ol className={styles.track} style={{ "--setup-progress": current / (setupSteps.length - 1) } as CSSProperties}>
      {track.map((item) => {
        const marker = <span className={styles.marker} aria-hidden="true">{item.status === "complete" ? "✓" : item.number}</span>;
        // The visible label is hidden from assistive technology; one hidden text carries "label, state".
        const state = item.status === "complete" ? "completed" : item.status === "current" ? "current step" : item.status === "available" ? "reached" : "not started";
        return <li key={item.step} data-status={item.status}>
          {item.clickable
            ? <button type="button" className={styles.stepButton} onClick={() => onStep(item.step)}>{marker}<span aria-hidden="true">{item.label}</span><span className={styles.srOnly}>{item.label}, {state}</span></button>
            : <span className={styles.stepText} aria-current={item.status === "current" ? "step" : undefined}>{marker}<span aria-hidden="true">{item.label}</span><span className={styles.srOnly}>{item.label}, {state}</span></span>}
        </li>;
      })}
    </ol>
  </nav>;
}

/**
 * An existing garden's three levels (ADR-0075): a switcher rather than
 * progress. Every level is a button at any time, the current one is marked,
 * and there is no step count, Continue, or Ready. The parts are joined arrows
 * in one strip (ADR-0078), so the bar reads as one garden going a level deeper.
 */
export function PlanLevelBar({ level, onLevel, disabled = {} }: {
  level: PlanLevel;
  onLevel: (level: PlanLevel) => void;
  /** Levels that have nothing to work on yet, with the reason shown as a hint. */
  disabled?: Partial<Record<PlanLevel, string>>;
}) {
  return <nav className={styles.levelBar} aria-label="Garden Plan levels">
    <ol className={styles.arrows}>
      {planLevels.map((item, index) => {
        const current = item === level;
        const reason = disabled[item];
        return <li key={item} data-status={current ? "current" : "available"}>
          <button type="button" className={styles.arrow} aria-current={current ? "true" : undefined}
            aria-label={planLevelLabels[item]} aria-describedby={reason ? `plan-level-${item}-hint` : undefined}
            disabled={Boolean(reason)} onClick={() => { if (!current) onLevel(item); }}>
            <span className={styles.arrowMarker} aria-hidden="true">{index + 1}</span>
            <span className={styles.arrowText} aria-hidden="true">
              <span className={styles.levelLabel}>{planLevelLabels[item]}</span>
              <span className={styles.levelShortLabel}>{planLevelShortLabels[item]}</span>
              <small className={styles.levelHint}>{planLevelHints[item]}</small>
            </span>
          </button>
          {reason && <span id={`plan-level-${item}-hint`} className={styles.srOnly}>{reason}</span>}
        </li>;
      })}
    </ol>
  </nav>;
}

/** One step's instructions and its Continue control, shown under the track. */
export function SetupStepPanel({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return <section className={styles.panel} aria-labelledby="setup-step-heading">
    <h3 id="setup-step-heading">{title}</h3>
    {children}
    {actions && <div className={styles.actions}>{actions}</div>}
  </section>;
}

/** The Ready step: what the garden now holds and where to go next. */
export function SetupReady({ gardenId, gardenName, summary, careHref, seasonHref, onLeave, onFinish }: {
  gardenId: string;
  gardenName: string;
  summary: { areas: number; plants: number; plantGroups: number };
  careHref: string;
  seasonHref: string;
  /** Called when a link leaves the guide for another page. */
  onLeave: () => void;
  onFinish: () => void;
}) {
  // The note opens in the same dialog and session as Overview's AI Garden Notes.
  const openNote = useOpenGardenNote();
  const { config } = useRuntimeConfig();
  const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;
  return <SetupStepPanel title={`${gardenName} is ready`} actions={<Button variant="primary" onClick={onFinish}>Finish setup</Button>}>
    <ul className={styles.summary} aria-label="Garden summary">
      <li><strong>{count(summary.areas, "planting area", "planting areas")}</strong></li>
      <li><strong>{count(summary.plants, "plant", "plants")}</strong></li>
      <li><strong>{count(summary.plantGroups, "plant group", "plant groups")}</strong></li>
    </ul>
    <p>Care records and season plans attach to these areas and plant groups. Pick where to go next.</p>
    <ul className={styles.next} aria-label="Next steps">
      <li><ButtonLink href={careHref} onClick={onLeave}>Log the first watering</ButtonLink><span>Care for this garden</span></li>
      {openNote && <li><Button aria-haspopup="dialog" onClick={(event) => openNote(event.currentTarget, { batchAvailable: config?.careNoteBatchAvailable === true, gardenId })}>Write a Garden Note</Button><span>Turn a quick note into care records</span></li>}
      <li><ButtonLink href={seasonHref} onClick={onLeave}>Plan next season</ButtonLink><span>Next Season for this garden</span></li>
    </ul>
  </SetupStepPanel>;
}
