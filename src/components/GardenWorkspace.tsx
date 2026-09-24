"use client";

import { FormEvent, type ReactNode, useEffect, useRef, useState } from "react";

import { SERVER_WORKSPACE_STORAGE_KEY, useWorkspaceSync } from "@/hooks/useWorkspaceSync";

import { CareWorkspace, type CareRecords } from "@/components/CareWorkspace";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { GardenPlanOverview } from "@/components/GardenPlanOverview";
import { GrowingAreaLayoutEditor } from "@/components/GrowingAreaLayoutEditor";
import { SeasonPlanner } from "@/components/SeasonPlanner";
import { AiGardenNote } from "@/components/AiGardenNote";
import { PlantHealth } from "@/components/PlantHealth";
import { PlantKnowledge } from "@/components/PlantKnowledge";
import {
  clampAllocationCenter,
  clampPlanPosition,
  createRectangularLayout,
  createDemoGardenWorkspace,
  createGarden,
  createGardenWorkspace,
  createId,
  defaultPlanPlacement,
  growingAreaKindLabels,
  growingAreaKinds,
  linkCurrentLayoutPlants,
  normalizePlanRotation,
  snapToGrid,
  validateLayoutDimensions,
  type Garden,
  type HealthRecord,
  type CareEvent,
  type GardenPlan,
  type GardenWorkspace,
  type GrowingArea,
  type GrowingAreaKind,
  type GrowingAreaLayout,
  type PlanPlacement,
  type PlantingCropFamily,
} from "@/lib/gardenWorkspace";
import {
  addSeasonPlanPlanting,
  archivePlanting,
  removeGarden,
  removeGrowingArea,
  removeSeasonPlanPlanting,
} from "@/lib/gardenOperations";
import { type AiCareNoteDraft } from "@/lib/gardenWorkspaceApi";
import {
  appendAllocationToGarden,
  isAllocationDraftStale,
  nextSeasonYear,
  type AllocationInput,
  type SeasonAllocationResult,
} from "@/lib/seasonAllocation";
import type { AllocationConfirmOutcome } from "@/components/AllocationAssistant";
import { isCalendarDate, plantGroupDisplayName } from "@/lib/careRecords";

export { SERVER_WORKSPACE_STORAGE_KEY };

/**
 * Which screen is showing. Exactly one at a time, so switching screens is a
 * single assignment and two screens can never be open together.
 */
type Page =
  | { name: "home" }
  | { name: "gardenSetup" }
  | { name: "management"; isSetup: boolean }
  | { name: "careLog"; gardenId?: string; view?: "tasks" | "history" }
  | { name: "careHub" }
  | { name: "seasonPlanner" }
  | { name: "aiGardenNote" }
  | { name: "plantHealth" }
  | { name: "plantKnowledge" };

