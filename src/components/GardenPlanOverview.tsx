"use client";

import { FormEvent, type RefObject, useEffect, useState } from "react";
import { Circle, Group, Layer, Line, Rect, Stage, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";

import {
  allocationPlantColor,
  clampPlanPosition,
  gardenPlanViewport,
  growingAreaKindLabels,
  snapToGrid,
  validateGardenPlanDimensions,
  type GardenPlan,
  type GardenPlanViewMode,
  type GardenPlanViewport,
  type GrowingArea,
  type PlanPlacement,
} from "@/lib/gardenWorkspace";

type GardenPlanOverviewProps = {
  plan: GardenPlan;
  gardenName?: string;
  growingAreas: GrowingArea[];
  compact?: boolean;
  editable?: boolean;
  headingRef?: RefObject<HTMLHeadingElement | null>;
  isAreaInspectorOpen?: boolean;
  onAddArea?: () => void;
  onGardenNameChange?: (name: string) => void;
  onPlanChange?: (plan: GardenPlan) => void;
  onPlacementChange?: (areaId: string, placement: PlanPlacement) => void;
  onEditLayout?: (areaId: string) => void;
};

const CANVAS_PADDING = 34;
const PLAN_CANVAS_WIDTH = 760;
const PLAN_CANVAS_HEIGHT = 460;

export function GardenPlanOverview({
  plan,
  gardenName: gardenNameFromProps = "",
  growingAreas,
  compact = false,
  editable = false,
  headingRef,
  isAreaInspectorOpen = false,
  onAddArea,
  onGardenNameChange,
  onPlanChange,
  onPlacementChange,
  onEditLayout,
}: GardenPlanOverviewProps) {
  const [gardenName, setGardenName] = useState("");
  const [width, setWidth] = useState(String(plan.widthMeters));
  const [depth, setDepth] = useState(String(plan.depthMeters));
  const [viewMode, setViewMode] = useState<GardenPlanViewMode>("growing-areas");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setWidth(String(plan.widthMeters));
    setDepth(String(plan.depthMeters));
  }, [plan.depthMeters, plan.widthMeters]);

  useEffect(() => {
    setGardenName(gardenNameFromProps);
  }, [gardenNameFromProps]);

  const hasPropertyChanges =
    gardenName !== gardenNameFromProps ||
    Number(width) !== plan.widthMeters ||
    Number(depth) !== plan.depthMeters;

  if (compact)
    return (
      <div aria-hidden="true" className="garden-plan-thumbnail">
        <GardenPlanCanvas
          compact
          growingAreas={growingAreas}
          interactive={false}
          onMove={() => undefined}
          plan={plan}
          viewMode="growing-areas"
        />
      </div>
    );

  const savePlanDimensions = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const widthMeters = Number(width);
    const depthMeters = Number(depth);
    if (!validateGardenPlanDimensions(widthMeters, depthMeters)) {
      setMessage("Enter plan dimensions of at least 0.1 metres.");
      return;
    }
    const nextGardenName = gardenName.trim();
    if (!nextGardenName) {
      setMessage("Enter a garden name to continue.");
      return;
    }
    onGardenNameChange?.(nextGardenName);
    onPlanChange?.({
      widthMeters: snapToGrid(widthMeters),
      depthMeters: snapToGrid(depthMeters),
    });
    setMessage("Garden properties saved.");
  };

  const moveArea = (areaId: string, event: KonvaEventObject<DragEvent>) => {
    if (!editable || !onPlacementChange) return;
    if (typeof event.target.x !== "function" || typeof event.target.y !== "function") return;
    const viewport = gardenPlanViewport(plan, growingAreas, viewMode);
    const scale = pixelsPerMeter(viewport, false, viewMode);
    const point = clampPlanPosition(
      {
        x: (event.target.x() - CANVAS_PADDING) / scale + viewport.x,
        y: (event.target.y() - CANVAS_PADDING) / scale + viewport.y,
      },
      plan,
    );
    const area = growingAreas.find((candidate) => candidate.id === areaId);
    if (!area) return;
    onPlacementChange(areaId, { ...area.planPlacement, ...point });
    setMessage("Planting area snapped to the 0.1 metre grid.");
  };

  return (
    <section className="garden-plan" aria-labelledby="garden-plan-heading">
      <div className="section-header">
        <div>
          <p className="section-eyebrow">Garden overview</p>
          <h2 id="garden-plan-heading" ref={headingRef} tabIndex={headingRef ? -1 : undefined}>
            Garden Plan
          </h2>
        </div>
        <div className="plan-header-actions">
          {editable && onAddArea ? (
            <button className="primary-button" onClick={onAddArea} type="button">
              Add planting area
            </button>
          ) : null}
          <p className="plan-count">
            {growingAreas.length} planting{" "}
            {growingAreas.length === 1 ? "area" : "areas"}
          </p>
        </div>
      </div>
      <p className="plan-intro">
        {editable
          ? "Arrange planting areas here. Open an area to set its real measurements and place plants."
          : "Measured planting areas and planned layout allocations for this garden."}
      </p>
      {editable ? (
        <section
          aria-label="Garden properties"
          className={`plan-boundary-settings${isAreaInspectorOpen ? " is-compact" : ""}`}
        >
          <form className="plan-dimensions" onSubmit={savePlanDimensions}>
            <div className="field plan-name-field">
              <label htmlFor="plan-garden-name">Garden name</label>
              <input
                id="plan-garden-name"
                onChange={(event) => setGardenName(event.target.value)}
                required
                value={gardenName}
              />
            </div>
            <div className="field">
              <label htmlFor="plan-width">
                Garden width (m)
              </label>
              <input
                id="plan-width"
                min="0.1"
                onChange={(event) => setWidth(event.target.value)}
                step="0.1"
                type="number"
                value={width}
              />
            </div>
            <div className="field">
              <label htmlFor="plan-depth">
                Garden length (m)
              </label>
              <input
                id="plan-depth"
                min="0.1"
                onChange={(event) => setDepth(event.target.value)}
                step="0.1"
                type="number"
                value={depth}
              />
            </div>
            {hasPropertyChanges ? <button className="save-button" type="submit">Save</button> : null}
          </form>
        </section>
      ) : null}
      <div className="plan-canvas-wrap">
        <div className="plan-view">
          <div aria-label="Garden Plan view" className="plan-view-controls">
            <button
              aria-pressed={viewMode === "growing-areas"}
              className="plan-view-control"
              onClick={() => setViewMode("growing-areas")}
              type="button"
            >
              Focus beds
            </button>
            <button
              aria-pressed={viewMode === "full"}
              className="plan-view-control"
              onClick={() => setViewMode("full")}
              type="button"
            >
              Full garden
            </button>
          </div>
          <div className="plan-canvas-wrap">
            <GardenPlanCanvas
              compact={false}
              growingAreas={growingAreas}
              interactive={editable}
              onEditLayout={onEditLayout}
              onMove={moveArea}
              plan={plan}
              viewMode={viewMode}
            />
          </div>
        </div>
      </div>
      {editable && growingAreas.length ? (
        <section className="plan-area-shortcuts" aria-labelledby="plan-area-shortcuts-heading">
          <div className="plan-area-shortcuts-heading">
            <div>
              <p className="section-eyebrow">Planting areas</p>
              <h3 id="plan-area-shortcuts-heading">Open a planting area</h3>
            </div>
            <p>Use a card or double-click a bed on the plan.</p>
          </div>
          <div className="plan-area-card-grid">
            {growingAreas.map((area) => (
              <button
                className="plan-area-card"
                key={area.id}
                onClick={() => onEditLayout?.(area.id)}
                type="button"
              >
                <strong>{area.name}</strong>
                <span>{growingAreaKindLabels[area.kind]}</span>
                <span>
                  {area.layout
                    ? `${area.layout.widthMeters} m x ${area.layout.depthMeters} m · ${area.layout.allocations.length} plant${area.layout.allocations.length === 1 ? "" : "s"}`
                    : "Set measurements"}
                </span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {editable ? (
        <p aria-live="polite" className="workspace-message" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}

type GardenPlanCanvasProps = {
  plan: GardenPlan;
  growingAreas: GrowingArea[];
  compact: boolean;
  interactive: boolean;
  onMove: (areaId: string, event: KonvaEventObject<DragEvent>) => void;
  onEditLayout?: (areaId: string) => void;
  viewMode: GardenPlanViewMode;
};

function GardenPlanCanvas({
  plan,
  growingAreas,
  compact,
  interactive,
  onMove,
  onEditLayout,
  viewMode,
}: GardenPlanCanvasProps) {
  const padding = compact ? 14 : CANVAS_PADDING;
  const viewport = gardenPlanViewport(plan, growingAreas, viewMode);
  const scale = pixelsPerMeter(viewport, compact, viewMode);
  const width = compact
    ? viewport.widthMeters * scale + padding * 2
    : PLAN_CANVAS_WIDTH + padding * 2;
  const height = compact
    ? viewport.depthMeters * scale + padding * 2
    : PLAN_CANVAS_HEIGHT + padding * 2;
  const verticalGrid = compact ? [] : Array.from(
    { length: Math.floor(plan.widthMeters) + 1 },
    (_, index) => index,
  );
  const horizontalGrid = compact ? [] : Array.from(
    { length: Math.floor(plan.depthMeters) + 1 },
    (_, index) => index,
  );
  const measuredAreas = growingAreas.filter((area) => area.layout);

  return (
    <Stage
      aria-label={`Garden Plan, ${plan.widthMeters} metres long by ${plan.depthMeters} metres wide`}
      height={height}
      width={width}
    >
      <Layer>
        <Rect
          fill="#f8fbf6"
          height={plan.depthMeters * scale}
          stroke="#183a2a"
          strokeWidth={2}
          width={plan.widthMeters * scale}
          x={padding - viewport.x * scale}
          y={padding - viewport.y * scale}
        />
        {!compact && verticalGrid.map((metre) => (
          <Line
            key={`vertical-${metre}`}
            points={[
              padding + (metre - viewport.x) * scale,
              padding - viewport.y * scale,
              padding + (metre - viewport.x) * scale,
              padding + (plan.depthMeters - viewport.y) * scale,
            ]}
            stroke="#cfd7ce"
            strokeWidth={1}
          />
        ))}
        {!compact && horizontalGrid.map((metre) => (
          <Line
            key={`horizontal-${metre}`}
            points={[
              padding - viewport.x * scale,
              padding + (metre - viewport.y) * scale,
              padding + (plan.widthMeters - viewport.x) * scale,
              padding + (metre - viewport.y) * scale,
            ]}
            stroke="#cfd7ce"
            strokeWidth={1}
          />
        ))}
        {!compact && verticalGrid.map((metre) => (
          <Text
            fontSize={11}
            key={`x-label-${metre}`}
            text={`${metre} m`}
            x={padding + (metre - viewport.x) * scale - 10}
            y={12}
          />
        ))}
        {!compact && horizontalGrid.map((metre) => (
          <Text
            fontSize={11}
            key={`y-label-${metre}`}
            text={`${metre} m`}
            x={3}
            y={padding + (metre - viewport.y) * scale - 6}
          />
        ))}
        {measuredAreas.map((area) => (
          <Group
            aria-label={
              compact
                ? undefined
                : interactive
                  ? `Open ${area.name} on Garden Plan`
                  : `${area.name} on Garden Plan`
            }
            draggable={interactive}
            key={area.id}
            onClick={() => onEditLayout?.(area.id)}
            onDblClick={() => onEditLayout?.(area.id)}
            onDblTap={() => onEditLayout?.(area.id)}
            onDragEnd={(event) => onMove(area.id, event)}
            onTap={() => onEditLayout?.(area.id)}
            rotation={area.planPlacement.rotationDegrees}
            x={padding + (area.planPlacement.x - viewport.x) * scale}
            y={padding + (area.planPlacement.y - viewport.y) * scale}
          >
            <Line
              closed
              fill="#dcebdc"
              points={area.layout!.boundary.flatMap((point) => [
                point.x * scale,
                point.y * scale,
              ])}
              stroke="#276445"
              strokeWidth={2}
            />
            {area.layout!.allocations.map((allocation) => (
              <Group key={allocation.id}>
                <Circle
                  aria-label={`${allocation.label} plant on Garden Plan`}
                  fill={allocationPlantColor(allocation, area.layout!.allocations)}
                  opacity={0.9}
                  radius={Math.max(4, (allocation.diameterMeters * scale) / 2)}
                  stroke="#183a2a"
                  strokeWidth={1}
                  x={allocation.x * scale}
                  y={allocation.y * scale}
                  onClick={(event) => {
                    event.cancelBubble = true;
                    onEditLayout?.(area.id);
                  }}
                  onTap={(event) => {
                    event.cancelBubble = true;
                    onEditLayout?.(area.id);
                  }}
                />
                {!compact && viewMode === "growing-areas" ? (
                  <Text
                    align="center"
                    fill="#183a2a"
                    fontSize={Math.max(8, Math.min(12, allocation.diameterMeters * scale / 3))}
                    height={Math.max(2, allocation.diameterMeters * scale)}
                    listening={false}
                    text={allocation.label}
                    verticalAlign="middle"
                    width={Math.max(2, allocation.diameterMeters * scale)}
                    wrap="none"
                    x={allocation.x * scale - allocation.diameterMeters * scale / 2}
                    y={allocation.y * scale - allocation.diameterMeters * scale / 2}
                  />
                ) : null}
              </Group>
            ))}
          </Group>
        ))}
        {!compact && measuredAreas.map((area) => {
          const label = areaLabelPosition(area, scale, padding, viewport);
          return (
            <Text
              align="center"
              data-testid={`area-label-${area.id}`}
              ellipsis
              fill="#183a2a"
              fontSize={13}
              fontStyle="bold"
              height={16}
              key={`area-label-${area.id}`}
              listening={false}
              text={area.name}
              width={label.width}
              wrap="none"
              x={label.x}
              y={label.y}
            />
          );
        })}
        {!compact && !measuredAreas.length ? (
          <Text
            fill="#657268"
            fontSize={14}
            text="Add a planting area to set its dimensions and show it here."
            x={padding + (16 - viewport.x) * scale}
            y={padding + (16 - viewport.y) * scale}
          />
        ) : null}
      </Layer>
    </Stage>
  );
}

function areaLabelPosition(
  area: GrowingArea,
  scale: number,
  padding: number,
  viewport: GardenPlanViewport,
) {
  const angle = (area.planPlacement.rotationDegrees * Math.PI) / 180;
  const origin = {
    x: padding + (area.planPlacement.x - viewport.x) * scale,
    y: padding + (area.planPlacement.y - viewport.y) * scale,
  };
  const points = area.layout!.boundary.map((point) => ({
    x: origin.x + point.x * scale * Math.cos(angle) - point.y * scale * Math.sin(angle),
    y: origin.y + point.x * scale * Math.sin(angle) + point.y * scale * Math.cos(angle),
  }));
  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  const width = Math.max(80, Math.min(180, right - left + 24));
  const y = top - 20 >= 24 ? top - 20 : bottom + 6;
  return { width, x: (left + right - width) / 2, y };
}

function pixelsPerMeter(
  plan: Pick<GardenPlan, "widthMeters" | "depthMeters">,
  compact = false,
  viewMode: GardenPlanViewMode = "full",
) {
  const maxWidth = compact ? 210 : PLAN_CANVAS_WIDTH;
  const maxDepth = compact ? 150 : PLAN_CANVAS_HEIGHT;
  const maxScale = compact ? 28 : viewMode === "growing-areas" ? 120 : 82;
  const minScale = compact ? 12 : 28;
  return Math.max(
    minScale,
    Math.min(
      maxScale,
      Math.min(maxWidth / plan.widthMeters, maxDepth / plan.depthMeters),
    ),
  );
}
