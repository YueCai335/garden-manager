"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  applyShowcaseAction,
  cropColors,
  EXPLODE_Z,
  finalShowcaseState,
  gardenTag,
  initialShowcaseState,
  layerMarkers,
  PX_PER_METRE,
  plantTags,
  sceneAreas,
  sceneColors,
  scenePlants,
  SHEET,
  showcaseTimeline,
  type SceneArea,
  type SceneTag,
  type ShowcaseState,
} from "./gardenPlanScene";
import styles from "./GardenPlanShowcase.module.css";

/** The stage size the scene's positions were drawn for; smaller stages scale the whole scene down. */
const STAGE = { width: 760, height: 688 };
const { width: W, height: H } = SHEET;

type Props = {
  className?: string;
  index: number;
  feature: { id: string; label: string; title: string; links: { label: string; href: string }[]; steps: { title: string; text: string }[]; summary: string };
};

const cx = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(" ");
const zStyle = (z: number) => ({ "--z": `${z}px` }) as CSSProperties;

/**
 * The Garden Plan section of the landing page (ADR-0084): a textured slab with three
 * numbered steps, and a white stage where a sample backyard builds in a 45° isometric
 * view, lifts into its three layers, and closes into the finished plan. It plays once
 * when the stage scrolls into view; Replay plays it again. With reduced motion, or
 * without IntersectionObserver, it shows the finished plan.
 */
export function GardenPlanShowcase({ className, feature, index }: Props) {
  const [state, setState] = useState<ShowcaseState>(initialShowcaseState);
  const [snap, setSnap] = useState(false);
  const timers = useRef<number[]>([]);
  const frames = useRef<number[]>([]);
  const stageRef = useRef<HTMLDivElement>(null);

  const stop = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    for (const frame of frames.current) window.cancelAnimationFrame(frame);
    timers.current = [];
    frames.current = [];
  }, []);

  // Jump to a state without transitions, then turn transitions back on.
  const jump = useCallback((next: ShowcaseState) => {
    stop();
    setSnap(true);
    setState(next);
    frames.current.push(window.requestAnimationFrame(() => { frames.current.push(window.requestAnimationFrame(() => setSnap(false))); }));
  }, [stop]);

  const play = useCallback(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { jump(finalShowcaseState); return; }
    jump(initialShowcaseState);
    for (const { at, action } of showcaseTimeline()) {
      timers.current.push(window.setTimeout(() => setState((current) => applyShowcaseAction(current, action)), at));
    }
  }, [jump]);

  useEffect(() => {
    const stage = stageRef.current;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (!stage || reduced || typeof IntersectionObserver === "undefined") { jump(finalShowcaseState); return stop; }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      play();
    }, { threshold: 0.4 });
    observer.observe(stage);
    return () => { observer.disconnect(); stop(); };
  }, [jump, play, stop]);

  // Fit the drawn stage into the real one; labels counter-scale, so they keep their size.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const { width, height } = stage.getBoundingClientRect();
      const scale = Math.min(width / STAGE.width, height / STAGE.height);
      stage.style.setProperty("--fit", String(scale));
      stage.style.setProperty("--ox", `${(width - STAGE.width * scale) / 2}px`);
      stage.style.setProperty("--oy", `${(height - STAGE.height * scale) / 2}px`);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    fit();
    return () => observer.disconnect();
  }, []);

  const landed = new Set(state.landed);
  const finished = state.summary;
  const [tryLink] = feature.links;

  return <article id={feature.id} className={cx(styles.band, snap && styles.snap, className)} aria-labelledby={`feature-${feature.id}`}>
    <div className={styles.slab}>
      <p className={styles.kicker}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{feature.label}</p>
      <h2 id={`feature-${feature.id}`}>{feature.title}</h2>
      <ol className={styles.steps}>
        {feature.steps.map((step, stepIndex) => <li key={step.title} className={cx(styles.step, state.active === stepIndex && styles.on, (stepIndex < state.reached || finished) && styles.done)}>
          <span className={styles.num} aria-hidden="true">{String(stepIndex + 1).padStart(2, "0")}</span>
          <div><b>{step.title}</b><p>{step.text}</p></div>
        </li>)}
      </ol>
      <p className={cx(styles.summary, state.summary && styles.on)}>{feature.summary}</p>
      <div className={styles.ctas}>
        <Link className={styles.solid} href={tryLink.href} aria-describedby={`feature-${feature.id}`}>{tryLink.label}</Link>
        <button type="button" className={styles.ghost} onClick={play}><span aria-hidden="true">↻</span>Replay</button>
      </div>
    </div>

    <div className={styles.paper}>
      <div
        ref={stageRef}
        className={cx(styles.stage, state.exploded && styles.pulled)}
        role="img"
        aria-label="A 10 by 6 metre sample backyard: two raised beds with tomatoes and lettuce, two pots with basil and marigold, and an in-ground bed of carrots."
        data-state={finished ? "finished" : state.exploded ? "exploded" : "building"}
      >
        <div className={styles.scene}>
          <GardenLayer state={state} landed={landed} />
          <AreaLayer state={state} landed={landed} />
          <PlantLayer state={state} landed={landed} />
        </div>
      </div>
      {/* Phones show a letter pin per crop group on the scene and name the groups here (ADR-0084). */}
      <ul className={styles.legend} aria-hidden="true">
        {plantTags.map((tag) => <li key={tag.id} className={cx(landed.has(tag.id) && styles.on)}>
          <span className={styles.key} style={{ background: cropColors[tag.crop].stroke }}>{tag.letter}</span>{tag.name}
        </li>)}
      </ul>
    </div>
  </article>;
}