export function GardenWorkspace() {
  const [message, setMessage] = useState("");
  const {
    workspace,
    setWorkspace,
    isSynced,
    isLoaded,
    storageSource,
    serverWorkspaceId,
    serverLoadFailed,
    saveConflict,
    clearBrowserWorkspace,
    reloadFromServer,
    keepLocalChanges,
  } = useWorkspaceSync({ onMessage: setMessage });
  const [page, setPage] = useState<Page>({ name: "home" });
  const careGardenId = page.name === "careLog" ? page.gardenId : undefined;
  const [newGardenName, setNewGardenName] = useState("");
  const [areaName, setAreaName] = useState("");
  const [areaKind, setAreaKind] = useState<GrowingAreaKind>("raised-bed");
  const [areaLength, setAreaLength] = useState("2");
  const [areaWidth, setAreaWidth] = useState("1");
  const [areaRotationDegrees, setAreaRotationDegrees] = useState("0");
  const [isAreaFormOpen, setIsAreaFormOpen] = useState(false);
  const [editingLayoutId, setEditingLayoutId] = useState<string>();
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    message: string;
    tone?: "default" | "danger";
    onConfirm: () => void;
  }>();
  const gardenPlanHeadingRef = useRef<HTMLHeadingElement>(null);
  // The newest rendered workspace, so a confirm click checks the draft
  // against current data rather than the data the draft was shown with.
  const latestWorkspaceRef = useRef(workspace);
  latestWorkspaceRef.current = workspace;
  const careLogHeadingRef = useRef<HTMLHeadingElement>(null);

  const garden = workspace?.gardens.find(
    (candidate) => candidate.id === workspace.selectedGardenId,
  );
  const careGarden = careGardenId === "all-gardens" && workspace
    ? {
        id: "all-gardens",
        name: "All gardens",
        plan: { widthMeters: 1, depthMeters: 1 },
        growingAreas: [],
        plantings: [],
        careEvents: workspace.careEvents,
        careTasks: workspace.careTasks,
        healthRecords: [],
      }
    : garden;
  const editingArea = garden?.growingAreas.find(
    (area) => area.id === editingLayoutId,
  );

  useEffect(() => {
    if ((page.name !== "management" && page.name !== "careLog") || editingArea) return;
    const heading = page.name === "careLog"
      ? careLogHeadingRef.current
      : gardenPlanHeadingRef.current;
    heading?.focus();
  }, [editingArea, page.name, garden?.id]);

  const updateGarden = (update: (current: Garden) => Garden) => {
    setWorkspace((current) =>
      current
        ? {
            ...current,
            gardens: current.gardens.map((candidate) =>
              candidate.id === current.selectedGardenId
                ? update(candidate)
                : candidate,
            ),
          }
        : current,
    );
  };

  const clearTransientState = () => {
    setNewGardenName("");
    setEditingLayoutId(undefined);
    setIsAreaFormOpen(false);
  };

  const openManagement = (gardenId = garden?.id) => {
    if (gardenId)
      setWorkspace((current) =>
        current ? { ...current, selectedGardenId: gardenId } : current,
      );
    setPage({ name: "management", isSetup: false });
    clearTransientState();
  };

  const openCareLog = (gardenId = garden?.id) => {
    if (gardenId && gardenId !== "all-gardens")
      setWorkspace((current) =>
        current ? { ...current, selectedGardenId: gardenId } : current,
      );
    setPage({ name: "careLog", gardenId });
    clearTransientState();
  };

  const openCareHub = () => {
    setPage({ name: "careHub" });
    clearTransientState();
  };

  const returnToDashboard = () => {
    setPage({ name: "home" });
    clearTransientState();
  };

  const createFirstGarden = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newGardenName.trim();
    if (!name) return setMessage("Enter a garden name to continue.");
    setWorkspace(createGardenWorkspace(name));
    setNewGardenName("");
    setPage({ name: "management", isSetup: true });
    setMessage("Garden created. Continue with its plan and planting areas.");
  };

  const addGarden = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newGardenName.trim();
    if (!name) return setMessage("Enter a garden name to continue.");
    const newGarden = createGarden(name);
    setWorkspace((current) =>
      current
        ? {
            ...current,
            selectedGardenId: newGarden.id,
            gardens: [...current.gardens, newGarden],
          }
        : current,
    );
    setNewGardenName("");
    setPage({ name: "management", isSetup: true });
    setMessage(`${name} created. Continue with its plan and planting areas.`);
  };

  const openDemoGarden = () => {
    const demoGarden = workspace?.gardens.find(
      (candidate) => candidate.id === "demo-garden",
    );
    if (demoGarden) {
      openManagement(demoGarden.id);
      return;
    }

    const createdDemoGarden = createDemoGardenWorkspace().gardens[0];
    setWorkspace((current) =>
      current
        ? {
            ...current,
            selectedGardenId: createdDemoGarden.id,
            gardens: [...current.gardens, createdDemoGarden],
          }
        : current,
    );
    setPage({ name: "management", isSetup: false });
    clearTransientState();
    setMessage("Demo garden opened.");
  };

  const openGardenSetup = () => {
    setNewGardenName("");
    setPage({ name: "gardenSetup" });
    clearTransientState();
  };

  const deleteGarden = () => {
    if (!workspace || !garden) return;
    const impact = `${garden.growingAreas.length} planting area${garden.growingAreas.length === 1 ? "" : "s"} and ${garden.plantings.length} planting record${garden.plantings.length === 1 ? "" : "s"}`;
    setPendingConfirmation({
      message: `Delete ${garden.name}? This removes its ${impact} from this browser.`,
      tone: "danger",
      onConfirm: () => {
        const next = removeGarden(workspace, garden.id);
        if (!next) {
          if (storageSource === "server") {
            setMessage("Add another garden before deleting the last PostgreSQL garden.");
            return;
          }
          clearBrowserWorkspace();
          setPage({ name: "home" });
          setMessage("Create a garden when you are ready.");
          return;
        }

        setWorkspace(next);
        clearTransientState();
        setMessage(`${garden.name} deleted.`);
      },
    });
  };

  const loadDemo = () => {
    const applyDemo = () => {
      const demo = createDemoGardenWorkspace();
      setWorkspace(demo);
      clearTransientState();
      setMessage("Demo garden loaded.");
    };
    if (workspace) {
      setPendingConfirmation({
        message: "Load the demo garden? This replaces gardens saved in this browser.",
        onConfirm: applyDemo,
      });
      return;
    }
    applyDemo();
  };

  const openAreaForm = () => {
    setEditingLayoutId(undefined);
    setAreaName("");
    setAreaKind("raised-bed");
    setAreaLength("2");
    setAreaWidth("1");
    setAreaRotationDegrees("0");
    setIsAreaFormOpen(true);
  };

  const openAreaInspector = (areaId: string) => {
    setIsAreaFormOpen(false);
    setEditingLayoutId(areaId);
  };

  const saveArea = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = areaName.trim();
    const length = Number(areaLength);
    const width = Number(areaWidth);
    const rotationDegrees = Number(areaRotationDegrees);
    if (!garden || !name)
      return setMessage("Enter a planting-area name to continue.");
    if (!validateLayoutDimensions(length, width))
      return setMessage("Enter planting-area dimensions of at least 0.1 metres.");
    if (!Number.isFinite(rotationDegrees))
      return setMessage("Enter a valid rotation angle.");
    const areaId = createId("area");

    updateGarden((current) => {
      const placement = defaultPlanPlacement(current.growingAreas.length);
      return {
        ...current,
        growingAreas: [
          ...current.growingAreas,
          {
            id: areaId,
            name,
            kind: areaKind,
            layout: createRectangularLayout(snapToGrid(length), snapToGrid(width)),
            planPlacement: {
              ...placement,
              ...clampPlanPosition(placement, current.plan),
              rotationDegrees: normalizePlanRotation(rotationDegrees),
            },
          },
        ],
      };
    });
    setAreaName("");
    setAreaKind("raised-bed");
    setAreaLength("2");
    setAreaWidth("1");
    setAreaRotationDegrees("0");
    setIsAreaFormOpen(false);
    setMessage(`${name} added. Drag it on the plan to position it.`);
  };

  const saveAreaEditor = (
    areaId: string,
    name: string,
    kind: GrowingAreaKind,
    rotationDegrees: number,
    layout: GrowingAreaLayout,
  ) => {
    const trimmedName = name.trim();
    if (!trimmedName)
      return setMessage("Enter a planting-area name to continue.");
    if (!Number.isFinite(rotationDegrees))
      return setMessage("Enter a valid rotation angle.");
    updateGarden((current) =>
      linkCurrentLayoutPlants({
        ...current,
        growingAreas: current.growingAreas.map((area) =>
          area.id === areaId
            ? {
                ...area,
                name: trimmedName,
                kind,
                layout,
                planPlacement: {
                  ...area.planPlacement,
                  rotationDegrees: normalizePlanRotation(rotationDegrees),
                },
              }
            : area,
        ),
      }),
    );
    setMessage(`${trimmedName} saved.`);
  };

  const deleteArea = (area: GrowingArea) => {
    if (!garden) return;
    const linkedPlantings = garden.plantings.filter(
      (planting) => planting.growingAreaId === area.id,
    );
    const linkedPlans = (garden.seasonPlans ?? []).flatMap((plan) =>
      plan.plantings.filter((planting) => planting.growingAreaId === area.id),
    );
    const planNote = linkedPlans.length
      ? `, plus ${linkedPlans.length} next-season plan entr${linkedPlans.length === 1 ? "y" : "ies"},`
      : "";
    setPendingConfirmation({
      message: `Delete ${area.name}? This removes the planting area and its ${linkedPlantings.length} planting record${linkedPlantings.length === 1 ? "" : "s"}${planNote} from this browser. Care history stays in this garden.`,
      tone: "danger",
      onConfirm: () => {
        updateGarden((current) => removeGrowingArea(current, area.id));
        if (editingLayoutId === area.id) setEditingLayoutId(undefined);
        setMessage(`${area.name} deleted.`);
      },
    });
  };

  const updatePlan = (plan: GardenPlan) => {
    updateGarden((current) => ({
      ...current,
      plan,
      growingAreas: current.growingAreas.map((area) => ({
        ...area,
        planPlacement: {
          ...area.planPlacement,
          ...clampPlanPosition(area.planPlacement, plan),
        },
      })),
    }));
  };

  const updateAreaPlacement = (
    areaId: string,
    planPlacement: PlanPlacement,
  ) => {
    updateGarden((current) => ({
      ...current,
      growingAreas: current.growingAreas.map((area) =>
        area.id === areaId ? { ...area, planPlacement } : area,
      ),
    }));
  };

  const updateAreaLayout = (areaId: string, layout: GrowingAreaLayout) => {
    updateGarden((current) =>
      linkCurrentLayoutPlants({
        ...current,
        growingAreas: current.growingAreas.map((area) =>
          area.id === areaId ? { ...area, layout } : area,
        ),
      }),
    );
  };

  const archivePlantingRecord = (plantingRecordId: string) => {
    updateGarden((current) => archivePlanting(current, plantingRecordId));
  };

  const openSeasonPlanner = () => {
    setPage({ name: "seasonPlanner" });
    clearTransientState();
  };

  const openAiGardenNote = () => {
    setPage({ name: "aiGardenNote" });
    clearTransientState();
  };

  const openPlantHealth = () => {
    setPage({ name: "plantHealth" });
    clearTransientState();
  };

  const openPlantKnowledge = () => {
    setPage({ name: "plantKnowledge" });
    clearTransientState();
  };

  const saveSeasonPlanPlant = (
    gardenId: string,
    growingAreaId: string,
    choice: { plantType: string; cropFamily: PlantingCropFamily },
  ) => {
    const planningYear = new Date().getFullYear() + 1;
    const plannedPlanting = {
      id: createId("planned-planting"),
      commonName: choice.plantType,
      plantType: choice.plantType,
      cropFamily: choice.cropFamily,
      growingAreaId,
    };
    setWorkspace((current) =>
      current
        ? {
            ...current,
            gardens: current.gardens.map((garden) =>
              garden.id === gardenId
                ? addSeasonPlanPlanting(garden, planningYear, plannedPlanting, () => createId("season-plan"))
                : garden,
            ),
          }
        : current,
    );
    setMessage(`${choice.plantType} added to the ${planningYear} plan.`);
  };

  const confirmSeasonAllocation = (
    gardenId: string,
    draft: SeasonAllocationResult,
    input: AllocationInput,
  ): AllocationConfirmOutcome => {
    // Re-read the season year and re-check the draft at the moment of the click.
    const seasonYear = nextSeasonYear();
    const current = latestWorkspaceRef.current?.gardens.find((candidate) => candidate.id === gardenId);
    if (!current || isAllocationDraftStale(draft, current, input, seasonYear)) return { status: "stale" };
    const { added, skipped } = appendAllocationToGarden(current, draft, createId);
    // Apply to the newest state, so plan entries added meanwhile are kept and
    // a repeated confirm skips what the first one added.
    setWorkspace((latest) =>
      latest
        ? {
            ...latest,
            gardens: latest.gardens.map((candidate) =>
              candidate.id === gardenId && !isAllocationDraftStale(draft, candidate, input, seasonYear)
                ? appendAllocationToGarden(candidate, draft, createId).garden
                : candidate,
            ),
          }
        : latest,
    );
    setMessage(`Allocation Assistant: added ${added}, skipped ${skipped} in the ${seasonYear} plan.`);
    return { status: "added", added, skipped, seasonYear };
  };

  const removeSeasonPlanPlant = (
    gardenId: string,
    seasonYear: number,
    plantingId: string,
  ) => {
    setWorkspace((current) =>
      current
        ? {
            ...current,
            gardens: current.gardens.map((garden) =>
              garden.id === gardenId
                ? removeSeasonPlanPlanting(garden, seasonYear, plantingId)
                : garden,
            ),
          }
        : current,
    );
    setMessage("Plant removed from the season plan.");
  };

  /** Apply an edit to the care records the Care screen is showing. */
  const updateCareRecords = (update: (records: CareRecords) => CareRecords) => {
    setWorkspace((current) => {
      if (!current) return current;
      if (careGardenId === "all-gardens")
        return { ...current, ...update({ careEvents: current.careEvents, careTasks: current.careTasks }) };
      return {
        ...current,
        gardens: current.gardens.map((candidate) =>
          candidate.id === current.selectedGardenId
            ? { ...candidate, ...update({ careEvents: candidate.careEvents, careTasks: candidate.careTasks }) }
            : candidate,
        ),
      };
    });
  };

  const saveAiCareNote = (gardenId: string, draft: AiCareNoteDraft) => {
    if (!workspace || !draft.type || !draft.date || !isCalendarDate(draft.date)) {
      setMessage("Choose a care type and valid date before saving.");
      return;
    }
    const targetGarden = workspace.gardens.find((candidate) => candidate.id === gardenId);
    if (!targetGarden) return;
    const area = targetGarden.growingAreas.find((candidate) => candidate.id === draft.growingAreaId);
    const planting = targetGarden.plantings.find((candidate) => candidate.id === draft.plantingRecordId);
    if (draft.targetScope === "planting-area" && !area) return setMessage("Choose an existing planting area.");
    if (draft.targetScope === "plant-group" && !planting) return setMessage("Choose an existing plant group.");
    if (draft.type === "fertilizing" && draft.fertilizerAmount !== null && (!Number.isFinite(draft.fertilizerAmount) || draft.fertilizerAmount <= 0)) {
      return setMessage("Enter a fertilizer amount greater than zero.");
    }
    const event: CareEvent = {
      id: createId("care"),
      type: draft.type,
      date: draft.date,
      note: draft.note.trim(),
      targetScope: draft.targetScope,
      ...(draft.targetScope === "planting-area" ? { growingAreaId: area?.id, growingAreaName: area?.name } : {}),
      ...(draft.targetScope === "plant-group" ? { plantingRecordId: planting?.id, plantingRecordName: planting ? plantGroupDisplayName(planting, targetGarden) : undefined } : {}),
      ...(draft.type === "fertilizing"
        ? {
            ...(draft.fertilizerProduct?.trim() ? { fertilizerProduct: draft.fertilizerProduct.trim() } : {}),
            ...(draft.fertilizerAmount !== null ? { fertilizerAmount: draft.fertilizerAmount } : {}),
            ...(draft.fertilizerUnit?.trim() ? { fertilizerUnit: draft.fertilizerUnit.trim() } : {}),
          }
        : {}),
    };
    setWorkspace((current) => current ? {
      ...current,
      selectedGardenId: gardenId,
      ...(draft.targetScope === "all-gardens"
        ? { careEvents: [...current.careEvents, event] }
        : { gardens: current.gardens.map((candidate) => candidate.id === gardenId ? { ...candidate, careEvents: [...candidate.careEvents, event] } : candidate) }),
    } : current);
    setPage({ name: "careLog", view: "history" });
    setMessage("AI care draft saved to Care History.");
  };

  const saveHealthRecord = (gardenId: string, record: HealthRecord) => {
    setWorkspace((current) => current ? {
      ...current,
      selectedGardenId: gardenId,
      gardens: current.gardens.map((candidate) => candidate.id === gardenId
        ? { ...candidate, healthRecords: [...candidate.healthRecords, record] }
        : candidate),
    } : current);
    setMessage("Plant health record saved.");
  };

  if (!isLoaded)
    return (
      <main className="operations-shell">
        <p className="loading-state">Loading garden workspace...</p>
      </main>
    );
  if (serverLoadFailed)
    return <ServerWorkspaceUnavailable message={message} />;
  if (!workspace || !garden)
    return (
      <Onboarding
        newGardenName={newGardenName}
        message={message}
        onChangeName={setNewGardenName}
        onCreate={createFirstGarden}
        onLoadDemo={loadDemo}
      />
    );

  return (
    <main className="operations-shell operations-app-shell">
      <header className="operations-header operations-header-active">
        <p className="product-kicker">Garden Manager</p>
        <div className="header-actions">
          {page.name !== "home" && page.name !== "gardenSetup" ? (
            <button
              className="secondary-button"
              onClick={returnToDashboard}
              type="button"
            >
              Back to gardens
            </button>
          ) : null}
        </div>
      </header>
      {saveConflict ? (
        <SaveConflictNotice onReload={reloadFromServer} onKeepLocal={keepLocalChanges} />
      ) : null}
      {page.name === "gardenSetup" ? (
          <GardenSetupStart
            name={newGardenName}
            message={message}
            onChangeName={setNewGardenName}
            onCreate={addGarden}
            onCancel={returnToDashboard}
          />
        ) : page.name === "seasonPlanner" ? (
          <SeasonPlanner
            gardens={workspace.gardens}
            isSynced={isSynced}
            onConfirmAllocation={confirmSeasonAllocation}
            onRemovePlan={removeSeasonPlanPlant}
            onSavePlan={saveSeasonPlanPlant}
            workspaceId={serverWorkspaceId}
          />
        ) : page.name === "aiGardenNote" ? (
          <AiGardenNote
            gardens={workspace.gardens}
            initialGardenId={garden.id}
            isServerBacked={storageSource === "server"}
            onSave={saveAiCareNote}
            workspaceId={serverWorkspaceId}
          />
        ) : page.name === "plantHealth" ? (
          <PlantHealth
            gardens={workspace.gardens}
            initialGardenId={garden.id}
            isServerBacked={storageSource === "server"}
            onSave={saveHealthRecord}
            workspaceId={serverWorkspaceId}
          />
        ) : page.name === "plantKnowledge" ? (
          <PlantKnowledge
            gardens={workspace.gardens}
            initialGardenId={garden.id}
            isServerBacked={storageSource === "server"}
            workspaceId={serverWorkspaceId}
          />
        ) : page.name === "careHub" ? (
          <CareHub
            gardens={workspace.gardens}
            onOpenCare={openCareLog}
            workspace={workspace}
          />
      ) : page.name === "home" ? (
          <Home
            gardens={workspace.gardens}
            onCare={openCareHub}
            onAiGardenNote={openAiGardenNote}
            onPlantHealth={openPlantHealth}
            onPlantKnowledge={openPlantKnowledge}
            onPlanSeason={openSeasonPlanner}
            onOpenDemoGarden={openDemoGarden}
            onAddGarden={openGardenSetup}
            onManage={openManagement}
            message={message}
          />
        ) : page.name === "careLog" && careGarden ? (
          <section className="operations-content">
            <CareWorkspace
              key={careGardenId ?? garden.id}
              garden={careGarden}
              headingRef={careLogHeadingRef}
              initialView={page.view}
              onMessage={setMessage}
              onUpdateRecords={updateCareRecords}
            />
            <Status message={message} />
          </section>
        ) : (
          <section className="operations-content management-content">
            <>
              <div className={`garden-plan-workbench${isAreaFormOpen || editingArea ? " is-area-inspector-open" : ""}`}>
                <GardenPlanOverview
                  editable
                  gardenName={garden.name}
                  growingAreas={garden.growingAreas}
                  headingRef={gardenPlanHeadingRef}
                  isAreaInspectorOpen={isAreaFormOpen || Boolean(editingArea)}
                  onAddArea={openAreaForm}
                  onEditLayout={openAreaInspector}
                  onGardenNameChange={(name) => updateGarden((current) => ({ ...current, name }))}
                  onPlacementChange={updateAreaPlacement}
                  onPlanChange={updatePlan}
                  plan={garden.plan}
                />
                <PlantingAreaCreation
                  areaKind={areaKind}
                  areaLength={areaLength}
                  areaName={areaName}
                  areaRotationDegrees={areaRotationDegrees}
                  areaWidth={areaWidth}
                  isAreaFormOpen={isAreaFormOpen}
                  onSave={saveArea}
                  onSetAreaKind={setAreaKind}
                  onSetAreaLength={setAreaLength}
                  onSetAreaName={setAreaName}
                  onSetAreaRotationDegrees={setAreaRotationDegrees}
                  onSetAreaWidth={setAreaWidth}
                  onSetFormOpen={setIsAreaFormOpen}
                />
                {editingArea ? (
                  <PlantingAreaInspector
                    area={editingArea}
                    onClose={() => setEditingLayoutId(undefined)}
                    onDelete={() => deleteArea(editingArea)}
                    onSave={saveAreaEditor}
                  >
                    <GrowingAreaLayoutEditor
                      area={editingArea}
                      inInspector
                      onArchivePlantingRecord={archivePlantingRecord}
                      onChange={(layout) => updateAreaLayout(editingArea.id, layout)}
                      onSaveArea={(name, kind, rotationDegrees, layout) =>
                        saveAreaEditor(editingArea.id, name, kind, rotationDegrees, layout)
                      }
                      showAreaProperties={false}
                    />
                  </PlantingAreaInspector>
                ) : null}
              </div>
              <GardenManagement
                onDeleteGarden={deleteGarden}
                isSetup={page.name === "management" && page.isSetup}
                onFinishSetup={returnToDashboard}
                storageSource={storageSource}
              />
            </>
            <Status message={message} />
          </section>
        )}
      {pendingConfirmation ? (
        <ConfirmDialog
          message={pendingConfirmation.message}
          tone={pendingConfirmation.tone}
          onCancel={() => setPendingConfirmation(undefined)}
          onConfirm={() => {
            pendingConfirmation.onConfirm();
            setPendingConfirmation(undefined);
          }}
        />
      ) : null}
    </main>
  );
}

