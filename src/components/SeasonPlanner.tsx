"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { gardenPath, seasonGardenPath } from "@/lib/workspaceRoutes";
import { ButtonLink } from "@/components/ui/Button";
import styles from "./season/Season.module.css";
import { useConfirmation } from "./ConfirmDialog";
import { InlineNotice } from "@/components/forms/FormFeedback";
import { PlantChip } from "@/components/season/PlantChip";
import { useWorkspaceDraft, useUnsavedDraft } from "@/components/workspace/WorkspaceProvider";
import { usePageActionsSlot } from "@/components/workspace/AppShell";
import { AllocationAssistant, type AllocationConfirmOutcome } from "@/components/AllocationAssistant";
import { PortfolioFeatureSettingsError, useRuntimeConfig } from "@/components/PortfolioFeaturePreview";
import { lockBodyScroll } from "@/lib/modalScrollLock";
import {
  gardenPlanViewport,
  growingAreaKindLabels,
  inferPlantCropFamily,
  plantingCropFamilies,
  plantingCropFamilyLabels,
  type Garden,
  type GrowingArea,
  type PlannedPlanting,
  type PlantingCropFamily,
} from "@/lib/gardenWorkspace";
import { nextSeasonYear, type AllocationInput, type SeasonAllocationResult } from "@/lib/seasonAllocation";
import {
  companionNotes,
  cropFamilySummaryLabel,
  historyBySeason,
  latestFamilyYear,
  plannedAreaCount,
  plannedForArea,
  plantsToCheck,
  recentFamilies,
  recentHistory,
  repeatedFamily,
  rotationFit,
  seasonPlantColors,
  uniquePlanPlants,
} from "@/lib/seasonPlanner";

type PlantChoice = {
  plantType: string;
  cropFamily: PlantingCropFamily;
  isCropFamilyManual: boolean;
};

type PlanChoice = Pick<PlantChoice, "plantType" | "cropFamily">;
type ColorOf = ReturnType<typeof seasonPlantColors>;

type SeasonPlannerProps = {
  gardens: Garden[];
  /** The `?garden=` value. Without it the page shows the first garden. */
  gardenId?: string;
  workspaceId?: string;
  isSynced: boolean;
  notice?: string;
  onConfirmAllocation: (gardenId: string, draft: SeasonAllocationResult, input: AllocationInput) => AllocationConfirmOutcome;
  onSavePlan: (gardenId: string, growingAreaId: string, choice: PlanChoice) => void;
  onRemovePlan: (gardenId: string, seasonYear: number, plantingId: string) => void;
};

/**
 * Next Season (ADR-0082): one garden at a time, as a rotation sheet. One row per planting
 * area reads left to right: the area, what it grew in the last three seasons, the families
 * it rests from, and its plan for next year on a dark textured lane. A small map beside the
 * sheet shows where the plan lands; the Allocation Assistant opens from "Plan with AI".
 */
export function SeasonPlanner({ gardens, gardenId, workspaceId, isSynced, notice, onSavePlan, onRemovePlan, onConfirmAllocation }: SeasonPlannerProps) {
  const planningYear = nextSeasonYear();
  const garden = gardenId === undefined ? gardens[0] : gardens.find((item) => item.id === gardenId);
  const actionsSlot = usePageActionsSlot();
  const switcher = gardens.length ? <GardenSwitch gardens={gardens} currentId={garden?.id} planningYear={planningYear} /> : null;

  return (
    <section className={styles.planner} aria-label="Planting plans">
      {actionsSlot ? switcher && createPortal(switcher, actionsSlot) : switcher}
      <InlineNotice tone="status">{notice}</InlineNotice>
      {!gardens.length ? (
        <Blank title="Create a garden to start planning" text="Add a garden and a planting area, then choose what to grow next season.">
          <ButtonLink href="/gardens/new">Create a garden</ButtonLink>
        </Blank>
      ) : !garden ? (
        <Blank title="Garden unavailable" text="Choose another garden to see its plan." />
      ) : !garden.growingAreas.length ? (
        <Blank title="Add a planting area first" text="Open Garden Plan to add a bed or container group, then return to choose plants.">
          <ButtonLink href={gardenPath(garden.id)}>Open Garden Plan for {garden.name}</ButtonLink>
        </Blank>
      ) : (
        <GardenSeason
          garden={garden}
          planningYear={planningYear}
          workspaceId={workspaceId}
          isSynced={isSynced}
          onSavePlan={onSavePlan}
          onRemovePlan={onRemovePlan}
          onConfirmAllocation={onConfirmAllocation}
        />
      )}
    </section>
  );
}

