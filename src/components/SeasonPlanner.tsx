"use client";

import { useState } from "react";

import {
  defaultPlantColor,
  gardenPlanViewport,
  growingAreaKindLabels,
  inferPlantCropFamily,
  plantingCropFamilies,
  plantingCropFamilyLabels,
  type Garden,
  type GardenPlanViewMode,
  type PlannedPlanting,
  type PlantingCropFamily,
} from "@/lib/gardenWorkspace";
import { companionNotes } from "@/lib/seasonPlanner";

type PlantChoice = {
  plantType: string;
  cropFamily: PlantingCropFamily;
  isCropFamilyManual: boolean;
};

type PlanChoice = Pick<PlantChoice, "plantType" | "cropFamily">;

export function SeasonPlanner({
  gardens,
  onSavePlan,
  onRemovePlan,
}: {
  gardens: Garden[];
  onSavePlan: (
    gardenId: string,
    growingAreaId: string,
    choice: PlanChoice,
  ) => void;
  onRemovePlan: (
    gardenId: string,
    seasonYear: number,
    plantingId: string,
  ) => void;
}) {
  const [gardenFilter, setGardenFilter] = useState("all");
  const [previewMode, setPreviewMode] =
    useState<GardenPlanViewMode>("growing-areas");
  const [choosingAreaKey, setChoosingAreaKey] = useState<string>();
  const [choices, setChoices] = useState<Record<string, PlantChoice>>({});
  const planningYear = new Date().getFullYear() + 1;
  const visibleGardens =
    gardenFilter === "all"
      ? gardens
      : gardens.filter((garden) => garden.id === gardenFilter);

  return (
    <section
      className="operations-content season-planner"
      aria-labelledby="season-planner-heading"
    >
      <div className="section-header">
        <div>
          <p className="section-eyebrow">Garden planning</p>
          <h2 id="season-planner-heading">Next season planner</h2>
          <p className="section-context">
            Review each growing area before deciding what to grow in {planningYear}.
          </p>
        </div>
        <label className="season-filter" htmlFor="season-garden-filter">
          Garden
          <select
            id="season-garden-filter"
            onChange={(event) => setGardenFilter(event.target.value)}
            value={gardenFilter}
          >
            <option value="all">All gardens</option>
            {gardens.map((garden) => (
              <option key={garden.id} value={garden.id}>
                {garden.name}
              </option>
            ))}
          </select>
        </label>
        <div
          aria-label="Plan preview view"
          className="season-preview-mode"
          role="group"
        >
          <button
            aria-pressed={previewMode === "growing-areas"}
            onClick={() => setPreviewMode("growing-areas")}
            type="button"
          >
            Planting areas
          </button>
          <button
            aria-pressed={previewMode === "full"}
            onClick={() => setPreviewMode("full")}
            type="button"
          >
            Full garden
          </button>
        </div>
      </div>

      {!visibleGardens.some((garden) => garden.growingAreas.length) ? (
        <div className="season-planner-empty">
          <h3>Add a planting area first</h3>
          <p>
            Each rotation decision belongs to a raised bed, in-ground area, or
            container group.
          </p>
        </div>
      ) : (
        <div className="season-garden-grid">
          {visibleGardens.map((garden) => (
            <section
              aria-labelledby={`season-garden-${garden.id}`}
              className="season-garden-section"
              key={garden.id}
            >
              <div className="season-garden-heading">
                <div>
                  <p className="section-eyebrow">Garden plan</p>
                  <h3 id={`season-garden-${garden.id}`}>{garden.name}</h3>
                </div>
                <span>{garden.growingAreas.length} planting areas</span>
              </div>
              <SeasonGardenPreview
                garden={garden}
                planningYear={planningYear}
                viewMode={previewMode}
              />
              <div className="season-planner-grid">
                {garden.growingAreas.map((area) => {
              const key = guidanceKey(garden.id, area.id);
              const choice = choices[key] ?? emptyChoice();
              const history = recentHistory(garden, area.id, planningYear);
              const recentCropFamilies = recentFamilies(history);
              const plannedPlantings = plannedForArea(
                garden,
                area.id,
                planningYear,
              );
              const notes = companionNotes(plannedPlantings);

              return (
                <article className="season-area-card" key={key}>
                  <div>
                    <p className="section-eyebrow">
                      {garden.name} · {growingAreaKindLabels[area.kind]}
                    </p>
                    <h3>{area.name}</h3>
                  </div>
                  <SummaryLine
                    label="Last season"
                    value={historyForSeason(history, planningYear - 1)}
                  />
                  <SummaryLine
                    label="Avoid if possible"
                    value={familyList(recentCropFamilies)}
                  />
                  <SummaryLine
                    label="Good rotation fit"
                    value={familyList(rotationFit(recentCropFamilies))}
                  />

                  {plannedPlantings.length ? (
                    <section
                      className="season-selections"
                      aria-label={`${planningYear} plan for ${area.name}`}
                    >
                      <strong>{planningYear} plan</strong>
                      <ul>
                        {plannedPlantings.map((planting) => (
                          <li key={planting.id}>
                            <span>{planting.commonName}</span>
                            <button
                              className="text-button"
                              onClick={() =>
                                onRemovePlan(garden.id, planningYear, planting.id)
                              }
                              type="button"
                            >
                              Remove
                            </button>
                          </li>
                        ))}
                      </ul>
                      {notes.map((note) => (
                        <p
                          className={`pairing-note pairing-note-${note.kind}`}
                          key={note.message}
                        >
                          {note.message}{" "}
                          <a
                            href={note.sourceUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {note.sourceLabel}
                          </a>
                        </p>
                      ))}
                    </section>
                  ) : null}

                  {choosingAreaKey === key ? (
                    <form
                      className="season-plant-choice"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (!choice.plantType.trim()) return;
                        onSavePlan(garden.id, area.id, {
                          plantType: choice.plantType.trim(),
                          cropFamily: resolvedCropFamily(choice),
                        });
                        setChoosingAreaKey(undefined);
                        setChoices((current) => ({
                          ...current,
                          [key]: emptyChoice(),
                        }));
                      }}
                    >
                      <label className="field" htmlFor={`season-plant-type-${key}`}>
                        Plant type
                        <input
                          id={`season-plant-type-${key}`}
                          onChange={(event) =>
                            setChoices((current) => {
                              const plantType = event.target.value;
                              return {
                                ...current,
                                [key]: {
                                  ...choice,
                                  plantType,
                                  cropFamily: choice.isCropFamilyManual
                                    ? choice.cropFamily
                                    : inferPlantCropFamily(plantType),
                                },
                              };
                            })
                          }
                          placeholder="e.g. Tomato, 番茄, or Sungold"
                          value={choice.plantType}
                        />
                      </label>
                      <p className="season-crop-family">
                        Crop family: {" "}
                        <strong>
                          {plantingCropFamilyLabels[resolvedCropFamily(choice)]}
                        </strong>{" "}
                        {choice.isCropFamilyManual ? "(edited)" : "(automatic)"}
                      </p>
                      {choice.isCropFamilyManual ? (
                        <label
                          className="field"
                          htmlFor={`season-crop-family-${key}`}
                        >
                          Crop family
                          <select
                            id={`season-crop-family-${key}`}
                            onChange={(event) =>
                              setChoices((current) => ({
                                ...current,
                                [key]: {
                                  ...choice,
                                  cropFamily: event.target.value as PlantingCropFamily,
                                },
                              }))
                            }
                            value={choice.cropFamily}
                          >
                            {plantingCropFamilies.map((family) => (
                              <option key={family} value={family}>
                                {plantingCropFamilyLabels[family]}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <button
                          className="text-button"
                          onClick={() =>
                            setChoices((current) => ({
                              ...current,
                              [key]: {
                                ...choice,
                                cropFamily: resolvedCropFamily(choice),
                                isCropFamilyManual: true,
                              },
                            }))
                          }
                          type="button"
                        >
                          Change crop family
                        </button>
                      )}
                      <div className="form-actions">
                        <button className="primary-button" type="submit">
                          Add to {planningYear} plan
                        </button>
                        <button
                          className="secondary-button"
                          onClick={() => setChoosingAreaKey(undefined)}
                          type="button"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      className="secondary-button"
                      onClick={() => setChoosingAreaKey(key)}
                      type="button"
                    >
                      Choose a plant
                    </button>
                  )}
                </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="season-summary-line">
      <strong>{label}</strong>
      <span>{value}</span>
    </p>
  );
}

function SeasonGardenPreview({
  garden,
  planningYear,
  viewMode,
}: {
  garden: Garden;
  planningYear: number;
  viewMode: GardenPlanViewMode;
}) {
  const viewport = gardenPlanViewport(
    garden.plan,
    garden.growingAreas,
    viewMode,
  );
  return (
    <div className="season-garden-preview-wrap">
      <svg
        aria-label={`${planningYear} plan preview for ${garden.name}`}
        className="season-garden-preview"
        role="img"
        viewBox={`${viewport.x - 0.25} ${viewport.y - 0.35} ${viewport.widthMeters + 0.5} ${viewport.depthMeters + 0.7}`}
      >
        <rect
          className="season-garden-boundary"
          height={garden.plan.depthMeters}
          strokeWidth={0.04}
          width={garden.plan.widthMeters}
          x="0"
          y="0"
        />
        {garden.growingAreas.map((area) => {
          const layout = area.layout;
          if (!layout) return null;
          const plannedPlantings = plannedForArea(garden, area.id, planningYear);
          const previewPlants = uniquePlanPlants(plannedPlantings);
          const tokens = planTokens(previewPlants, layout.widthMeters, layout.depthMeters);
          const label = seasonAreaLabelPosition(area);

          return (
            <g key={area.id}>
              <g
                transform={`translate(${area.planPlacement.x} ${area.planPlacement.y}) rotate(${area.planPlacement.rotationDegrees})`}
              >
                <rect
                  className="season-garden-area"
                  height={layout.depthMeters}
                  strokeWidth={0.05}
                  width={layout.widthMeters}
                  x="0"
                  y="0"
                />
                {tokens.map(({ planting, x, y, radius }) => (
                  <g key={planting.id}>
                    <circle
                      aria-label={planting.commonName}
                      className="season-garden-plant"
                      cx={x}
                      cy={y}
                      fill={defaultPlantColor(
                        planting.plantType ?? planting.commonName,
                        planting.variety,
                      )}
                      r={radius}
                      strokeWidth={0.04}
                    />
                    <text
                      className="season-garden-plant-label"
                      dominantBaseline="middle"
                      fontSize={Math.min(radius * 0.65, 0.2)}
                      textAnchor="middle"
                      x={x}
                      y={y}
                    >
                      {plantLabel(planting)}
                    </text>
                  </g>
                ))}
              </g>
              <text
                className="season-garden-area-label"
                data-testid={`season-area-label-${area.id}`}
                fontSize={0.22}
                textAnchor="middle"
                x={label.x}
                y={label.y}
              >
                {area.name}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function seasonAreaLabelPosition(area: Garden["growingAreas"][number]) {
  const layout = area.layout;
  if (!layout) return { x: area.planPlacement.x, y: area.planPlacement.y };
  const angle = (area.planPlacement.rotationDegrees * Math.PI) / 180;
  const points = layout.boundary.map((point) => ({
    x:
      area.planPlacement.x +
      point.x * Math.cos(angle) -
      point.y * Math.sin(angle),
    y:
      area.planPlacement.y +
      point.x * Math.sin(angle) +
      point.y * Math.cos(angle),
  }));
  const top = Math.min(...points.map((point) => point.y));
  const bottom = Math.max(...points.map((point) => point.y));
  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));

  return {
    x: (left + right) / 2,
    y: top >= 0.22 ? top - 0.12 : bottom + 0.24,
  };
}

function uniquePlanPlants(plantings: PlannedPlanting[]) {
  const plantsByIdentity = new Map<string, PlannedPlanting>();
  for (const planting of plantings) {
    const identity = `${planting.plantType ?? planting.commonName}:${planting.variety ?? ""}`
      .trim()
      .toLocaleLowerCase();
    plantsByIdentity.set(identity, planting);
  }
  return [...plantsByIdentity.values()];
}

function planTokens(
  plantings: PlannedPlanting[],
  widthMeters: number,
  depthMeters: number,
) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(plantings.length)));
  const rows = Math.max(1, Math.ceil(plantings.length / columns));
  const shortestSide = Math.min(widthMeters, depthMeters);
  const padding = shortestSide * 0.12;
  const availableWidth = Math.max(widthMeters - padding * 2, shortestSide * 0.4);
  const availableDepth = Math.max(depthMeters - padding * 2, shortestSide * 0.4);
  const radius = Math.max(
    shortestSide * 0.11,
    Math.min(availableWidth / columns, availableDepth / rows) * 0.36,
  );

  return plantings.map((planting, index) => ({
    planting,
    x: padding + ((index % columns) + 0.5) * (availableWidth / columns),
    y: padding + (Math.floor(index / columns) + 0.5) * (availableDepth / rows),
    radius,
  }));
}

function plantLabel(planting: PlannedPlanting) {
  const label = planting.commonName.trim();
  return label.length > 7 ? `${label.slice(0, 6)}…` : label;
}

function emptyChoice(): PlantChoice {
  return { plantType: "", cropFamily: "other", isCropFamilyManual: false };
}

function resolvedCropFamily(choice: PlantChoice) {
  return choice.isCropFamilyManual
    ? choice.cropFamily
    : inferPlantCropFamily(choice.plantType);
}

function guidanceKey(gardenId: string, areaId: string) {
  return `${gardenId}:${areaId}`;
}

type PlantingRecordLike = Pick<
  Garden["plantings"][number],
  "commonName" | "plantType" | "variety" | "plantingDate" | "cropFamily"
>;

function historyForSeason(plantings: PlantingRecordLike[], season: number) {
  const seasonPlantings = plantings.filter((planting) =>
    planting.plantingDate.startsWith(`${season}-`),
  );
  return seasonPlantings.length
    ? uniqueHistoryLabels(seasonPlantings).join(" · ")
    : `No planting record saved for ${season}.`;
}

function uniqueHistoryLabels(plantings: PlantingRecordLike[]) {
  const labelsByIdentity = new Map<string, string>();
  for (const planting of plantings) {
    const { identity, label } = normalizedHistoryLabel(planting);
    labelsByIdentity.set(identity, label);
  }
  return [...labelsByIdentity.values()];
}

function normalizedHistoryLabel(planting: PlantingRecordLike) {
  const source = [planting.plantType, planting.variety, planting.commonName]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase();
  if (source.includes("sungold") || source.includes("sun gold")) {
    return { identity: "tomato:sun-gold", label: "Tomato · Sun Gold" };
  }
  if (source.includes("tomato") || source.includes("番茄") || source.includes("西红柿")) {
    return { identity: "tomato", label: "Tomato" };
  }
  if (source.includes("basil") || source.includes("九层塔")) {
    return { identity: "basil", label: "Basil" };
  }

  const label = planting.variety?.trim()
    ? `${planting.plantType?.trim() || planting.commonName.trim()} · ${planting.variety.trim()}`
    : planting.plantType?.trim() || planting.commonName.trim();
  return {
    identity: `${planting.cropFamily}:${label.toLocaleLowerCase()}`,
    label,
  };
}

function recentHistory(garden: Garden, growingAreaId: string, planningYear: number) {
  return garden.plantings.filter((planting) => {
    const season = Number(planting.plantingDate.slice(0, 4));
    return (
      planting.growingAreaId === growingAreaId &&
      season >= planningYear - 3 &&
      season < planningYear
    );
  });
}

function plannedForArea(
  garden: Garden,
  growingAreaId: string,
  seasonYear: number,
): PlannedPlanting[] {
  return (
    garden.seasonPlans
      ?.find((plan) => plan.seasonYear === seasonYear)
      ?.plantings.filter((planting) => planting.growingAreaId === growingAreaId) ??
    []
  );
}

function recentFamilies(plantings: PlantingRecordLike[]) {
  return [
    ...new Set(
      plantings
        .map((planting) => planting.cropFamily)
        .filter((family) => family !== "other"),
    ),
  ];
}

function rotationFit(recentCropFamilies: PlantingCropFamily[]) {
  return plantingCropFamilies.filter(
    (family) => family !== "other" && !recentCropFamilies.includes(family),
  );
}

function familyList(families: PlantingCropFamily[]) {
  return families.length
    ? families.map(cropFamilySummaryLabel).join(" · ")
    : "No family restriction from recent history.";
}

function cropFamilySummaryLabel(family: PlantingCropFamily) {
  const examples: Partial<Record<PlantingCropFamily, string>> = {
    nightshade: "tomato, pepper, eggplant",
    brassica: "cabbage, broccoli, kale",
    cucurbit: "cucumber, squash, melon",
    legume: "bean, pea",
    allium: "onion, garlic, leek",
    root: "carrot, beet, radish",
    leafy: "lettuce, spinach",
  };
  return examples[family]
    ? `${plantingCropFamilyLabels[family]} (${examples[family]})`
    : plantingCropFamilyLabels[family];
}
