"use client";

import { FeedbackForm, FormField } from "@/components/forms/FormFeedback";
import { Button, ButtonLink } from "@/components/ui/Button";

import { FormEvent, useEffect, useRef, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SERVER_WORKSPACE_STORAGE_KEY } from "@/hooks/useWorkspaceSync";
import { useWorkspace, useWorkspaceDraft, useUnsavedDraft } from "@/components/workspace/WorkspaceProvider";
import { WorkspaceHome, WorkspaceHomeLoading } from "@/components/workspace/WorkspaceHome";
import { ServerWorkspaceUnavailable } from "@/components/workspace/ServerWorkspaceUnavailable";
import homeStyles from "@/components/workspace/WorkspaceHome.module.css";
import { gardenPath, areaPath, areaEditPath, careView, type WorkspaceRoute } from "@/lib/workspaceRoutes";

import { PlantingAreaInspector } from "@/components/PlantingAreaInspector";
import { areaKindDefaults, defaultAreaName, findFreeAreaSpot, resizeLayout, type AreaSpot } from "@/lib/areaPlacement";
import { applyAreaProperties, areaPropertyErrors, areaDraftKey, createAllocationId, emptyPlantEditorDraft, newPlantFromDraft, openPlantDraft, plantDraftIsDirty, sameAreaProperties, type PlantEditorDraft } from "@/lib/areaEditorDrafts";
import { CareWorkspace, type CareRecords } from "@/components/CareWorkspace";
import { areaDeletionMessage, gardenDeletionMessage } from "@/lib/deletionImpact";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { GardenAreaList, GardenPlanOverview, type CanvasPlanting } from "@/components/GardenPlanOverview";
import { GrowingAreaLayoutEditor } from "@/components/GrowingAreaLayoutEditor";
import { SeasonPlanner } from "@/components/SeasonPlanner";
import { WorkspaceGardenNote } from "@/components/notes/WorkspaceGardenNote";
import { PlantHealth } from "@/components/PlantHealth";
import { PlantKnowledge } from "@/components/PlantKnowledge";
import {
  clampPlanPosition,
  createRectangularLayout,
  createDemoGardenWorkspace,
  createGarden,
  createGardenWorkspace,
  createId,
  defaultPlantColor,
  growingAreaKindLabels,
  linkCurrentLayoutPlants,
  type Garden,
  type HealthRecord,
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
import {
  appendAllocationToGarden,
  isAllocationDraftStale,
  nextSeasonYear,
  type AllocationInput,
  type SeasonAllocationResult,
} from "@/lib/seasonAllocation";
import type { AllocationConfirmOutcome } from "@/components/AllocationAssistant";

import { EditorWorkbench } from "./editor/EditorWorkbench";
import { updateCareOwner, type CareOwner } from "@/lib/careViews";
import editorStyles from "./editor/Editor.module.css";

export { SERVER_WORKSPACE_STORAGE_KEY };

export function GardenWorkspace({ route }: { route: WorkspaceRoute }) {
  const router = useRouter();
  const search = useSearchParams();
  const {
    workspace, setWorkspace, message, setMessage, isSynced, isLoaded, storageSource,
    serverWorkspaceId, serverLoadFailed, clearBrowserWorkspace,
    areaDrafts, plantDrafts, setPlantDrafts, setAreaDraft, discardDrafts,
  } = useWorkspace();
  const [setupGardenId, setSetupGardenId] = useWorkspaceDraft<string | undefined>("setup:garden", undefined);
  const page = {
    name: ({ home: "home", new: "gardenSetup", plan: "management", care: "careLog", season: "seasonPlanner", notes: "aiGardenNote", guide: "plantKnowledge", doctor: "plantHealth" } as const)[route.module],
    isSetup: route.gardenId === setupGardenId,
    view: careView(search.get("view")),
  };
  const careGardenId = route.module === "care" ? route.gardenId ?? "all-gardens" : undefined;
  const navigate = (href: string, replace = false) => {
    if (typeof window !== "undefined" && `${window.location.pathname}${window.location.search}` === href) return;
    if (replace) router.replace(href); else router.push(href);
  };
  // ?area= zooms the plan into that area at every width; &edit=area opens its
  // properties editor where the editor does not sit beside the plan.
  const editingLayoutId = route.module === "plan" ? search.get("area") ?? undefined : undefined;
  const editingAreaProperties = route.module === "plan" && search.get("edit") === "area";
  const setEditingLayoutId = (id?: string) => {
    if (route.gardenId) navigate(id ? areaPath(route.gardenId, id) : gardenPath(route.gardenId));
  };
  useEffect(() => {
    if (route.module !== "care" || !search.has("view") || ["tasks", "history"].includes(search.get("view") ?? "")) return;
    const query = new URLSearchParams(search.toString()); query.set("view", "tasks");
    router.replace(`${route.gardenId ? gardenPath(route.gardenId, "care") : "/care"}?${query}`);
  }, [route.module, route.gardenId, router, search]);
  const [newGardenName, setNewGardenName] = useWorkspaceDraft("setup:name", "");
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    message: string;
    confirmLabel: string;
    cancelLabel?: string;
    fallbackFocusId?: string;
    tone?: "default" | "danger";
    onConfirm: () => void;
  }>();
  const gardenPlanHeadingRef = useRef<HTMLHeadingElement>(null);
  // The newest rendered workspace, so a confirm click checks the draft
  // against current data rather than the data the draft was shown with.
  const latestWorkspaceRef = useRef(workspace);
  latestWorkspaceRef.current = workspace;

  const garden = workspace?.gardens.find(
    (candidate) => candidate.id === route.gardenId,
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

  const updateGarden = (update: (current: Garden) => Garden) => {
    setWorkspace((current) =>
      current
        ? {
            ...current,
            gardens: current.gardens.map((candidate) =>
              candidate.id === garden?.id
                ? update(candidate)
                : candidate,
            ),
          }
        : current,
    );
  };

  useUnsavedDraft("setup:name", Boolean(newGardenName));
  const openManagement = (gardenId?: string) => { if (gardenId) navigate(gardenPath(gardenId)); };
  const returnToDashboard = () => { setSetupGardenId(undefined); navigate("/"); };

  const createFirstGarden = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newGardenName.trim();
    if (!name) return setMessage("Enter a garden name to continue.");
    const created = createGardenWorkspace(name);
    setWorkspace(created);
    setSetupGardenId(created.selectedGardenId);
    navigate(gardenPath(created.selectedGardenId));
    setNewGardenName("");

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
    setSetupGardenId(newGarden.id);
    navigate(gardenPath(newGarden.id));
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
    navigate(gardenPath(createdDemoGarden.id));
    setMessage("Demo garden opened.");
  };

  const deleteGarden = () => {
    if (!workspace || !garden) return;
    setPendingConfirmation({
      message: storageSource === "server" && workspace.gardens.length === 1
        ? `“${garden.name}” is your last synced garden. Add another garden before deleting it.`
        : gardenDeletionMessage(workspace, garden),
      confirmLabel: "Delete garden",
      tone: "danger",
      onConfirm: () => {
        const latest = latestWorkspaceRef.current;
        const target = latest?.gardens.find((item) => item.id === garden.id);
        if (!latest || !target) throw new Error("This garden no longer exists. Cancel to return to your workspace.");
        if (JSON.stringify(target) !== JSON.stringify(garden) || latest.gardens.length !== workspace.gardens.length)
          throw new Error("This garden changed while the confirmation was open. Cancel and review the deletion again.");
        const next = removeGarden(latest, garden.id);
        if (!next) {
          if (storageSource === "server") throw new Error("Add another garden before deleting the last synced garden.");
          if (JSON.stringify(latest) !== JSON.stringify(workspace)) throw new Error("Your workspace changed. Cancel and review the deletion again.");
          if (!clearBrowserWorkspace()) throw new Error("The workspace could not be removed from this device. Keep this page open and try again.");
          garden.growingAreas.forEach((area) => discardDrafts(areaDraftKey(garden.id, area.id)));
          navigate("/");
          setMessage("Create a garden when you are ready.");
          return;
        }
        setWorkspace(next);
        navigate("/");
        garden.growingAreas.forEach((area) => discardDrafts(areaDraftKey(garden.id, area.id)));
        setMessage(`${garden.name} deleted.`);
      },
    });
  };

  const confirmDiscard = (dirty: boolean, onConfirm: () => void) => {
    if (!dirty) { onConfirm(); return; }
    setPendingConfirmation({ message: "Your changes have not been submitted. Discard them or keep editing.", confirmLabel: "Discard changes", cancelLabel: "Keep editing", onConfirm });
  };
  const loadDemo = () => {
    const applyDemo = () => {
      const demo = createDemoGardenWorkspace();
      setWorkspace(demo);
        setMessage("Demo garden loaded.");
    };
    if (workspace) {
      setPendingConfirmation({
        message: "Load the demo garden? This replaces your current workspace, including its gardens and records.",
        confirmLabel: "Replace with demo garden",
        onConfirm: applyDemo,
      });
      return;
    }
    applyDemo();
  };

  const openAreaInspector = (areaId: string) => setEditingLayoutId(areaId);
  // "Whole garden" and Escape close the open area the same way its Close button does.
  const closeAreaInspector = () => {
    if (!garden || !editingArea) return;
    const key = areaDraftKey(garden.id, editingArea.id);
    const draft = areaDrafts[key];
    const dirty = Boolean(draft && !sameAreaProperties(draft.values, draft.baseline)) || plantDraftIsDirty(plantDrafts[key]);
    confirmDiscard(dirty, () => {
      if (dirty) discardDrafts(key);
      setEditingLayoutId(undefined);
    });
  };

  /**
   * One click adds an area of the type's standard size at the first free spot
   * and zooms the plan into it (ADR-0072, phase G4).
   */
  const addArea = (kind: GrowingAreaKind) => {
    const latest = latestWorkspaceRef.current?.gardens.find((item) => item.id === garden?.id);
    if (!latest) return;
    const spot = findFreeAreaSpot(latest.plan, latest.growingAreas, areaKindDefaults[kind]);
    const area: GrowingArea = {
      id: createId("area"),
      name: defaultAreaName(growingAreaKindLabels[kind], latest.growingAreas),
      kind,
      layout: createRectangularLayout(spot.widthMeters, spot.depthMeters),
      planPlacement: { x: spot.x, y: spot.y, rotationDegrees: 0 },
    };
    updateGarden((current) => ({ ...current, growingAreas: [...current.growingAreas, area] }));
    setEditingLayoutId(area.id);
    setMessage(`${area.name} added at ${spot.x.toFixed(1)}, ${spot.y.toFixed(1)} m${placementNote(spot)}. Drag it to move it, or drag its corner to resize it.`);
  };

  /** An area saved without a size gets its type's standard size in a free spot, only when the user asks. */
  const placeUnsizedArea = (areaId: string) => {
    const latest = latestWorkspaceRef.current?.gardens.find((item) => item.id === garden?.id);
    const area = latest?.growingAreas.find((item) => item.id === areaId);
    if (!latest || !area || area.layout) return;
    const spot = findFreeAreaSpot(latest.plan, latest.growingAreas, areaKindDefaults[area.kind]);
    updateGarden((current) => ({
      ...current,
      growingAreas: current.growingAreas.map((item) => item.id === areaId && !item.layout
        ? { ...item, layout: createRectangularLayout(spot.widthMeters, spot.depthMeters), planPlacement: { x: spot.x, y: spot.y, rotationDegrees: 0 } }
        : item),
    }));
    setEditingLayoutId(areaId);
    setMessage(`${area.name} placed at ${spot.x.toFixed(1)}, ${spot.y.toFixed(1)} m as ${spot.widthMeters} × ${spot.depthMeters} m${placementNote(spot)}. Drag its corner to change the size.`);
  };

  const resizeArea = (areaId: string, size: { widthMeters: number; depthMeters: number }) => {
    updateGarden((current) =>
      linkCurrentLayoutPlants({
        ...current,
        growingAreas: current.growingAreas.map((area) =>
          area.id === areaId && area.layout ? { ...area, layout: resizeLayout(area.layout, size) } : area,
        ),
      }),
    );
  };

  const saveAreaEditor = (
    areaId: string,
    name: string,
    kind: GrowingAreaKind,
    rotationDegrees: number,
    layout: GrowingAreaLayout,
    position?: { x: number; y: number },
  ) => {
    const latestGarden = latestWorkspaceRef.current?.gardens.find((item) => item.id === garden?.id);
    const currentArea = latestGarden?.growingAreas.find((item) => item.id === areaId);
    const point = position ?? currentArea?.planPlacement ?? { x: 0, y: 0 };
    const trimmedName = name.trim();
    const values = { name: trimmedName, kind, width: String(layout.widthMeters), length: String(layout.depthMeters), rotation: String(rotationDegrees), x: String(point.x), y: String(point.y) };
    const error = Object.values(areaPropertyErrors(values, latestGarden?.plan))[0];
    if (error) { setMessage(error); return false; }
    if (!latestWorkspaceRef.current?.gardens.find((item) => item.id === garden?.id)?.growingAreas.some((item) => item.id === areaId)) {
      setMessage("This planting area no longer exists. Your draft has been kept.");
      return false;
    }
    updateGarden((current) =>
      linkCurrentLayoutPlants({
        ...current,
        growingAreas: current.growingAreas.map((area) =>
          area.id === areaId
            ? applyAreaProperties(area, values, current.plan)
            : area,
        ),
      }),
    );
    setMessage(`${trimmedName} updated.`);
    return true;
  };

  const deleteArea = (area: GrowingArea) => {
    if (!garden) return;
    setPendingConfirmation({
      message: areaDeletionMessage(garden, area),
      confirmLabel: "Delete planting area",
      fallbackFocusId: "garden-plan-heading",
      tone: "danger",
      onConfirm: () => {
        const current = latestWorkspaceRef.current?.gardens.find((item) => item.id === garden.id);
        if (!current?.growingAreas.some((item) => item.id === area.id)) throw new Error("This planting area no longer exists. Cancel to return to your garden.");
        if (JSON.stringify(current) !== JSON.stringify(garden)) throw new Error("This garden changed while the confirmation was open. Cancel and review the deletion again.");
        updateGarden((latest) => removeGrowingArea(latest, area.id));
        discardDrafts(areaDraftKey(garden.id, area.id));
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
        area.id === areaId ? { ...area, planPlacement: { ...area.planPlacement, ...clampPlanPosition(planPlacement, current.plan) } } : area,
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

  // Canvas edits read the area's latest layout, so quick successive clicks never drop a plant.
  const updateAreaLayoutWith = (areaId: string, update: (layout: GrowingAreaLayout) => GrowingAreaLayout) => {
    updateGarden((current) =>
      linkCurrentLayoutPlants({
        ...current,
        growingAreas: current.growingAreas.map((area) =>
          area.id === areaId && area.layout ? { ...area, layout: update(area.layout) } : area,
        ),
      }),
    );
  };
  const updatePlantDraft = (key: string, update: (draft: PlantEditorDraft) => PlantEditorDraft) => setPlantDrafts((current) => {
    const nextDraft = update(current[key] ?? emptyPlantEditorDraft());
    const next = { ...current };
    if (!nextDraft.selectedId && !nextDraft.isAddFormOpen && !nextDraft.isEditOpen && !plantDraftIsDirty(nextDraft)) delete next[key];
    else next[key] = nextDraft;
    return next;
  });
  const plantDraftKey = garden && editingArea ? areaDraftKey(garden.id, editingArea.id) : undefined;
  const plantDraft = plantDraftKey ? plantDrafts[plantDraftKey] ?? emptyPlantEditorDraft() : undefined;
  const placingPlant = newPlantFromDraft(plantDraft);
  // The zoomed area's plants are edited directly on the Garden Plan canvas (ADR-0072, phase G3).
  const canvasPlanting: CanvasPlanting | undefined = editingArea?.layout && plantDraftKey && plantDraft ? {
    areaId: editingArea.id,
    selectedPlantId: plantDraft.selectedId,
    placing: placingPlant && {
      label: placingPlant.label,
      diameterMeters: placingPlant.diameterMeters,
      color: placingPlant.color ?? defaultPlantColor(placingPlant.plantType ?? placingPlant.label, placingPlant.variety),
    },
    onSelectPlant: (plantId) => {
      const plant = editingArea.layout?.allocations.find((allocation) => allocation.id === plantId);
      if (!plant) return;
      if (plantDraft.selectedId === plantId && plantDraft.editingAllocation) {
        updatePlantDraft(plantDraftKey, (draft) => ({ ...draft, isEditOpen: true }));
        return;
      }
      confirmDiscard(plantDraftIsDirty(plantDraft), () => updatePlantDraft(plantDraftKey, () => openPlantDraft(plant)));
    },
    onMovePlant: (plantId, point) => {
      updateAreaLayoutWith(editingArea.id, (layout) => ({
        ...layout,
        allocations: layout.allocations.map((allocation) => allocation.id === plantId ? { ...allocation, ...point } : allocation),
      }));
      if (!plantDraft.editingAllocation) updatePlantDraft(plantDraftKey, (draft) => ({ ...draft, selectedId: plantId }));
    },
    onPlacePlant: (point) => {
      if (!placingPlant) return;
      updateAreaLayoutWith(editingArea.id, (layout) => ({
        ...layout,
        allocations: [...layout.allocations, { ...placingPlant, id: createAllocationId(), ...point }],
      }));
    },
    onStopPlacing: () => updatePlantDraft(plantDraftKey, () => emptyPlantEditorDraft()),
  } : undefined;

  const archivePlantingRecord = (plantingRecordId: string) => {
    updateGarden((current) => archivePlanting(current, plantingRecordId));
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
  const updateCareRecords = (update: (records: CareRecords) => CareRecords, owner?: CareOwner) => {
    const target: CareOwner = owner ?? (careGardenId === "all-gardens" ? { ownerScope: "workspace" } : { ownerScope: "garden", gardenId: careGardenId! });
    setWorkspace((current) => current ? updateCareOwner(current, target, update) : current);
  };

  const saveHealthRecord = (gardenId: string, record: HealthRecord) => {
    setWorkspace((current) => current ? {
      ...current,
      selectedGardenId: gardenId,
      gardens: current.gardens.map((candidate) => candidate.id === gardenId
        ? { ...candidate, healthRecords: [...candidate.healthRecords, record] }
        : candidate),
    } : current);
    setMessage("Plant health record added.");
  };

  if (!isLoaded)
    return route.module === "home" ? <WorkspaceHomeLoading /> : (
      <p className="loading-state">Loading garden workspace...</p>
    );
  if (serverLoadFailed)
    return <ServerWorkspaceUnavailable />;
  if (route.gardenId && !garden) return <div className={homeStyles.home}>
    <section className={homeStyles.onboarding} aria-labelledby="garden-not-found-heading">
      <h2 id="garden-not-found-heading">Garden not found in this workspace</h2>
      <ButtonLink href="/">Return to overview</ButtonLink>
    </section>
  </div>;
  if (!workspace && ["home", "new", "plan", "care", "season"].includes(route.module)) {
    const onboarding = (
      <Onboarding
        newGardenName={newGardenName}
        message={message}
        onChangeName={setNewGardenName}
        onCreate={createFirstGarden}
        onLoadDemo={loadDemo}
      />
    );
    return route.module === "home" ? <WorkspaceHome onOpenDemoGarden={openDemoGarden} onboarding={onboarding} />
      : <div className={homeStyles.home}>{onboarding}</div>;
  }

  return (
    <>
      {Object.keys({ ...areaDrafts, ...plantDrafts }).filter((key) => {
        const [gardenId, areaId] = JSON.parse(key) as [string, string];
        return (areaDrafts[key] || plantDraftIsDirty(plantDrafts[key])) && !workspace?.gardens.find((item) => item.id === gardenId)?.growingAreas.some((item) => item.id === areaId);
      }).map((key) => <section key={key} role="alert">
        <p>A planting area with unsaved edits no longer exists. Copy the draft before discarding it.</p>
        <textarea aria-label="Unavailable planting-area draft" readOnly value={JSON.stringify({ properties: areaDrafts[key]?.values, plant: plantDrafts[key] }, null, 2)} />
        <button type="button" onClick={() => confirmDiscard(true, () => discardDrafts(key))}>Discard unavailable draft</button>
      </section>)}
      {page.name === "gardenSetup" ? (
          <GardenSetupStart
            name={newGardenName}
            message={message}
            onChangeName={setNewGardenName}
            onCreate={workspace ? addGarden : createFirstGarden}
            onCancel={() => confirmDiscard(Boolean(newGardenName), () => { setNewGardenName(""); returnToDashboard(); })}
          />
        ) : page.name === "seasonPlanner" ? (
          <SeasonPlanner
            gardenId={route.gardenId}
            notice={message}
            gardens={route.gardenId && garden ? [garden] : workspace?.gardens ?? []}
            isSynced={isSynced}
            onConfirmAllocation={confirmSeasonAllocation}
            onRemovePlan={removeSeasonPlanPlant}
            onSavePlan={saveSeasonPlanPlant}
            workspaceId={serverWorkspaceId}
          />
        ) : page.name === "aiGardenNote" ? (
          <WorkspaceGardenNote />
        ) : page.name === "plantHealth" ? (
          <PlantHealth
            key={search.get("garden") ?? ""}
            onGardenContextChange={(id) => navigate(`/doctor${id ? `?${new URLSearchParams({ garden: id })}` : ""}`)}
            gardens={workspace?.gardens ?? []}
            initialGardenId={search.get("garden") ?? ""}
            isServerBacked={storageSource === "server"}
            onSave={saveHealthRecord}
            workspaceId={serverWorkspaceId}
          />
        ) : page.name === "plantKnowledge" ? (
          <PlantKnowledge
            key={search.get("garden") ?? ""}
            onGardenContextChange={(id) => navigate(`/guide${id ? `?${new URLSearchParams({ garden: id })}` : ""}`)}
            gardens={workspace?.gardens ?? []}
            initialGardenId={search.get("garden") ?? ""}
            isServerBacked={storageSource === "server"}
            workspaceId={serverWorkspaceId}
          />
      ) : page.name === "home" ? (
          <WorkspaceHome onOpenDemoGarden={openDemoGarden} />
        ) : page.name === "careLog" && careGarden ? (
          <section className="operations-content">

            <CareWorkspace
              key={careGardenId}
              garden={careGarden}
              gardens={!route.gardenId ? workspace?.gardens : undefined}
              locationFilter={!route.gardenId ? search.get("location") ?? "all" : undefined}
              onLocationChange={(location) => navigate(`/care?${new URLSearchParams({ view: page.view, location })}`)}
              sharedRecords={route.gardenId && workspace ? { careEvents: workspace.careEvents, careTasks: workspace.careTasks } : undefined}
              initialView={page.view}
              viewHref={route.gardenId ? gardenPath(route.gardenId, "care") : "/care"}
              onMessage={setMessage}
              onUpdateRecords={updateCareRecords}
            />
            <Status message={message} />
            {!route.gardenId && workspace && <details><summary>Open a garden Care page</summary><CareHub gardens={workspace.gardens} workspace={workspace} /></details>}
          </section>
        ) : garden ? (
          <section className="operations-content management-content">
            <>
              {editingLayoutId && !editingArea && <p role="alert">Planting area not found in this garden. <Link href={gardenPath(garden.id)}>Back to plan</Link></p>}
              <EditorWorkbench>{(mode) => {
                // An unsaved properties draft keeps its editor open when the layout narrows.
                const areaPropertiesDraft = editingArea ? areaDrafts[areaDraftKey(garden.id, editingArea.id)] : undefined;
                const hasAreaPropertiesDraft = Boolean(areaPropertiesDraft && !sameAreaProperties(areaPropertiesDraft.values, areaPropertiesDraft.baseline));
                const showInspector = Boolean(editingArea) && (mode === "wide" || editingAreaProperties || hasAreaPropertiesDraft);
                const plantEditor = editingArea && plantDraftKey ? (
                  <GrowingAreaLayoutEditor
                    area={editingArea}
                    inInspector
                    draft={plantDraft}
                    onDraftChange={(update) => updatePlantDraft(plantDraftKey, update)}
                    onArchivePlantingRecord={archivePlantingRecord}
                    onChange={(layout) => updateAreaLayout(editingArea.id, layout)}
                    onSaveArea={(name, kind, rotationDegrees, layout) =>
                      saveAreaEditor(editingArea.id, name, kind, rotationDegrees, layout)
                    }
                    showAreaProperties={false}
                  />
                ) : null;
                return <>
                {/* Record a draft-opened editor in the URL so it stays open after Save. */}
                {mode !== "wide" && editingArea && hasAreaPropertiesDraft && !editingAreaProperties && (
                  <ReplaceRoute href={areaEditPath(garden.id, editingArea.id)} onReplace={(href) => navigate(href, true)} />
                )}
                <div className={editorStyles.plan} hidden={mode === "mobile" && showInspector}>
                <GardenPlanOverview
                  editable
                  gardenId={garden.id}
                  gardenName={garden.name}
                  growingAreas={garden.growingAreas}
                  headingRef={gardenPlanHeadingRef}
                  isAreaInspectorOpen={showInspector}
                  selectedAreaId={editingArea?.id}
                  areaListInSidebar={mode === "wide" && !editingArea}
                  areaPanel={mode !== "wide" && editingArea ? (
                    <section className={editorStyles.areaPanel} aria-labelledby="area-panel-heading">
                      <header>
                        <div>
                          <h3 id="area-panel-heading">{editingArea.name}</h3>
                          <p>{growingAreaKindLabels[editingArea.kind]}{editingArea.layout ? ` · ${editingArea.layout.widthMeters} × ${editingArea.layout.depthMeters} m` : ""}</p>
                        </div>
                        <Link id="edit-area-properties" className="secondary-button" href={areaEditPath(garden.id, editingArea.id)}>Edit area</Link>
                      </header>
                      {plantEditor}
                    </section>
                  ) : undefined}
                  planting={canvasPlanting}
                  onAddArea={addArea}
                  onPlaceArea={placeUnsizedArea}
                  onResizeArea={resizeArea}
                  onEditLayout={openAreaInspector}
                  onExitArea={closeAreaInspector}
                  onGardenNameChange={(name) => updateGarden((current) => ({ ...current, name }))}
                  onPlacementChange={updateAreaPlacement}
                  onPlanChange={updatePlan}
                  plan={garden.plan}
                />
                </div>
                {mode === "wide" && !editingArea && <aside className={editorStyles.summary} aria-label="Garden area summary">
                  <GardenAreaList gardenId={garden.id} areas={garden.growingAreas} onPlaceArea={placeUnsizedArea} />
                </aside>}
                {editingArea && showInspector ? (
                  <PlantingAreaInspector
                    key={areaDraftKey(garden.id, editingArea.id)}
                    area={editingArea}
                    plan={garden.plan}
                    mode={mode}
                    gardenName={garden.name}
                    returnFocusId={mode === "wide" ? undefined : "edit-area-properties"}
                    draft={areaDrafts[areaDraftKey(garden.id, editingArea.id)]}
                    onDraftChange={(draft) => setAreaDraft(areaDraftKey(garden.id, editingArea.id), draft)}
                    hasPlantChanges={mode === "wide" && plantDraftIsDirty(plantDrafts[areaDraftKey(garden.id, editingArea.id)])}
                    onDiscardPlants={() => discardDrafts(areaDraftKey(garden.id, editingArea.id))}
                    onClose={() => mode === "wide" ? setEditingLayoutId(undefined) : navigate(areaPath(garden.id, editingArea.id))}
                    onDelete={() => deleteArea(editingArea)}
                    onSave={saveAreaEditor}
                  >
                    {mode === "wide" ? plantEditor : null}
                  </PlantingAreaInspector>
                ) : null}
              </>;
              }}</EditorWorkbench>
              <div hidden={Boolean(editingArea)}>
              <GardenManagement
                onDeleteGarden={deleteGarden}
                isSetup={page.name === "management" && page.isSetup}
                onFinishSetup={returnToDashboard}
                storageSource={storageSource}
              />
              </div>
            </>
            <Status message={message} />
          </section>
        ) : null}
      {pendingConfirmation ? (
        <ConfirmDialog
          message={pendingConfirmation.message}
          confirmLabel={pendingConfirmation.confirmLabel}
          cancelLabel={pendingConfirmation.cancelLabel}
          fallbackFocusId={pendingConfirmation.fallbackFocusId}
          tone={pendingConfirmation.tone}
          onCancel={() => setPendingConfirmation(undefined)}
          onConfirm={() => {
            pendingConfirmation.onConfirm();
            setPendingConfirmation(undefined);
          }}
        />
      ) : null}
    </>
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
      <section
        className={homeStyles.onboarding}
        aria-labelledby="create-garden-heading"
      >
        <div>
          <h2 id="create-garden-heading">Create your garden</h2>
        </div>
        <FeedbackForm className="garden-form" onSubmit={onCreate}>
          <label htmlFor="garden-name">Garden name</label>
          <FormField id="garden-name" className="inline-form-row">
            <input
              id="garden-name"
              onChange={(event) => onChangeName(event.target.value)}
              placeholder="e.g. Home garden"
              required
              value={newGardenName}
            />
            <button className="primary-button" type="submit">
              Create garden
            </button>
          </FormField>
        </FeedbackForm>
        <button className="text-button" onClick={onLoadDemo} type="button">
          Load demo garden
        </button>
        <Status message={message} />
      </section>
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
    <div className={homeStyles.home}>
      <section className={homeStyles.onboarding} aria-label="Garden setup">
        <FeedbackForm aria-label="Add garden" className={`garden-form ${homeStyles.setupForm}`} onSubmit={onCreate}>
          <FormField id="new-garden" label="Garden name" hint="You can set dimensions and add planting areas on the next screen.">
            <input
              autoFocus
              id="new-garden"
              onChange={(event) => onChangeName(event.target.value)}
              placeholder="e.g. Home garden"
              required
              value={name}
            />
          </FormField>
          <div className={homeStyles.onboardingActions}>
            <Button variant="primary" type="submit">Continue setup</Button>
            <Button onClick={onCancel}>Cancel</Button>
          </div>
        </FeedbackForm>
        <Status message={message} />
      </section>
    </div>
  );
}

function CareHub({
  gardens,
  workspace,
}: {
  gardens: Garden[];
  workspace: GardenWorkspace;
}) {
  return (
    <section className="operations-content season-planner" aria-labelledby="care-hub-heading">
      <div className="section-header">
        <div>
          <p className="section-eyebrow">Garden operations</p>
          <h2 id="care-hub-heading">Care locations</h2>
          <p className="section-context">Manage care for all gardens or one location.</p>
        </div>
      </div>
      <div className="season-planner-grid">
        <article className="season-area-card">
          <div>
            <p className="section-eyebrow">Workspace-wide records</p>
            <h3>All gardens</h3>
          </div>
          <p className="season-history">
            <strong>{workspace.careTasks.length} open {workspace.careTasks.length === 1 ? "task" : "tasks"}</strong>
            <span>{workspace.careEvents.length} completed care {workspace.careEvents.length === 1 ? "record" : "records"}</span>
          </p>
          <Link className="secondary-button" href="/care?view=tasks&location=all-gardens#care-workspace-heading">Open care</Link>
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
              <Link className="secondary-button" href={gardenPath(candidate.id, "care")}>Open care</Link>
            </article>
          );
        })}
      </div>
    </section>
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
      <details className={editorStyles.settings}>
        <summary>Garden settings</summary>
        <div className={editorStyles.danger}><h3>Delete this garden</h3>
        {storageSource === "browser" ? (
          <div className="data-settings">
            <p>You can work on this device. Check the saving status above before closing this page.</p>
          </div>
        ) : null}
        <button className="remove-button" onClick={onDeleteGarden} type="button">
          Delete garden
        </button>
        </div>
      </details>
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
      <details className={editorStyles.settings}><summary>Garden settings</summary>
      <div className={editorStyles.danger}><h3>Delete this garden</h3>
        <button className="remove-button" onClick={onDeleteGarden} type="button">
          Delete garden
        </button>
      </div></details>
      {storageSource === "browser" ? (
        <div className="data-settings">
          <p>You can work on this device. Check the saving status above before closing this page.</p>
        </div>
      ) : null}
    </section>
  );
}

/** Explains a new area that was shrunk to the garden or could not avoid other areas. */
function placementNote(spot: AreaSpot) {
  if (spot.resized) return ` (shrunk to ${spot.widthMeters} × ${spot.depthMeters} m to fit the garden)`;
  if (spot.overlaps) return " (the garden is full, so it overlaps another area)";
  return "";
}

function Status({ message }: { message: string }) {
  return (
    <p aria-live="polite" className="workspace-message" role="status">
      {message}
    </p>
  );
}

/** Replaces the current URL once after render; used to sync a route with state shown on screen. */
function ReplaceRoute({ href, onReplace }: { href: string; onReplace: (href: string) => void }) {
  const replace = useRef(onReplace);
  useEffect(() => { replace.current = onReplace; });
  useEffect(() => { replace.current(href); }, [href]);
  return null;
}