function Onboarding({
  newGardenName,
  message,
  onChangeName,
  onCreate,
  onLoadDemo,
}: {
  newGardenName: string;
  message: string;
  onChangeName: (name: string) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onLoadDemo: () => void;
}) {
  return (
    <main className="operations-shell">
      <header className="operations-header">
        <p className="product-kicker">Garden Manager</p>
        <h1>Garden operations</h1>
      </header>
      <section
        className="garden-onboarding"
        aria-labelledby="create-garden-heading"
      >
        <div>
          <p className="section-eyebrow">Seasonal workspace</p>
          <h2 id="create-garden-heading">Create your garden</h2>
        </div>
        <form className="garden-form" onSubmit={onCreate}>
          <label htmlFor="garden-name">Garden name</label>
          <div className="inline-form-row">
            <input
              autoFocus
              id="garden-name"
              onChange={(event) => onChangeName(event.target.value)}
              placeholder="e.g. Home garden"
              required
              value={newGardenName}
            />
            <button className="primary-button" type="submit">
              Create garden
            </button>
          </div>
        </form>
        <button className="text-button" onClick={onLoadDemo} type="button">
          Load demo garden
        </button>
        <Status message={message} />
      </section>
    </main>
  );
}

function GardenSetupStart({
  name,
  message,
  onChangeName,
  onCreate,
  onCancel,
}: {
  name: string;
  message: string;
  onChangeName: (name: string) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  return (
    <section className="operations-content garden-onboarding" aria-labelledby="garden-setup-heading">
      <div>
        <p className="section-eyebrow">Garden setup</p>
        <h2 id="garden-setup-heading">Start a new garden</h2>
        <p>Name the garden, then add its plan, planting areas, and plants.</p>
      </div>
      <form className="garden-form" onSubmit={onCreate}>
        <label htmlFor="new-garden">Garden name</label>
        <div className="inline-form-row">
          <input
            autoFocus
            id="new-garden"
            onChange={(event) => onChangeName(event.target.value)}
            placeholder="e.g. Home garden"
            required
            value={name}
          />
          <button className="primary-button" type="submit">Continue setup</button>
          <button className="secondary-button" onClick={onCancel} type="button">Cancel</button>
        </div>
      </form>
      <Status message={message} />
    </section>
  );
}

function Home({
  gardens,
  onOpenDemoGarden,
  onAddGarden,
  onCare,
  onAiGardenNote,
  onPlantHealth,
  onPlantKnowledge,
  onPlanSeason,
  onManage,
  message,
}: {
  gardens: Garden[];
  onOpenDemoGarden: () => void;
  onAddGarden: () => void;
  onCare: () => void;
  onAiGardenNote: () => void;
  onPlantHealth: () => void;
  onPlantKnowledge: () => void;
  onPlanSeason: () => void;
  onManage: (gardenId?: string) => void;
  message: string;
}) {
  const hasPersonalGardens = gardens.some(
    (candidate) => candidate.id !== "demo-garden",
  );
  const visibleGardens = hasPersonalGardens
    ? gardens.filter((candidate) => candidate.id !== "demo-garden")
    : gardens;

  return (
    <section className="operations-content garden-dashboard">
      <div className="dashboard-heading">
        <div>
          <p className="section-eyebrow">Garden dashboard</p>
          <h2>Choose a garden</h2>
        </div>
        <div className="dashboard-actions">
          {hasPersonalGardens ? (
            <button className="demo-garden-button" onClick={onOpenDemoGarden} type="button">
              Demo garden
            </button>
          ) : null}
          <button className="primary-button" onClick={onAddGarden} type="button">Add garden</button>
        </div>
      </div>
      <div className="garden-card-grid">
        {visibleGardens.map((candidate) => {
          return (
            <button
              aria-label={`Open ${candidate.name}`}
              className="garden-thumbnail-card"
              key={candidate.id}
              onClick={() => onManage(candidate.id)}
              type="button"
            >
              <GardenPlanOverview
                compact
                growingAreas={candidate.growingAreas}
                plan={candidate.plan}
              />
              <span className="garden-card-details">
                <strong>{candidate.name}</strong>
                <span>
                  {candidate.growingAreas.length} planting{" "}
                  {candidate.growingAreas.length === 1 ? "area" : "areas"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <section aria-labelledby="daily-garden-work-heading" className="dashboard-module-group">
        <p className="section-eyebrow" id="daily-garden-work-heading">Daily garden work</p>
        <div className="dashboard-module-actions dashboard-daily-actions">
          <button className="module-action module-action-care" onClick={onCare} type="button">
            <span>Care records</span><span aria-hidden="true">→</span>
          </button>
          <button className="module-action module-action-note" onClick={onAiGardenNote} type="button">
            <span>AI garden note</span><span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
      <section aria-labelledby="garden-tools-heading" className="dashboard-module-group">
        <p className="section-eyebrow" id="garden-tools-heading">Garden tools</p>
        <div className="dashboard-module-actions">
          <button className="module-action module-action-health" onClick={onPlantHealth} type="button">
            <span>Plant doctor</span><span aria-hidden="true">→</span>
          </button>
          <button className="module-action module-action-knowledge" onClick={onPlantKnowledge} type="button">
            <span>Plant guide</span><span aria-hidden="true">→</span>
          </button>
          <button className="module-action module-action-season" onClick={onPlanSeason} type="button">
            <span>Next season plan</span><span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
      <Status message={message} />
    </section>
  );
}

function CareHub({
  gardens,
  onOpenCare,
  workspace,
}: {
  gardens: Garden[];
  onOpenCare: (gardenId: string) => void;
  workspace: GardenWorkspace;
}) {
  return (
    <section className="operations-content season-planner" aria-labelledby="care-hub-heading">
      <div className="section-header">
        <div>
          <p className="section-eyebrow">Garden operations</p>
          <h2 id="care-hub-heading">Care</h2>
          <p className="section-context">Manage care for all gardens or one location.</p>
        </div>
      </div>
      <div className="season-planner-grid">
        <article className="season-area-card">
          <div>
            <p className="section-eyebrow">All locations</p>
            <h3>All gardens</h3>
          </div>
          <p className="season-history">
            <strong>{workspace.careTasks.length} open {workspace.careTasks.length === 1 ? "task" : "tasks"}</strong>
            <span>{workspace.careEvents.length} completed care {workspace.careEvents.length === 1 ? "record" : "records"}</span>
          </p>
          <button className="secondary-button" onClick={() => onOpenCare("all-gardens")} type="button">
            Open care
          </button>
        </article>
        {gardens.map((candidate) => {
          const openTasks = candidate.careTasks.length;
          const recentEvents = candidate.careEvents.length;
          return (
            <article className="season-area-card" key={candidate.id}>
              <div>
                <p className="section-eyebrow">Garden</p>
                <h3>{candidate.name}</h3>
              </div>
              <p className="season-history">
                <strong>{openTasks} open {openTasks === 1 ? "task" : "tasks"}</strong>
                <span>{recentEvents} completed care {recentEvents === 1 ? "record" : "records"}</span>
              </p>
              <button className="secondary-button" onClick={() => onOpenCare(candidate.id)} type="button">
                Open care
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function SaveConflictNotice({
  onReload,
  onKeepLocal,
}: {
  onReload: () => void;
  onKeepLocal: () => void;
}) {
  return (
    <div className="save-conflict-notice" role="alert">
      <p>
        This garden was changed in another tab after this page loaded. Your latest edits here are
        not saved yet.
      </p>
      <div className="save-conflict-actions">
        <button className="secondary-button" onClick={onReload} type="button">
          Reload latest
        </button>
        <button className="primary-button" onClick={onKeepLocal} type="button">
          Keep my changes
        </button>
      </div>
    </div>
  );
}

function ServerWorkspaceUnavailable({ message }: { message: string }) {
  return (
    <main className="operations-shell">
      <section className="garden-onboarding" aria-labelledby="server-workspace-heading">
        <p className="section-eyebrow">Workspace storage</p>
        <h1 id="server-workspace-heading">PostgreSQL workspace unavailable</h1>
        <p>Start the local API and database, then reload this page.</p>
        <button className="secondary-button" onClick={() => window.location.reload()} type="button">Try again</button>
        <Status message={message} />
      </section>
    </main>
  );
}

function GardenManagement({
  onDeleteGarden,
  isSetup,
  onFinishSetup,
  storageSource,
}: {
  onDeleteGarden: () => void;
  isSetup: boolean;
  onFinishSetup: () => void;
  storageSource: "browser" | "server";
}) {
  if (!isSetup) {
    return (
      <section aria-label="Garden actions" className="garden-management-actions">
        {storageSource === "browser" ? (
          <div className="data-settings">
            <p>Saved in this browser. This syncs to PostgreSQL automatically once the local API and PostgreSQL service are reachable.</p>
          </div>
        ) : null}
        <button className="remove-button" onClick={onDeleteGarden} type="button">
          Delete garden
        </button>
      </section>
    );
  }

  return (
    <section
      className="management-section"
      aria-labelledby="garden-management-heading"
    >
      <div className="section-header">
        <div>
          <p className="section-eyebrow">Garden workspace</p>
          <h2 id="garden-management-heading">Garden setup</h2>
        </div>
        {isSetup ? <button className="primary-button" onClick={onFinishSetup} type="button">Finish setup</button> : null}
      </div>
      <div className="garden-management-actions">
        <button className="remove-button" onClick={onDeleteGarden} type="button">
          Delete garden
        </button>
      </div>
      {storageSource === "browser" ? (
        <div className="data-settings">
          <p>Saved in this browser. This syncs to PostgreSQL automatically once the local API and PostgreSQL service are reachable.</p>
        </div>
      ) : null}
    </section>
  );
}

function PlantingAreaCreation({
  areaKind,
  areaLength,
  areaName,
  areaRotationDegrees,
  areaWidth,
  isAreaFormOpen,
  onSave,
  onSetAreaKind,
  onSetAreaLength,
  onSetAreaName,
  onSetAreaRotationDegrees,
  onSetAreaWidth,
  onSetFormOpen,
}: {
  areaKind: GrowingAreaKind;
  areaLength: string;
  areaName: string;
  areaRotationDegrees: string;
  areaWidth: string;
  isAreaFormOpen: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSetAreaKind: (kind: GrowingAreaKind) => void;
  onSetAreaLength: (length: string) => void;
  onSetAreaName: (name: string) => void;
  onSetAreaRotationDegrees: (rotationDegrees: string) => void;
  onSetAreaWidth: (width: string) => void;
  onSetFormOpen: (open: boolean) => void;
}) {
  if (!isAreaFormOpen) return null;

  return (
    <aside className="planting-area-creation-panel" aria-labelledby="add-planting-area-heading">
      <div className="planting-area-creation-header">
        <div>
          <p className="section-eyebrow">Garden Plan</p>
          <h2 id="add-planting-area-heading">Add planting area</h2>
        </div>
      </div>
      <p className="planting-area-creation-intro">
        Define the bed, then place it directly on the plan.
      </p>
      <form className="planting-area-creation-form" onSubmit={onSave}>
        <div className="field">
          <label htmlFor="planting-area-name">Planting-area name</label>
          <input
            autoFocus
            id="planting-area-name"
            onChange={(event) => onSetAreaName(event.target.value)}
            required
            value={areaName}
          />
        </div>
        <div className="field">
          <label htmlFor="planting-area-kind">Planting-area type</label>
          <select
            id="planting-area-kind"
            onChange={(event) =>
              onSetAreaKind(event.target.value as GrowingAreaKind)
            }
            value={areaKind}
          >
            {growingAreaKinds.map((kind) => (
              <option key={kind} value={kind}>
                {growingAreaKindLabels[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="planting-area-creation-measurements">
          <div className="field">
            <label htmlFor="planting-area-length">Length (m)</label>
            <input
              id="planting-area-length"
              min="0.1"
              onChange={(event) => onSetAreaLength(event.target.value)}
              required
              step="0.1"
              type="number"
              value={areaLength}
            />
          </div>
          <div className="field">
            <label htmlFor="planting-area-width">Width (m)</label>
            <input
              id="planting-area-width"
              min="0.1"
              onChange={(event) => onSetAreaWidth(event.target.value)}
              required
              step="0.1"
              type="number"
              value={areaWidth}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="planting-area-rotation">Rotation (degrees)</label>
          <input
            id="planting-area-rotation"
            onChange={(event) => onSetAreaRotationDegrees(event.target.value)}
            step="1"
            type="number"
            value={areaRotationDegrees}
          />
        </div>
        <div className="form-actions">
          <button className="primary-button" type="submit">
            Add area
          </button>
          <button
            className="secondary-button"
            onClick={() => {
              onSetFormOpen(false);
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    </aside>
  );
}

function PlantingAreaInspector({
  area,
  children,
  onClose,
  onDelete,
  onSave,
}: {
  area: GrowingArea;
  children: ReactNode;
  onClose: () => void;
  onDelete: () => void;
  onSave: (
    areaId: string,
    name: string,
    kind: GrowingAreaKind,
    rotationDegrees: number,
    layout: GrowingAreaLayout,
  ) => void;
}) {
  const [name, setName] = useState(area.name);
  const [kind, setKind] = useState<GrowingAreaKind>(area.kind);
  const [length, setLength] = useState(String(area.layout?.widthMeters ?? ""));
  const [width, setWidth] = useState(String(area.layout?.depthMeters ?? ""));
  const [rotationDegrees, setRotationDegrees] = useState(
    String(area.planPlacement.rotationDegrees),
  );

  useEffect(() => {
    setName(area.name);
    setKind(area.kind);
    setLength(String(area.layout?.widthMeters ?? ""));
    setWidth(String(area.layout?.depthMeters ?? ""));
    setRotationDegrees(String(area.planPlacement.rotationDegrees));
  }, [area]);

  const hasChanges =
    name !== area.name ||
    kind !== area.kind ||
    Number(length) !== area.layout?.widthMeters ||
    Number(width) !== area.layout?.depthMeters ||
    Number(rotationDegrees) !== area.planPlacement.rotationDegrees;

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const lengthMeters = Number(length);
    const widthMeters = Number(width);
    const nextRotationDegrees = Number(rotationDegrees);
    if (!trimmedName || !validateLayoutDimensions(lengthMeters, widthMeters)) return;
    if (!Number.isFinite(nextRotationDegrees)) return;

    const nextLayout = createRectangularLayout(
      snapToGrid(lengthMeters),
      snapToGrid(widthMeters),
    );
    onSave(
      area.id,
      trimmedName,
      kind,
      nextRotationDegrees,
      {
        ...nextLayout,
        allocations: (area.layout?.allocations ?? []).map((allocation) => ({
          ...allocation,
          ...clampAllocationCenter(allocation, nextLayout),
        })),
      },
    );
  };

  return (
    <aside className="planting-area-creation-panel planting-area-inspector" aria-labelledby="edit-planting-area-heading">
      <div className="planting-area-creation-header">
        <div>
          <p className="section-eyebrow">Garden Plan</p>
          <h2 id="edit-planting-area-heading">Edit planting area</h2>
        </div>
      </div>
      <p className="planting-area-creation-intro">
        Update this bed while its position remains visible on the plan.
      </p>
      <form className="planting-area-creation-form" onSubmit={save}>
        <div className="field">
          <label htmlFor="editing-planting-area-name">Planting-area name</label>
          <input
            id="editing-planting-area-name"
            onChange={(event) => setName(event.target.value)}
            required
            value={name}
          />
        </div>
        <div className="field">
          <label htmlFor="editing-planting-area-kind">Planting-area type</label>
          <select
            id="editing-planting-area-kind"
            onChange={(event) => setKind(event.target.value as GrowingAreaKind)}
            value={kind}
          >
            {growingAreaKinds.map((candidate) => (
              <option key={candidate} value={candidate}>
                {growingAreaKindLabels[candidate]}
              </option>
            ))}
          </select>
        </div>
        <div className="planting-area-creation-measurements">
          <div className="field">
            <label htmlFor="layout-length">Length (m)</label>
            <input
              id="layout-length"
              min="0.1"
              onChange={(event) => setLength(event.target.value)}
              required
              step="0.1"
              type="number"
              value={length}
            />
          </div>
          <div className="field">
            <label htmlFor="layout-width">Width (m)</label>
            <input
              id="layout-width"
              min="0.1"
              onChange={(event) => setWidth(event.target.value)}
              required
              step="0.1"
              type="number"
              value={width}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="editing-planting-area-rotation">Rotation (degrees)</label>
          <input
            id="editing-planting-area-rotation"
            onChange={(event) => setRotationDegrees(event.target.value)}
            step="1"
            type="number"
            value={rotationDegrees}
          />
        </div>
        <div className="form-actions">
          {hasChanges ? <button className="save-button" type="submit">Save</button> : null}
          <button className="secondary-button" onClick={onClose} type="button">Close</button>
          <button className="remove-button" onClick={onDelete} type="button">Delete area</button>
        </div>
      </form>
      {children}
    </aside>
  );
}

function Status({ message }: { message: string }) {
  return (
    <p aria-live="polite" className="workspace-message" role="status">
      {message}
    </p>
  );
}