type LayerProps = { state: ShowcaseState; landed: Set<string> };

function Item({ id, landed, x, y, width = 0, height = 0, z = 0, className, children, style }: {
  id: string; landed: Set<string>; x: number; y: number; width?: number; height?: number; z?: number; className?: string; children?: ReactNode; style?: CSSProperties;
}) {
  return <div className={cx(styles.item, !landed.has(id) && styles.up, className)} style={{ left: x, top: y, width, height, ...zStyle(z), ...style }}>{children}</div>;
}

/** A label that always faces the viewer at one screen size, pinned to its object by a stem and a dot. */
function Tag({ tag, id, landed, hidden, swatch, light, letter, className }: {
  tag: SceneTag; id: string; landed: Set<string>; hidden?: boolean; swatch?: string; light?: boolean; letter?: string; className?: string;
}) {
  return <Item id={id} landed={landed} x={tag.x} y={tag.y} z={tag.z} className={cx(hidden && styles.hide, className)}>
    <div className={styles.billboard}>
      <span className={cx(styles.tag, light && styles.light)}>
        {swatch && <span className={styles.dot} style={{ background: swatch }} />}
        {tag.name}{tag.detail && <small>{tag.detail}</small>}
      </span>
      {letter && <span className={styles.pin} style={{ background: swatch }} aria-hidden="true">{letter}</span>}
    </div>
  </Item>;
}

function Layer({ index, state, children }: { index: number; state: ShowcaseState; children: ReactNode }) {
  const z = state.exploded ? EXPLODE_Z[index] : 0;
  return <div className={cx(styles.layer, state.exploded && styles.lit, state.active === index && styles.on)} style={{ transform: `translateZ(${z}px)` }}>
    {index > 0 && <>
      <div className={styles.plate} />
      <div className={styles.shade} style={{ transform: `translateZ(${-(EXPLODE_Z[index] - EXPLODE_Z[index - 1]) + 2}px)` }} />
    </>}
    {children}
    {/* A numbered marker pinned to the layer's outer corner; it rides with the layer. */}
    <div className={styles.markerAnchor} style={{ left: W, top: H }}>
      <div className={styles.markerBillboard}>
        <span className={cx(styles.mark, state.markers > index && styles.visible, state.active === index && styles.on)}>
          <span className={styles.num}>{String(index + 1).padStart(2, "0")}</span><b>{layerMarkers[index]}</b>
        </span>
      </div>
    </div>
  </div>;
}

function GardenLayer({ state, landed }: LayerProps) {
  const lines: ReactNode[] = [];
  for (let x = PX_PER_METRE; x < W; x += PX_PER_METRE) lines.push(<line key={`x${x}`} x1={x} y1={0} x2={x} y2={H} />);
  for (let y = PX_PER_METRE; y < H; y += PX_PER_METRE) lines.push(<line key={`y${y}`} x1={0} y1={y} x2={W} y2={y} />);
  return <Layer index={0} state={state}>
    <Item id="ground" landed={landed} x={0} y={0} width={W} height={H}>
      <div className={styles.drop} />
      <div className={styles.sheet} />
      <div className={styles.sideFront} />
      <div className={styles.sideLeft} />
      <svg className={styles.overlay} width={W} height={H}>
        <g className={styles.grid}>{lines}</g>
        <rect className={cx(styles.outline, state.outline && styles.drawn)} x={1.5} y={1.5} width={W - 3} height={H - 3} />
      </svg>
      <div className={cx(styles.ruler, state.rulers && styles.on)} style={{ left: 0, top: H + 34, width: W, height: 20 }}>
        <svg className={styles.overlay} width={W} height={20}>
          <g><line x1={0} y1={0} x2={0} y2={12} /><line x1={W} y1={0} x2={W} y2={12} /><line className={styles.gap} x1={0} y1={6} x2={W / 2 - 16} y2={6} /><line className={styles.gap} x1={W / 2 + 16} y1={6} x2={W} y2={6} /><line className={styles.wide} x1={0} y1={6} x2={W / 2 - 30} y2={6} /><line className={styles.wide} x1={W / 2 + 30} y1={6} x2={W} y2={6} /></g>
        </svg>
        <span className={styles.rulerLabel} style={{ left: W / 2, top: 6 }}>10 m</span>
      </div>
      <div className={cx(styles.ruler, state.rulers && styles.on)} style={{ left: -48, top: 0, width: 20, height: H }}>
        <svg className={styles.overlay} width={20} height={H}>
          <g><line x1={8} y1={0} x2={20} y2={0} /><line x1={8} y1={H} x2={20} y2={H} /><line className={styles.gap} x1={14} y1={0} x2={14} y2={H / 2 - 14} /><line className={styles.gap} x1={14} y1={H / 2 + 14} x2={14} y2={H} /><line className={styles.wide} x1={14} y1={0} x2={14} y2={H / 2 - 26} /><line className={styles.wide} x1={14} y1={H / 2 + 26} x2={14} y2={H} /></g>
        </svg>
        <span className={cx(styles.rulerLabel, styles.vertical)} style={{ left: 14, top: H / 2 }}>6 m</span>
      </div>
    </Item>
    <Tag id={gardenTag.id} tag={gardenTag} landed={landed} light className={styles.areaTag} />
  </Layer>;
}

