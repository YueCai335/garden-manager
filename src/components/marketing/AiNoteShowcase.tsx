"use client";
import Link from "next/link";
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { CareEventType } from "@/lib/careTypes";
import {
  applyNoteAction,
  finalNoteState,
  initialNoteState,
  noteSamples,
  noteTimeline,
  recordTypeName,
  sampleDescription,
  type NoteShowcaseState,
} from "./aiNoteScene";
import styles from "./AiNoteShowcase.module.css";

type Props = {
  className?: string;
  index: number;
  feature: { id: string; label: string; title: string; links: { label: string; href: string }[]; steps: { title: string; text: string }[]; summary: string };
};

type Wire = { d: string; x1: number; y1: number; x2: number; y2: number };

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(" ");
/** The care type colour: deep on the white record card, light on the dark note card (tokens.css). */
const typeStyle = (type: CareEventType) => ({ "--c": `var(--color-care-${type})`, "--c-dark": `var(--color-care-${type}-on-dark)` }) as CSSProperties;
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * The AI Note section of the landing page (ADR-0088): a textured strip with three step cards
 * above a white stage, where a pre-recorded sample note types out, splits into care records
 * along measured wires, and is saved after review. It plays once when the stage scrolls into
 * view; Replay and the sample buttons play it again. With reduced motion, or without
 * IntersectionObserver, it shows the saved records. It never calls the note API.
 */
