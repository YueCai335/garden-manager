"use client";

import { FeedbackForm, FormField } from "@/components/forms/FormFeedback";
import { Button, ButtonLink } from "@/components/ui/Button";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePageActionsSlot } from "@/components/workspace/AppShell";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { SERVER_WORKSPACE_STORAGE_KEY } from "@/hooks/useWorkspaceSync";
import { useWorkspace, useWorkspaceDraft, useUnsavedDraft } from "@/components/workspace/WorkspaceProvider";
import { WorkspaceHome, WorkspaceHomeLoading } from "@/components/workspace/WorkspaceHome";
import { ServerWorkspaceUnavailable } from "@/components/workspace/ServerWorkspaceUnavailable";
import homeStyles from "@/components/workspace/WorkspaceHome.module.css";
import { gardenPath, areaPath, areaEditPath, planLevelPath, careHistoryPath, careHistoryType, careLocationPath, careView, seasonGardenPath, workspaceHomePath, type WorkspaceRoute } from "@/lib/workspaceRoutes";

import { PlantingAreaInspector } from "@/components/PlantingAreaInspector";
import { areaKindDefaults, defaultAreaName, findFreeAreaSpot, resizeLayout, type AreaSpot } from "@/lib/areaPlacement";
import { applyAreaProperties, areaPropertyErrors, areaDraftKey, createAllocationId, emptyPlantEditorDraft, newPlantFromDraft, openPlantDraft, plantDraftIsDirty, sameAreaProperties, type PlantEditorDraft } from "@/lib/areaEditorDrafts";
import { CareWorkspace, type CareRecords } from "@/components/CareWorkspace";
import { areaDeletionMessage, gardenDeletionMessage } from "@/lib/deletionImpact";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { GardenPlanOverview, type CanvasPlanting } from "@/components/GardenPlanOverview";
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
import { GardenDetailsFields } from "./editor/GardenDetailsFields";
import { PlanLevelBar, SetupProgress, SetupReady, SetupStepPanel } from "./editor/SetupProgress";
import { planLevelFromSearch, setupLevel, type PlanLevel } from "@/lib/planLevels";
import setupStyles from "./editor/Setup.module.css";
import { useGuidedSetup } from "@/hooks/useGuidedSetup";
import { advanceSetup, gardenSizePresets, goToStep, minimumGardenSize, setupSummary, startSetup, type SetupStep } from "@/lib/guidedSetup";
import { updateCareOwner, workspaceCareGarden, type CareOwner } from "@/lib/careViews";
import editorStyles from "./editor/Editor.module.css";

export { SERVER_WORKSPACE_STORAGE_KEY };