function RaisedBed({ area, landed, wall = 13 }: { area: Extract<SceneArea, { kind: "raised-bed" }>; landed: Set<string>; wall?: number }) {
  const { width: w, height: h } = area;
  const walls: CSSProperties[] = [
    { left: 0, top: h, width: w, height: wall, transform: "rotateX(90deg)", background: "#9a7752" },
    { left: 0, top: 0, width: w, height: wall, transform: "rotateX(90deg)", background: "#7f6043" },
    { left: 0, top: 0, width: wall, height: h, transform: "rotateY(-90deg)", background: "#6f5239" },
    { left: w, top: 0, width: wall, height: h, transform: "rotateY(-90deg)", background: "#86664a" },
  ];
  return <Item id={area.id} landed={landed} x={area.x} y={area.y} width={w} height={h}>
    <div className={styles.face} style={{ inset: 0, background: sceneColors.raisedBedSoil }} />
    {walls.map((style, wallIndex) => <div key={wallIndex} className={styles.wall} style={style} />)}
    <div className={styles.soil} style={{ transform: `translateZ(${wall - 4}px)` }} />
    <div className={styles.rim} style={{ transform: `translateZ(${wall}px)`, borderColor: sceneColors.raisedBedRim }} />
  </Item>;
}

/** A round pot built from thin wall panels, shaded as if lit from the front left. */
function Container({ area, landed, wall = 16 }: { area: Extract<SceneArea, { kind: "container" }>; landed: Set<string>; wall?: number }) {
  const { r } = area;
  const panels = 22;
  const panelWidth = 2 * r * Math.sin(Math.PI / panels) + 0.8;
  return <Item id={area.id} landed={landed} x={area.cx - r} y={area.cy - r} width={r * 2} height={r * 2}>
    {Array.from({ length: panels }, (_, panel) => {
      const angle = (360 / panels) * panel;
      const shade = 0.72 + 0.28 * Math.cos(((angle - 200) * Math.PI) / 180);
      return <div key={panel} className={styles.panel} style={{
        left: r - panelWidth / 2, top: r, width: panelWidth, height: wall,
        background: `color-mix(in srgb, ${sceneColors.containerWall} ${Math.round(shade * 100)}%, black)`,
        transform: `rotateZ(${angle}deg) translateY(${r}px) rotateX(90deg)`,
      }} />;
    })}
    <div className={cx(styles.soil, styles.round)} style={{ transform: `translateZ(${wall - 4}px)` }} />
    <div className={styles.ring} style={{ transform: `translateZ(${wall}px)`, borderColor: sceneColors.containerRim }} />
  </Item>;
}

function AreaLayer({ state, landed }: LayerProps) {
  return <Layer index={1} state={state}>
    {sceneAreas.map((area) => {
      if (area.kind === "raised-bed") return <RaisedBed key={area.id} area={area} landed={landed} />;
      if (area.kind === "container") return <Container key={area.id} area={area} landed={landed} />;
      return <Item key={area.id} id={area.id} landed={landed} x={area.x} y={area.y} width={area.width} height={area.height} z={1}>
        <div className={styles.inGround} style={{ borderColor: sceneColors.inGround.stroke, background: sceneColors.inGround.fill }} />
      </Item>;
    })}
    {sceneAreas.map((area) => <Tag key={area.id} id={`${area.id}-tag`} tag={area.tag} landed={landed} hidden={state.areaTagsHidden} className={styles.areaTag} />)}
  </Layer>;
}

function PlantLayer({ state, landed }: LayerProps) {
  return <Layer index={2} state={state}>
    {scenePlants.map((plant) => {
      const color = cropColors[plant.crop];
      return <Item key={plant.id} id={plant.id} landed={landed} x={plant.cx - plant.r} y={plant.cy - plant.r} width={plant.r * 2} height={plant.r * 2} z={plant.z}
        className={styles.plant} style={{ background: `color-mix(in srgb, ${color.fill} 90%, transparent)`, borderColor: color.stroke }}>
        <div className={styles.core} style={{ background: color.stroke }} />
      </Item>;
    })}
    {plantTags.map((tag) => <Tag key={tag.id} id={tag.id} tag={tag} landed={landed} swatch={cropColors[tag.crop].stroke} letter={tag.letter} className={styles.plantTag} />)}
  </Layer>;
}