export function AiNoteShowcase({ className, feature, index }: Props) {
  const [sampleIndex, setSampleIndex] = useState(0);
  const [state, setState] = useState<NoteShowcaseState>(initialNoteState);
  // Set when the end state is shown at once, so the wires appear without drawing.
  const [instant, setInstant] = useState(false);
  const [wires, setWires] = useState<Wire[]>([]);
  const timers = useRef<number[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);
  const phraseRefs = useRef<(HTMLSpanElement | null)[]>([]);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const sample = noteSamples[sampleIndex];

  const stop = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    timers.current = [];
  }, []);

  const showFinal = useCallback((next: number) => {
    stop();
    setSampleIndex(next);
    setInstant(true);
    setState(finalNoteState(noteSamples[next]));
  }, [stop]);

  const play = useCallback((next: number) => {
    if (reducedMotion()) { showFinal(next); return; }
    stop();
    setSampleIndex(next);
    setInstant(false);
    setState(initialNoteState);
    for (const { at, action } of noteTimeline(noteSamples[next])) {
      timers.current.push(window.setTimeout(() => setState((current) => applyNoteAction(current, action)), at));
    }
  }, [showFinal, stop]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || reducedMotion() || typeof IntersectionObserver === "undefined") { showFinal(0); return stop; }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      play(0);
    }, { threshold: 0.4 });
    observer.observe(stage);
    return () => { observer.disconnect(); stop(); };
  }, [play, showFinal, stop]);

  // Each wire leaves the note card's right edge level with its phrase and ends at its record card.
  // Measured again whenever the group changes size, so the wires follow the real layout.
  useLayoutEffect(() => {
    const group = groupRef.current;
    const measure = () => {
      const note = noteRef.current;
      if (!group || !note) return;
      const box = group.getBoundingClientRect();
      const edge = note.getBoundingClientRect().right - box.left;
      const next: Wire[] = [];
      for (let record = 0; record < state.found; record += 1) {
        const rects = phraseRefs.current[record]?.getClientRects();
        const card = cardRefs.current[record]?.getBoundingClientRect();
        const last = rects?.[rects.length - 1];
        if (!last || !card) continue;
        const y1 = last.top + last.height / 2 - box.top;
        const x2 = card.left - box.left;
        const y2 = card.top - box.top + 24;
        const bend = (x2 - edge) * 0.55;
        next.push({ d: `M${edge} ${y1} C${edge + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`, x1: edge, y1, x2, y2 });
      }
      setWires(next);
    };
    measure();
    if (!group || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    return () => observer.disconnect();
  }, [state.found, sampleIndex]);

  const records = sample.records.length;
  const [tryLink] = feature.links;
  let remaining = state.typed;

  return <article id={feature.id} className={cx(styles.band, className)} aria-labelledby={`feature-${feature.id}`}>
    <div className={styles.strip}>
      <div>
        <p className={styles.kicker}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{feature.label}</p>
        <h2 id={`feature-${feature.id}`}>{feature.title}</h2>
      </div>
      <ol className={styles.steps}>
        {feature.steps.map((step, stepIndex) => <li key={step.title} className={cx(styles.step, state.active === stepIndex && styles.on, (state.finished || (state.active ?? 0) > stepIndex) && styles.done)}>
          <span className={styles.num} aria-hidden="true">{String(stepIndex + 1).padStart(2, "0")}</span>
          <div><b>{step.title}</b><p>{step.text}</p></div>
        </li>)}
      </ol>
    </div>

    <div ref={stageRef} className={styles.stage}>
      <div className={styles.samples} role="group" aria-label="Sample notes, pre-recorded">
        <span className={styles.sampleLabel} aria-hidden="true">Sample notes<small>pre-recorded</small></span>
        {noteSamples.map((option, optionIndex) => <button key={option.id} type="button" className={styles.pill} aria-pressed={optionIndex === sampleIndex} onClick={() => play(optionIndex)}>{option.label}</button>)}
      </div>

      <div
        ref={groupRef}
        className={styles.group}
        role="img"
        aria-label={sampleDescription(sample)}
        data-sample={sample.id}
        data-state={state.finished ? "saved" : state.found > 0 ? "splitting" : "typing"}
      >
        <div ref={noteRef} className={styles.note}>
          <div className={styles.noteHead}><b>AI Note</b><span>Today</span></div>
          <p className={styles.text}>
            {sample.segments.map((segment, segmentIndex) => {
              const shown = segment.text.slice(0, Math.max(0, remaining));
              remaining -= segment.text.length;
              const record = segment.record;
              if (record === undefined) return <span key={segmentIndex}>{shown}</span>;
              return <span key={segmentIndex} ref={(element) => { phraseRefs.current[record] = element; }}
                className={cx(styles.phrase, record < state.found && styles.lit)} style={typeStyle(sample.records[record].type)}>{shown}</span>;
            })}
            {!state.reading && !state.review && <i className={styles.caret} />}
          </p>
          <span className={cx(styles.read, state.reading && styles.busy)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
            <span>{state.review ? `${records} records found` : state.reading ? "Reading…" : "Read note"}</span>
          </span>
        </div>

        <div className={styles.records}>
          {sample.records.map((record, recordIndex) => {
            const saved = recordIndex < state.saved;
            return <div key={`${sample.id}-${recordIndex}`} ref={(element) => { cardRefs.current[recordIndex] = element; }}
              className={cx(styles.card, recordIndex < state.found && styles.in, saved && styles.saved)} style={typeStyle(record.type)}>
              <div className={styles.cardHead}>
                <span className={styles.icon}><i /></span>
                <b>{recordTypeName[record.type]}</b>
                <span className={styles.garden}>{record.garden}</span>
                <span className={cx(styles.status, saved && styles.ok)}>
                  {saved && <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
                  {saved ? "Saved" : "Review"}
                </span>
              </div>
              <dl className={styles.fields}>
                {record.fields.map(([label, value]) => <Fragment key={label}><dt>{label}</dt><dd>{value}</dd></Fragment>)}
              </dl>
              {record.completes && <p className={styles.completes}>Completes “{record.completes.title}” · due {record.completes.due}</p>}
            </div>;
          })}
        </div>

        <svg className={cx(styles.wires, instant && styles.instant)} data-part="wires" aria-hidden="true">
          {wires.map((wire, wireIndex) => <g key={`${sample.id}-${wireIndex}`}>
            <path d={wire.d} pathLength={1} />
            <circle cx={wire.x1} cy={wire.y1} r={4} />
            <circle className={styles.end} cx={wire.x2} cy={wire.y2} r={4} />
          </g>)}
        </svg>
        {/* A small dot runs along each new wire once. */}
        {!instant && wires.map((wire, wireIndex) => <span key={`${sample.id}-${wireIndex}`} className={styles.spark} style={{ offsetPath: `path("${wire.d}")` }} aria-hidden="true" />)}
      </div>

      <div className={styles.footer}>
        <div className={styles.ctas}>
          <Link className={styles.solid} href={tryLink.href} aria-describedby={`feature-${feature.id}`}>{tryLink.label}</Link>
          <button type="button" className={styles.ghost} onClick={() => play(sampleIndex)}><span aria-hidden="true">↻</span>Replay</button>
        </div>
        <div className={cx(styles.save, state.review && styles.in)} aria-hidden="true">
          <small>{state.finished ? feature.summary : "Nothing saves until you do"}</small>
          <span className={cx(styles.saveButton, state.pressed && styles.pressed)}>{state.finished ? "Saved to Care" : `Save ${records} records`}</span>
        </div>
      </div>
    </div>
  </article>;
}