function Blank({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className={styles.blank}>
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}

function GardenSwitch({ gardens, currentId, planningYear }: { gardens: Garden[]; currentId?: string; planningYear: number }) {
  return (
    <nav className={styles.gardenSwitch} aria-label="Garden">
      {gardens.map((item) => {
        const planned = plannedAreaCount(item, planningYear);
        const total = item.growingAreas.length;
        return (
          <Link
            key={item.id}
            href={seasonGardenPath(item.id)}
            aria-current={item.id === currentId ? "page" : undefined}
            aria-label={`${item.name}, ${planned} of ${total} areas planned`}
          >
            {item.name}
            <span className={styles.count} aria-hidden="true">{planned}/{total}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function GardenSeason({
  garden,
  planningYear,
  workspaceId,
  isSynced,
  onSavePlan,
  onRemovePlan,
  onConfirmAllocation,
}: { garden: Garden; planningYear: number } & Pick<SeasonPlannerProps, "workspaceId" | "isSynced" | "onSavePlan" | "onRemovePlan" | "onConfirmAllocation">) {
  const { requestConfirmation, confirmation, confirmDiscard } = useConfirmation();
  const currentGarden = useRef(garden);
  currentGarden.current = garden;
  const [choosingAreaKey, setChoosingAreaKey] = useWorkspaceDraft<string | undefined>("season:all:choosingAreaKey", undefined);
  const [choices, setChoices] = useWorkspaceDraft<Record<string, PlantChoice>>("season:all:choices", {});
  useUnsavedDraft("season:all:choices", Boolean(choosingAreaKey));
  const [hotAreaId, setHotAreaId] = useState<string>();
  const [aiOpen, setAiOpen] = useState(false);
  const aiButton = useRef<HTMLButtonElement>(null);
  const colorOf = useMemo(() => seasonPlantColors(garden), [garden]);

  const areas = garden.growingAreas;
  const planned = plannedAreaCount(garden, planningYear);
  const toCheck = plantsToCheck(garden, planningYear);
  const progress = Math.round((planned / areas.length) * 100);

  const focusAddButton = (key: string) => requestAnimationFrame(() => document.getElementById(addButtonId(key))?.focus());
  const closeChooser = (key: string) => {
    setChoosingAreaKey(undefined);
    setChoices((current) => ({ ...current, [key]: emptyChoice() }));
    focusAddButton(key);
  };
  const openFromMap = (area: GrowingArea) => {
    const key = guidanceKey(garden.id, area.id);
    const row = document.getElementById(rowId(key));
    row?.scrollIntoView?.({ block: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    if (!plannedForArea(garden, area.id, planningYear).length) setChoosingAreaKey(key);
  };

  return (
    <div className={styles.layout}>
      {confirmation}
      <section className={styles.sheet} aria-label={`${planningYear} rotation sheet for ${garden.name}`}>
        <div className={`${styles.band} ${styles.ridges} ${styles.lane}`} aria-hidden="true" />
        <div className={styles.head}>
          <div className={styles.gardenTitle}>
            <div className={styles.gardenText}>
              <h2>{garden.name}</h2>
              <p>{areas.length === 1 ? "1 planting area" : `${areas.length} planting areas`}</p>
            </div>
            <button ref={aiButton} className={styles.aiButton} type="button" aria-haspopup="dialog" aria-expanded={aiOpen} onClick={() => setAiOpen(true)}>
              <SparkIcon />Plan with AI
            </button>
          </div>
          <div className={styles.columnLabel}>Planting area</div>
          <div className={styles.columnLabel}>Grown {planningYear - 3}–{planningYear - 1}</div>
          <div className={styles.columnLabel}>Rest from</div>
          <div className={`${styles.laneHead} ${styles.onDark}`}>
            <p className={styles.laneKicker}>Planting plan</p>
            <p className={styles.laneYear}>{planningYear}</p>
            <div className={styles.progress}>
              <div className={styles.track}><div className={styles.fill} style={{ width: `${progress}%` }} /></div>
              <p className={styles.progressLine}>
                <span>{planned} of {areas.length} {areas.length === 1 ? "area" : "areas"} planned</span>
                {toCheck ? <span>{toCheck} to check</span> : null}
              </p>
            </div>
          </div>
        </div>
        {areas.map((area, index) => {
          const key = guidanceKey(garden.id, area.id);
          return (
            <SeasonRow
              key={key}
              areaKey={key}
              area={area}
              number={index + 1}
              garden={garden}
              planningYear={planningYear}
              colorOf={colorOf}
              isHot={hotAreaId === area.id}
              onHot={(hot) => setHotAreaId(hot ? area.id : undefined)}
              isChoosing={choosingAreaKey === key}
              choice={choices[key] ?? emptyChoice()}
              onChoose={() => setChoosingAreaKey(key)}
              onChoiceChange={(choice) => setChoices((current) => ({ ...current, [key]: choice }))}
              onSubmit={(choice) => {
                onSavePlan(garden.id, area.id, { plantType: choice.plantType.trim(), cropFamily: resolvedCropFamily(choice) });
                closeChooser(key);
              }}
              onCancel={(choice) => confirmDiscard(Boolean(choice.plantType || choice.isCropFamilyManual), () => closeChooser(key), addButtonId(key))}
              onRemove={(planting) => requestConfirmation({
                confirmLabel: "Remove plan item", tone: "danger", fallbackFocusId: addButtonId(key),
                message: `Remove “${planting.commonName}” from the ${planningYear} plan for ${garden.name} · ${area.name}? Current plants and past care records stay available.`,
                onConfirm: () => {
                  const exists = currentGarden.current.seasonPlans?.some((plan) => plan.seasonYear === planningYear && plan.plantings.some((item) => item.id === planting.id));
                  if (!exists) throw new Error("This plan item no longer exists. Cancel to return to the plan.");
                  onRemovePlan(garden.id, planningYear, planting.id);
                },
              })}
            />
          );
        })}
      </section>

      <SeasonMap garden={garden} planningYear={planningYear} colorOf={colorOf} hotAreaId={hotAreaId} onHot={setHotAreaId} onOpenArea={openFromMap} />

      <PlanWithAiDrawer open={aiOpen} opener={aiButton} onClose={() => setAiOpen(false)}>
        <AssistantBody garden={garden} workspaceId={workspaceId} isSynced={isSynced} onConfirm={onConfirmAllocation} />
      </PlanWithAiDrawer>
    </div>
  );
}

function AssistantBody({ garden, workspaceId, isSynced, onConfirm }: { garden: Garden; workspaceId?: string; isSynced: boolean; onConfirm: SeasonPlannerProps["onConfirmAllocation"] }) {
  const { config, failed, retry } = useRuntimeConfig();
  if (failed) return <PortfolioFeatureSettingsError featureName="Allocation Assistant" onRetry={retry} />;
  return <AllocationAssistant garden={garden} isPortfolioDemo={config?.portfolioDemo} isSynced={isSynced} onConfirm={onConfirm} workspaceId={workspaceId} labelledBy={drawerTitleId} />;
}

type SeasonRowProps = {
  areaKey: string;
  area: GrowingArea;
  number: number;
  garden: Garden;
  planningYear: number;
  colorOf: ColorOf;
  isHot: boolean;
  onHot: (hot: boolean) => void;
  isChoosing: boolean;
  choice: PlantChoice;
  onChoose: () => void;
  onChoiceChange: (choice: PlantChoice) => void;
  onSubmit: (choice: PlantChoice) => void;
  onCancel: (choice: PlantChoice) => void;
  onRemove: (planting: PlannedPlanting) => void;
};

function SeasonRow({ areaKey, area, number, garden, planningYear, colorOf, isHot, onHot, isChoosing, choice, onChoose, onChoiceChange, onSubmit, onCancel, onRemove }: SeasonRowProps) {
  const history = recentHistory(garden, area.id, planningYear);
  const seasons = historyBySeason(history);
  const restFrom = recentFamilies(history);
  const plantings = plannedForArea(garden, area.id, planningYear);
  const notes = companionNotes(plantings);

  return (
    <div
      id={rowId(areaKey)}
      className={styles.row}
      data-hot={isHot || undefined}
      role="group"
      aria-label={area.name}
      onMouseEnter={() => onHot(true)}
      onMouseLeave={() => onHot(false)}
      onFocus={() => onHot(true)}
      onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onHot(false); }}
    >
      <div className={styles.areaCell}>
        <span className={styles.number} aria-hidden="true">{number}</span>
        <div>
          <p className={styles.areaName}>{area.name}</p>
          <p className={styles.areaKind}>{growingAreaKindLabels[area.kind]}</p>
        </div>
      </div>
      <div className={styles.beforeCell}>
        {seasons.length ? seasons.map(({ year, plants }) => (
          <p className={styles.seasonLine} key={year}>
            <span className={styles.year}>{year}</span>
            {plants.map((plant) => <PlantChip key={plant.identity} name={plant.label} colors={colorOf(plant.planting)} />)}
          </p>
        )) : <span className={styles.none}>No record</span>}
      </div>
      <div className={styles.restCell}>
        {restFrom.length ? restFrom.map((family) => (
          <span className={styles.family} key={family} title={cropFamilySummaryLabel(family)}>
            <RestIcon />{plantingCropFamilyLabels[family]}
          </span>
        )) : <span className={styles.none}>Any family</span>}
      </div>
      <div className={`${styles.nextCell} ${styles.onDark}`} data-year={planningYear}>
        {plantings.length ? (
          <div className={styles.picks}>
            {plantings.map((planting) => {
              const repeated = repeatedFamily(planting, restFrom);
              return (
                <span className={styles.pickGroup} key={planting.id}>
                  <span className={styles.pick}>
                    <i data-plant-swatch style={{ background: colorOf(planting).fill }} />
                    {planting.commonName}
                  </span>
                  {repeated ? <span className={styles.again}><WarnIcon />{plantingCropFamilyLabels[repeated]} again</span> : null}
                  <button className={styles.remove} type="button" aria-label={`Remove ${planting.commonName} from ${area.name}`} onClick={() => onRemove(planting)}>
                    <CrossIcon />
                  </button>
                </span>
              );
            })}
            {isChoosing ? null : (
              <button id={addButtonId(areaKey)} className={styles.addMore} type="button" aria-label={`Add a plant to ${area.name}`} onClick={onChoose}>
                <PlusIcon />
              </button>
            )}
          </div>
        ) : null}
        {notes.map((note) => (
          <p className={styles.pair} key={note.message}>
            {note.message}{" "}
            <a href={note.sourceUrl} rel="noreferrer" target="_blank">{note.sourceLabel}</a>
          </p>
        ))}
        {isChoosing ? (
          <PlantChooser
            areaKey={areaKey}
            planningYear={planningYear}
            choice={choice}
            history={history}
            restFrom={restFrom}
            onChange={onChoiceChange}
            onSubmit={() => onSubmit(choice)}
            onCancel={() => onCancel(choice)}
          />
        ) : !plantings.length ? (
          <div className={styles.picks}>
            <button id={addButtonId(areaKey)} className={styles.choose} type="button" aria-label={`Choose a plant for ${area.name}`} onClick={onChoose}>
              <PlusIcon />Choose a plant
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlantChooser({ areaKey, planningYear, choice, history, restFrom, onChange, onSubmit, onCancel }: {
  areaKey: string;
  planningYear: number;
  choice: PlantChoice;
  history: ReturnType<typeof recentHistory>;
  restFrom: PlantingCropFamily[];
  onChange: (choice: PlantChoice) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const family = resolvedCropFamily(choice);
  const typed = Boolean(choice.plantType.trim());
  const repeatYear = typed && restFrom.includes(family) ? latestFamilyYear(history, family) : undefined;
  const fit = rotationFit(restFrom).slice(0, 4).map((item) => plantingCropFamilyLabels[item]);
  const inputId = `season-plant-type-${areaKey}`;
  const familyId = `season-crop-family-${areaKey}`;
  const input = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState(false);

  return (
    <form
      className={styles.chooser}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (choice.plantType.trim()) onSubmit();
        else { setInvalid(true); input.current?.focus(); }
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        onCancel();
      }}
    >
      <label htmlFor={inputId}>Plant type</label>
      <input
        ref={input}
        id={inputId}
        required
        autoFocus
        autoComplete="off"
        placeholder="e.g. Tomato or Sungold"
        value={choice.plantType}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${inputId}-error` : undefined}
        onChange={(event) => {
          const plantType = event.target.value;
          setInvalid(false);
          onChange({ ...choice, plantType, cropFamily: choice.isCropFamilyManual ? choice.cropFamily : inferPlantCropFamily(plantType) });
        }}
      />
      {invalid ? <p className={styles.chooserError} id={`${inputId}-error`}>Enter a plant type.</p> : null}
      {choice.isCropFamilyManual ? (
        <>
          <label htmlFor={familyId}>Crop family</label>
          <select id={familyId} value={choice.cropFamily} onChange={(event) => onChange({ ...choice, cropFamily: event.target.value as PlantingCropFamily })}>
            {plantingCropFamilies.map((item) => <option key={item} value={item}>{plantingCropFamilyLabels[item]}</option>)}
          </select>
        </>
      ) : typed ? (
        <p className={styles.chooserFamily}>
          Crop family: <strong>{plantingCropFamilyLabels[family]}</strong>
          <button type="button" onClick={() => onChange({ ...choice, cropFamily: family, isCropFamilyManual: true })}>Change</button>
        </p>
      ) : null}
      {repeatYear !== undefined ? (
        <p className={styles.chooserHint}><span className={styles.again}><WarnIcon />{plantingCropFamilyLabels[family]} grew here in {repeatYear}</span></p>
      ) : restFrom.length ? (
        <p className={styles.chooserHint}>Good fit here: {fit.join(", ")}.</p>
      ) : null}
      <div className={styles.chooserActions}>
        <button className={styles.whiteButton} type="submit">Add to {planningYear} plan</button>
        <button className={styles.ghostButton} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function SeasonMap({ garden, planningYear, colorOf, hotAreaId, onHot, onOpenArea }: {
  garden: Garden;
  planningYear: number;
  colorOf: ColorOf;
  hotAreaId?: string;
  onHot: (areaId: string | undefined) => void;
  onOpenArea: (area: GrowingArea) => void;
}) {
  const titleId = `season-map-${garden.id}`;
  const areas = garden.growingAreas;
  const measured = areas.filter((area) => area.layout);
  const unmeasured = areas.length - measured.length;
  const legend = uniquePlanPlants(garden.seasonPlans?.find((plan) => plan.seasonYear === planningYear)?.plantings ?? []);
  const viewport = gardenPlanViewport(garden.plan, areas, "growing-areas");
  // One "screen pixel" in metres, for a map about 340px wide: keeps numbers and lines the same size in any garden.
  const pad = Math.max(viewport.widthMeters, viewport.depthMeters) * 0.06;
  const viewWidth = viewport.widthMeters + pad * 2;
  const unit = viewWidth / 340;
  const fontSize = 12 * unit;

  return (
    <aside className={styles.side}>
      <section className={styles.mapCard} aria-labelledby={titleId}>
        <div className={styles.mapHead}>
          <h2 id={titleId}>{planningYear} map</h2>
          <Link className={styles.textLink} href={gardenPath(garden.id)}>Open Garden Plan <span aria-hidden="true">→</span></Link>
        </div>
        {measured.length ? (
          <div className={styles.mapCanvas}>
            <svg
              aria-label={`${planningYear} plan preview for ${garden.name}`}
              role="img"
              viewBox={`${viewport.x - pad} ${viewport.y - pad - fontSize * 1.4} ${viewWidth} ${viewport.depthMeters + pad * 2 + fontSize * 1.4}`}
            >
              {areas.map((area, index) => {
                const layout = area.layout;
                if (!layout) return null;
                const plants = uniquePlanPlants(plannedForArea(garden, area.id, planningYear));
                const tokens = planTokens(plants, layout.widthMeters, layout.depthMeters);
                const label = numberPosition(area, fontSize);
                const hot = hotAreaId === area.id;
                return (
                  <g
                    key={area.id}
                    className={styles.bedGroup}
                    data-hot={hot || undefined}
                    onMouseEnter={() => onHot(area.id)}
                    onMouseLeave={() => onHot(undefined)}
                    onClick={() => onOpenArea(area)}
                  >
                    <title>{area.name}</title>
                    <g transform={`translate(${area.planPlacement.x} ${area.planPlacement.y}) rotate(${area.planPlacement.rotationDegrees})`}>
                      <polygon
                        className={plants.length ? styles.bed : `${styles.bed} ${styles.bedOpen}`}
                        points={layout.boundary.map((point) => `${point.x},${point.y}`).join(" ")}
                        strokeWidth={(hot ? 3 : plants.length ? 1.6 : 1.3) * unit}
                        strokeDasharray={plants.length || hot ? undefined : `${5 * unit} ${4 * unit}`}
                      />
                      {tokens.map(({ planting, x, y, radius }) => {
                        const colors = colorOf(planting);
                        return <circle key={planting.id} aria-label={planting.commonName} cx={x} cy={y} r={radius} fill={colors.fill} stroke={colors.stroke} strokeWidth={1.4 * unit} />;
                      })}
                    </g>
                    <text className={styles.bedNumber} data-testid={`season-area-label-${area.id}`} fontSize={fontSize} textAnchor="middle" x={label.x} y={label.y}>
                      {index + 1}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        ) : null}
        <div className={styles.mapFoot}>
          {legend.length ? (
            <p className={styles.legend}>
              {legend.map((planting) => <PlantChip key={planting.id} name={planting.commonName} colors={colorOf(planting)} />)}
            </p>
          ) : <p className={styles.mapEmpty}>Plants appear on the map as you choose them.</p>}
          <p className={styles.key}>
            <span><i data-plant-swatch aria-hidden="true" />Planned</span>
            <span><i data-plant-swatch aria-hidden="true" className={styles.keyOpen} />Not planned yet</span>
          </p>
          {unmeasured ? (
            <p className={styles.mapNote}>
              {unmeasured === 1 ? "1 planting area needs a size to appear here." : `${unmeasured} planting areas need a size to appear here.`}
            </p>
          ) : null}
        </div>
      </section>
    </aside>
  );
}

const drawerTitleId = "season-plan-with-ai-title";

/**
 * Plan with AI: a native modal dialog that slides in from the right. Closing only hides it;
 * the Allocation Assistant inside stays mounted, so chosen crops and a draft survive.
 */
function PlanWithAiDrawer({ open, opener, onClose, children }: { open: boolean; opener: RefObject<HTMLButtonElement | null>; onClose: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!open || !node) return;
    const trigger = opener.current;
    const unlock = lockBodyScroll();
    node.showModal();
    node.querySelector<HTMLElement>("[data-drawer-close]")?.focus();
    return () => {
      node.close();
      unlock();
      trigger?.focus();
    };
  }, [open, opener]);
  return (
    <dialog
      ref={dialog}
      className={styles.drawer}
      aria-labelledby={drawerTitleId}
      aria-modal="true"
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onClose();
      }}
      // The dialog box fills the drawer, so a click that lands on the dialog itself is on the backdrop.
      onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className={`${styles.band} ${styles.veins} ${styles.drawerHead} ${styles.onDark}`}>
        <div className={styles.drawerTop}>
          <h2 id={drawerTitleId}>Plan with AI</h2>
          <button className={styles.drawerClose} type="button" aria-label="Close" data-drawer-close onClick={onClose}><CrossIcon /></button>
        </div>
        <p>
          Choose crops for next season. The assistant checks each placement against this garden&apos;s crop rotation
          history and returns a draft. Nothing is added until you confirm.
        </p>
      </div>
      <div className={styles.drawerBody}>{children}</div>
    </dialog>
  );
}

/** Where an area's number sits on the map: above its top edge, or below it when the top is at the edge. */
function numberPosition(area: GrowingArea, fontSize: number) {
  const layout = area.layout;
  if (!layout) return { x: area.planPlacement.x, y: area.planPlacement.y };
  const angle = (area.planPlacement.rotationDegrees * Math.PI) / 180;
  const points = layout.boundary.map((point) => ({
    x: area.planPlacement.x + point.x * Math.cos(angle) - point.y * Math.sin(angle),
    y: area.planPlacement.y + point.x * Math.sin(angle) + point.y * Math.cos(angle),
  }));
  const top = Math.min(...points.map((point) => point.y));
  const left = Math.min(...points.map((point) => point.x));
  const right = Math.max(...points.map((point) => point.x));
  return { x: (left + right) / 2, y: top - fontSize * 0.45 };
}

/** One circle per planned plant type, never a count, laid out on a grid inside the area. */
function planTokens(plantings: PlannedPlanting[], widthMeters: number, depthMeters: number) {
  const columns = Math.max(1, Math.ceil(Math.sqrt(plantings.length)));
  const rows = Math.max(1, Math.ceil(plantings.length / columns));
  const shortestSide = Math.min(widthMeters, depthMeters);
  const padding = shortestSide * 0.12;
  const availableWidth = Math.max(widthMeters - padding * 2, shortestSide * 0.4);
  const availableDepth = Math.max(depthMeters - padding * 2, shortestSide * 0.4);
  const radius = Math.max(shortestSide * 0.11, Math.min(availableWidth / columns, availableDepth / rows) * 0.36);
  return plantings.map((planting, index) => ({
    planting,
    x: padding + ((index % columns) + 0.5) * (availableWidth / columns),
    y: padding + (Math.floor(index / columns) + 0.5) * (availableDepth / rows),
    radius,
  }));
}

function emptyChoice(): PlantChoice {
  return { plantType: "", cropFamily: "other", isCropFamilyManual: false };
}

function resolvedCropFamily(choice: PlantChoice) {
  return choice.isCropFamilyManual ? choice.cropFamily : inferPlantCropFamily(choice.plantType);
}

function guidanceKey(gardenId: string, areaId: string) {
  return `${gardenId}:${areaId}`;
}

const addButtonId = (key: string) => `season-add-${key}`;
const rowId = (key: string) => `season-row-${key}`;

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

function PlusIcon() {
  return <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>;
}
function CrossIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" /></svg>;
}
function RestIcon() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="7" cy="7" r="5.2" /><path d="M3.4 10.6l7.2-7.2" /></svg>;
}
function WarnIcon() {
  return <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 1.8l5.6 9.9H1.4L7 1.8z" /><path d="M7 5.8v2.6M7 10v.1" /></svg>;
}
function SparkIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 4l1.7 4.8L17.5 10.5l-4.8 1.7L11 17l-1.7-4.8L4.5 10.5l4.8-1.7L11 4z" /><path d="M18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7.7-1.8z" /></svg>;
}