export function GardenWorkspace({ route }: { route: WorkspaceRoute }) {
  const router = useRouter();
  const search = useSearchParams();
  const {
    workspace, setWorkspace, message, setMessage, isSynced, isLoaded, storageSource,
    serverWorkspaceId, serverLoadFailed, clearBrowserWorkspace,
    areaDrafts, plantDrafts, setPlantDrafts, setAreaDraft, discardDrafts, planHistory, syncState,
  } = useWorkspace();
  const pageActionsSlot = usePageActionsSlot();
  // The guided first-run setup in progress, if any (ADR-0072, phase G6).
  const [setup, setSetup] = useGuidedSetup();
  const page = {
    name: ({ home: "home", new: "gardenSetup", plan: "management", care: "careLog", season: "seasonPlanner", notes: "aiGardenNote", guide: "plantKnowledge", doctor: "plantHealth" } as const)[route.module],
    view: careView(search.get("view")),
  };
  const navigate = (href: string, replace = false) => {
    if (typeof window !== "undefined" && `${window.location.pathname}${window.location.search}` === href) return;
    if (replace) router.replace(href); else router.push(href);
  };
  // ?area= zooms the plan into that area at every width; &edit=area opens its
  // properties editor where the editor does not sit beside the plan.
  const editingLayoutId = route.module === "plan" ? search.get("area") ?? undefined : undefined;
  const editingAreaProperties = route.module === "plan" && search.get("edit") === "area";
  // Selecting or closing an area keeps the level: open on Plants, selected on Planting areas (ADR-0075).
  const setEditingLayoutId = (id?: string) => {
    if (!route.gardenId) return;
    if (guide || !planLevel) { navigate(id ? areaPath(route.gardenId, id) : gardenPath(route.gardenId)); return; }
    navigate(planLevelPath(route.gardenId, planLevel === "areas" ? "areas" : "plants", id));
  };
  useEffect(() => {
    if (route.module !== "care" || !search.has("view") || ["tasks", "history"].includes(search.get("view") ?? "")) return;
    const query = new URLSearchParams(search.toString()); query.set("view", "tasks");
    router.replace(`/care?${query}`);
  }, [route.module, router, search]);
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
  // Care is one L1 module across every location; ?location= filters it (ADR-0073).
  const careGarden = route.module === "care" && workspace ? workspaceCareGarden(workspace) : undefined;
  const editingArea = garden?.growingAreas.find(
    (area) => area.id === editingLayoutId,
  );
  const guide = route.module === "plan" && garden && setup?.gardenId === garden.id ? setup : undefined;
  /**
   * The plan level (ADR-0075): the guided setup's step decides it while the
   * guide runs; otherwise ?level= does, defaulting to Garden, or to Plants
   * when the address opens an area (ADR-0078). Ready views the plan without a level.
   */
  const planLevel: PlanLevel | undefined = route.module !== "plan" || !garden ? undefined
    : guide ? setupLevel(guide.step)
    : planLevelFromSearch(search.get("level"), search.has("area"));
  const changePlanLevel = (next: PlanLevel) => {
    if (!garden) return;
    // The open or selected area carries over to the other area-based level.
    navigate(planLevelPath(garden.id, next, next === "garden" ? undefined : editingLayoutId));
  };
  // Leaving Ready ends the guide; so does deleting the garden it belongs to.
  useEffect(() => {
    if (!setup || !isLoaded) return;
    const leftReady = setup.step === "ready" && !(route.module === "plan" && route.gardenId === setup.gardenId);
    if (leftReady || (workspace && !workspace.gardens.some((item) => item.id === setup.gardenId))) setSetup(undefined);
  }, [setup, isLoaded, workspace, route.module, route.gardenId, setSetup]);

  /** Every Garden Plan edit is one undo step, named for the Undo button (ADR-0072, phase G5). */
  const updateGarden = (label: string, update: (current: Garden) => Garden) => {
    if (garden) planHistory.record(garden.id, label, update);
  };
  const areaName = (areaId: string) => latestWorkspaceRef.current?.gardens.find((item) => item.id === garden?.id)?.growingAreas.find((area) => area.id === areaId)?.name ?? "planting area";

  useUnsavedDraft("setup:name", Boolean(newGardenName));
  const openManagement = (gardenId?: string) => { if (gardenId) navigate(gardenPath(gardenId)); };
  const returnToDashboard = () => navigate(workspaceHomePath);

  const createFirstGarden = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newGardenName.trim();
    if (!name) return setMessage("Enter a garden name to continue.");
    const created = createGardenWorkspace(name);
    setWorkspace(created);
    setSetup(startSetup(created.selectedGardenId));
    navigate(gardenPath(created.selectedGardenId));
    setNewGardenName("");
    setMessage(`${name} created. Start with the garden size.`);
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
    setSetup(startSetup(newGarden.id));
    navigate(gardenPath(newGarden.id));
    setMessage(`${name} created. Start with the garden size.`);
  };

  const openDemoGarden = () => {
    // The demo's gardens join the user's own; its workspace-wide care stays out,
    // since that care would apply to the user's gardens too (ADR-0077).
    const demoGardens = createDemoGardenWorkspace().gardens;
    const existingDemoGarden = demoGardens.find((demo) => workspace?.gardens.some((candidate) => candidate.id === demo.id));
    if (existingDemoGarden) {
      openManagement(existingDemoGarden.id);
      return;
    }

    setWorkspace((current) =>
      current
        ? {
            ...current,
            selectedGardenId: demoGardens[0].id,
            gardens: [...current.gardens, ...demoGardens],
          }
        : current,
    );
    navigate(gardenPath(demoGardens[0].id));
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
          if (setup?.gardenId === garden.id) setSetup(undefined);
          navigate(workspaceHomePath);
          setMessage("Create a garden when you are ready.");
          return;
        }
        setWorkspace(next);
        // A garden deleted during its guided setup ends that setup too.
        if (setup?.gardenId === garden.id) setSetup(undefined);
        navigate(workspaceHomePath);
        garden.growingAreas.forEach((area) => discardDrafts(areaDraftKey(garden.id, area.id)));
        setMessage(`${garden.name} deleted.`);
      },
    });
  };

  const confirmDiscard = (dirty: boolean, onConfirm: () => void) => {
    if (!dirty) { onConfirm(); return; }
    setPendingConfirmation({ message: "Your changes have not been submitted. Discard them or keep editing.", confirmLabel: "Discard changes", cancelLabel: "Keep editing", onConfirm });
  };

  /**
   * Done ends editing the whole garden, on any level (ADR-0078). Plan edits
   * already save as they happen, so Done only checks for unsubmitted drafts,
   * then returns to Gardens and reports the save state honestly.
   */
  const finishEditing = () => {
    if (!garden) return;
    const keys = garden.growingAreas.map((area) => areaDraftKey(garden.id, area.id));
    const dirty = keys.some((key) => {
      const draft = areaDrafts[key];
      return Boolean(draft && !sameAreaProperties(draft.values, draft.baseline)) || plantDraftIsDirty(plantDrafts[key]);
    });
    confirmDiscard(dirty, () => {
      if (dirty) keys.forEach((key) => discardDrafts(key));
      const failed = syncState === "error" || syncState === "local-error" || syncState === "conflict";
      setMessage(failed ? `Some changes to ${garden.name} are not saved yet. Check the status at the top of the page.` : `${garden.name} saved.`);
      navigate(workspaceHomePath);
    });
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
    updateGarden(`add ${area.name}`, (current) => ({ ...current, growingAreas: [...current.growingAreas, area] }));
    setEditingLayoutId(area.id);
    setMessage(`${area.name} added at ${spot.x.toFixed(1)}, ${spot.y.toFixed(1)} m${placementNote(spot)}. Drag it to move it, or drag its corner to resize it.`);
  };

  /** An area saved without a size gets its type's standard size in a free spot, only when the user asks. */
  const placeUnsizedArea = (areaId: string) => {
    const latest = latestWorkspaceRef.current?.gardens.find((item) => item.id === garden?.id);
    const area = latest?.growingAreas.find((item) => item.id === areaId);
    if (!latest || !area || area.layout) return;
    const spot = findFreeAreaSpot(latest.plan, latest.growingAreas, areaKindDefaults[area.kind]);
    updateGarden(`place ${area.name}`, (current) => ({
      ...current,
      growingAreas: current.growingAreas.map((item) => item.id === areaId && !item.layout
        ? { ...item, layout: createRectangularLayout(spot.widthMeters, spot.depthMeters), planPlacement: { x: spot.x, y: spot.y, rotationDegrees: 0 } }
        : item),
    }));
    setEditingLayoutId(areaId);
    setMessage(`${area.name} placed at ${spot.x.toFixed(1)}, ${spot.y.toFixed(1)} m as ${spot.widthMeters} × ${spot.depthMeters} m${placementNote(spot)}. Drag its corner to change the size.`);
  };

  const resizeArea = (areaId: string, size: { widthMeters: number; depthMeters: number }) => {
    updateGarden(`resize ${areaName(areaId)}`, (current) =>
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
    updateGarden(`change ${trimmedName}`, (current) =>
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
        updateGarden(`delete ${area.name}`, (latest) => removeGrowingArea(latest, area.id));
        discardDrafts(areaDraftKey(garden.id, area.id));
        if (editingLayoutId === area.id) setEditingLayoutId(undefined);
        setMessage(`${area.name} deleted.`);
      },
    });
  };

  const updatePlan = (plan: GardenPlan) => {
    updateGarden("change the garden size", (current) => ({
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
    updateGarden(`move ${areaName(areaId)}`, (current) => ({
      ...current,
      growingAreas: current.growingAreas.map((area) =>
        area.id === areaId ? { ...area, planPlacement: { ...area.planPlacement, ...clampPlanPosition(planPlacement, current.plan) } } : area,
      ),
    }));
  };

  const updateAreaLayout = (areaId: string, layout: GrowingAreaLayout, label = "change plants") => {
    updateGarden(label, (current) =>
      linkCurrentLayoutPlants({
        ...current,
        growingAreas: current.growingAreas.map((area) =>
          area.id === areaId ? { ...area, layout } : area,
        ),
      }),
    );
  };

  // Canvas edits read the area's latest layout, so quick successive clicks never drop a plant.
  const updateAreaLayoutWith = (areaId: string, label: string, update: (layout: GrowingAreaLayout) => GrowingAreaLayout) => {
    updateGarden(label, (current) =>
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
      plantType: placingPlant.plantType,
      variety: placingPlant.variety,
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
      const label = editingArea.layout?.allocations.find((allocation) => allocation.id === plantId)?.label ?? "plant";
      updateAreaLayoutWith(editingArea.id, `move ${label}`, (layout) => ({
        ...layout,
        allocations: layout.allocations.map((allocation) => allocation.id === plantId ? { ...allocation, ...point } : allocation),
      }));
      if (!plantDraft.editingAllocation) updatePlantDraft(plantDraftKey, (draft) => ({ ...draft, selectedId: plantId }));
    },
    onPlacePlant: (point) => {
      if (!placingPlant) return;
      updateAreaLayoutWith(editingArea.id, `place ${placingPlant.label}`, (layout) => ({
        ...layout,
        allocations: [...layout.allocations, { ...placingPlant, id: createAllocationId(), ...point }],
      }));
    },
    onStopPlacing: () => updatePlantDraft(plantDraftKey, () => emptyPlantEditorDraft()),
  } : undefined;

  /**
   * Undo and Redo write the stored garden as a new change. Afterwards the plan
   * leaves an area that no longer exists, and a plant panel that was only
   * showing a plant that no longer exists closes.
   */
  const stepHistory = (direction: "undo" | "redo") => {
    if (!garden) return;
    const result = direction === "undo" ? planHistory.undo(garden.id) : planHistory.redo(garden.id);
    if (result.status !== "applied") return;
    setMessage(`${direction === "undo" ? "Undid" : "Redid"} ${result.label}.`);
    const area = result.garden.growingAreas.find((item) => item.id === editingLayoutId);
    if (editingLayoutId && !area) { setEditingLayoutId(undefined); return; }
    if (area && plantDraftKey && plantDraft?.selectedId && !plantDraftIsDirty(plantDraft) && !area.layout?.allocations.some((plant) => plant.id === plantDraft.selectedId))
      updatePlantDraft(plantDraftKey, () => emptyPlantEditorDraft());
  };
  const historyControls = garden ? {
    ...planHistory.forGarden(garden.id),
    onUndo: () => stepHistory("undo"),
    onRedo: () => stepHistory("redo"),
  } : undefined;

  /**
   * The guided setup's track and the panel for the step on screen (ADR-0072,
   * phase G6). The canvas below stays the normal Garden Plan canvas.
   */
  const changeSetupStep = (step: SetupStep, continuing = false) => {
    if (!guide) return;
    setSetup(continuing ? advanceSetup(guide) : goToStep(guide, step));
    // Garden size and Ready frame the whole garden.
    if ((step === "size" || step === "ready") && editingLayoutId) setEditingLayoutId(undefined);
  };
  const continueSetup = () => { if (guide) changeSetupStep(guide.step === "size" ? "areas" : guide.step === "areas" ? "plants" : "ready", true); };
  const finishSetup = () => {
    setSetup(undefined);
    setMessage("Setup finished. Switch between Garden, Planting areas, and Plants above the plan to keep editing.");
    requestAnimationFrame(() => gardenPlanHeadingRef.current?.focus());
  };
  const setupPanel = guide && garden ? (() => {
    const sized = garden.growingAreas.filter((area) => area.layout).length;
    const summary = setupSummary(garden);
    const minimum = minimumGardenSize(garden.growingAreas);
    const panel = guide.step === "size" ? <SetupStepPanel title="How big is the garden?"
      actions={<Button variant="primary" onClick={continueSetup}>Continue to planting areas</Button>}>
      <p>Type the width (left to right) and length (top to bottom), pick a common size, or drag the corner of the garden on the plan.</p>
      <GardenDetailsFields gardenId={garden.id} name={garden.name} plan={garden.plan} minimum={minimum} showName={false}
        onApply={({ plan }) => { if (plan) { updatePlan(plan); setMessage(`Garden size set to ${plan.widthMeters} × ${plan.depthMeters} m.`); } }} />
      <div className={setupStyles.presets} role="group" aria-label="Common garden sizes">
        <span>Common sizes</span>
        {gardenSizePresets.map((preset) => {
          const fits = preset.widthMeters >= minimum.widthMeters && preset.depthMeters >= minimum.depthMeters;
          const selected = preset.widthMeters === garden.plan.widthMeters && preset.depthMeters === garden.plan.depthMeters;
          return <Button key={`${preset.widthMeters}x${preset.depthMeters}`} aria-pressed={selected} disabled={!fits}
            title={fits ? undefined : "Too small for the planting areas"}
            onClick={() => { updatePlan(preset); setMessage(`Garden size set to ${preset.widthMeters} × ${preset.depthMeters} m.`); }}>
            {preset.widthMeters} × {preset.depthMeters} m
          </Button>;
        })}
      </div>
    </SetupStepPanel>
      : guide.step === "areas" ? <SetupStepPanel title="Add planting areas"
        actions={<><Button variant="primary" disabled={!sized} aria-describedby={sized ? undefined : "setup-areas-hint"} onClick={continueSetup}>Continue to plants</Button>
          {!sized && <p id="setup-areas-hint">Add at least one planting area to continue.</p>}</>}>
        <p>Choose an area type below. It appears at its standard size in a free spot; then move it, or resize it from its corner.</p>
      </SetupStepPanel>
      : guide.step === "plants" ? <SetupStepPanel title="Add plants"
        actions={<><Button variant="primary" disabled={!summary.plants} aria-describedby={summary.plants ? undefined : "setup-plants-hint"} onClick={continueSetup}>Continue to Ready</Button>
          <Button onClick={continueSetup}>Skip plants for now</Button>
          {!summary.plants && <p id="setup-plants-hint">Place at least one plant to continue, or skip this step.</p>}</>}>
        <p>Open a planting area on the plan, choose a plant, then click inside the area to place it. Fill places a whole row at the plant&apos;s spacing.</p>
      </SetupStepPanel>
      : <SetupReady gardenId={garden.id} gardenName={garden.name} summary={summary}
        careHref={careLocationPath(garden.id, "history")} seasonHref={seasonGardenPath(garden.id)}
        onLeave={() => setSetup(undefined)} onFinish={finishSetup} />;
    return <><SetupProgress setup={guide} onStep={(step) => changeSetupStep(step)} />{panel}</>;
  })() : undefined;
  const setupStep = guide?.step;
  const hasSizedArea = Boolean(garden?.growingAreas.some((area) => area.layout));
  const levelBar = !guide && planLevel ? <PlanLevelBar level={planLevel} onLevel={changePlanLevel}
    disabled={hasSizedArea ? {} : { plants: "Add a planting area first." }} /> : undefined;
  // The title row's actions (ADR-0078): Done on every level, Delete garden on the Garden level.
  // The guided setup keeps its own Continue and Finish instead of Done, and its Garden size
  // step, the setup's Garden level, keeps Delete garden so an unfinished garden can go (ADR-0078, amended).
  const deleteGardenButton = <Button variant="danger" shape="pill" onClick={deleteGarden}>Delete garden</Button>;
  const gardenActions = !garden || route.module !== "plan" ? null
    : guide ? (guide.step === "size" ? deleteGardenButton : null)
    : <>
      {planLevel === "garden" && deleteGardenButton}
      <Button variant="primary" shape="pill" aria-label={`Done editing ${garden.name}`} onClick={finishEditing}>Done</Button>
    </>;

  const archivePlantingRecord = (plantingRecordId: string) => {
    updateGarden("archive a planting record", (current) => archivePlanting(current, plantingRecordId));
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
    setWorkspace((current) => current ? updateCareOwner(current, owner ?? { ownerScope: "workspace" }, update) : current);
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
      <ButtonLink href={workspaceHomePath}>Return to overview</ButtonLink>
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
            notice={message}
            gardens={workspace?.gardens ?? []}
            gardenFilter={search.get("garden") ?? "all"}
            onGardenFilterChange={(id) => navigate(id === "all" ? "/season" : seasonGardenPath(id))}
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
          <CareWorkspace
            garden={careGarden}
            gardens={workspace?.gardens}
            locationFilter={search.get("location") ?? "all"}
            typeFilter={careHistoryType(search.get("type"))}
            // History filters replace the URL, so the back button leaves History instead of undoing filters (ADR-0080).
            onLocationChange={(location) => navigate(careHistoryPath(location, careHistoryType(search.get("type"))), true)}
            onTypeChange={(type) => navigate(careHistoryPath(search.get("location") ?? "all", type), true)}
            onClearFilters={() => navigate(careHistoryPath("all", "all"), true)}
            initialView={page.view}
            viewHref="/care"
            message={message}
            onMessage={setMessage}
            onUpdateRecords={updateCareRecords}
          />
        ) : garden ? (
          <section className="operations-content management-content">
            <>
              {gardenActions && (pageActionsSlot ? createPortal(gardenActions, pageActionsSlot) : <div className="plan-page-actions">{gardenActions}</div>)}
              {editingLayoutId && !editingArea && <p role="alert">Planting area not found in this garden. <Link href={gardenPath(garden.id)}>Back to plan</Link></p>}
              <EditorWorkbench single={setupStep === "size" || setupStep === "ready" || planLevel === "garden"}>{(mode) => {
                // An unsaved properties draft keeps its editor open when the layout narrows.
                const areaPropertiesDraft = editingArea ? areaDrafts[areaDraftKey(garden.id, editingArea.id)] : undefined;
                const hasAreaPropertiesDraft = Boolean(areaPropertiesDraft && !sameAreaProperties(areaPropertiesDraft.values, areaPropertiesDraft.baseline));
                // Planting areas edits the area's properties; Plants shows its plants beside the plan when wide.
                const showInspector = Boolean(editingArea) && (planLevel === "areas"
                  ? mode === "wide" || editingAreaProperties || hasAreaPropertiesDraft
                  : planLevel === "plants" && mode === "wide");
                // Only the Plants level edits plants (ADR-0075).
                const plantEditor = editingArea && plantDraftKey && planLevel === "plants" ? (
                  <GrowingAreaLayoutEditor
                    area={editingArea}
                    inInspector
                    draft={plantDraft}
                    onDraftChange={(update) => updatePlantDraft(plantDraftKey, update)}
                    onArchivePlantingRecord={archivePlantingRecord}
                    onChange={(layout, label) => updateAreaLayout(editingArea.id, layout, label)}
                  />
                ) : null;
                // The wide layout shows this panel in its own column beside the canvas.
                const inspector = editingArea && showInspector ? (
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
                    onClose={() => mode === "wide" ? setEditingLayoutId(undefined) : navigate(planLevelPath(garden.id, "areas", editingArea.id))}
                    onDelete={() => deleteArea(editingArea)}
                    onSave={saveAreaEditor}
                    showProperties={planLevel === "areas"}
                    title={planLevel === "plants" ? "Plants" : undefined}
                  >
                    {mode === "wide" && planLevel === "plants" && <>
                      {!guide && <p className={editorStyles.levelLink}><Link href={planLevelPath(garden.id, "areas", editingArea.id)}>Edit area size and position</Link></p>}
                      {plantEditor}
                    </>}
                  </PlantingAreaInspector>
                ) : null;
                return <>
                {/* Record a draft-opened editor in the URL so it stays open after Save. */}
                {mode !== "wide" && planLevel === "areas" && editingArea && hasAreaPropertiesDraft && !editingAreaProperties && (
                  <ReplaceRoute href={areaEditPath(garden.id, editingArea.id)} onReplace={(href) => navigate(href, true)} />
                )}
                <div className={editorStyles.plan} hidden={mode === "mobile" && showInspector}>
                <GardenPlanOverview
                  editable
                  gardenId={garden.id}
                  gardenName={garden.name}
                  growingAreas={garden.growingAreas}
                  plantings={garden.plantings}
                  floating={mode === "wide"}
                  sidePanel={mode === "wide" ? inspector : undefined}
                  headingRef={gardenPlanHeadingRef}
                  isAreaInspectorOpen={showInspector}
                  selectedAreaId={editingArea?.id}
                  areaPanel={mode !== "wide" && editingArea ? (
                    <section className={editorStyles.areaPanel} aria-labelledby="area-panel-heading">
                      <header>
                        <div>
                          <h3 id="area-panel-heading">{editingArea.name}</h3>
                          <p>{growingAreaKindLabels[editingArea.kind]}{editingArea.layout ? ` · ${editingArea.layout.widthMeters} × ${editingArea.layout.depthMeters} m` : ""}</p>
                        </div>
                        {planLevel === "areas" && <Link id="edit-area-properties" className="secondary-button" href={areaEditPath(garden.id, editingArea.id)}>Edit area</Link>}
                        {/* From Plants, the area's properties open on Planting areas in one tap. */}
                        {planLevel === "plants" && !guide && <Link className="secondary-button" href={areaEditPath(garden.id, editingArea.id)}>Edit area</Link>}
                        {/* Touch layouts have no Escape key; "Whole garden" only zooms out. */}
                        <button aria-label={`Done with ${editingArea.name}`} className="secondary-button" type="button" onClick={closeAreaInspector}>Done</button>
                      </header>
                      {plantEditor}
                    </section>
                  ) : undefined}
                  planting={planLevel === "plants" ? canvasPlanting : undefined}
                  history={historyControls}
                  setupStep={setupStep}
                  setupPanel={setupPanel ?? levelBar}
                  level={planLevel}
                  areaHref={(areaId) => guide ? areaPath(garden.id, areaId) : planLevelPath(garden.id, planLevel === "areas" ? "areas" : "plants", areaId)}
                  onStartSetup={() => { setSetup(startSetup(garden.id)); setMessage("Guided setup started. Start with the garden size."); }}
                  onAddArea={addArea}
                  onPlaceArea={placeUnsizedArea}
                  onResizeArea={resizeArea}
                  onEditLayout={openAreaInspector}
                  onExitArea={closeAreaInspector}
                  onGardenNameChange={(name) => updateGarden("rename the garden", (current) => ({ ...current, name }))}
                  onPlacementChange={updateAreaPlacement}
                  onPlanChange={updatePlan}
                  plan={garden.plan}
                />
                </div>
                {mode !== "wide" && inspector}
              </>;
              }}</EditorWorkbench>
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
          <FormField id="garden-name" label="Garden name">
            <input
              id="garden-name"
              onChange={(event) => onChangeName(event.target.value)}
              placeholder="e.g. Home garden"
              required
              value={newGardenName}
            />
          </FormField>
          <div className={homeStyles.onboardingActions}>
            <button className="primary-button" type="submit">
              Create garden
            </button>
            <button className="text-button" onClick={onLoadDemo} type="button">
              Load demo garden
            </button>
          </div>
        </FeedbackForm>
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
