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
import { gardenPath, areaPath, careView, type WorkspaceRoute } from "@/lib/workspaceRoutes";

import { PlantingAreaInspector } from "@/components/PlantingAreaInspector";
import { applyAreaProperties, areaPropertyErrors, areaDraftKey, emptyPlantEditorDraft, plantDraftIsDirty, sameAreaProperties } from "@/lib/areaEditorDrafts";
import { CareWorkspace, type CareRecords } from "@/components/CareWorkspace";
import { areaDeletionMessage, gardenDeletionMessage } from "@/lib/deletionImpact";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { GardenAreaList, GardenPlanOverview } from "@/components/GardenPlanOverview";
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
  defaultPlanPlacement,
  growingAreaKindLabels,
  growingAreaKinds,
  linkCurrentLayoutPlants,
  normalizePlanRotation,
  snapToGrid,
  validateLayoutDimensions,
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

import { EditorWorkbench, type EditorMode } from "./editor/EditorWorkbench";
import { EditorPanel } from "./editor/EditorPanel";
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
  const editingLayoutId = route.module === "plan" ? search.get("area") ?? undefined : undefined;
  const [previewAreaId, setPreviewAreaId] = useWorkspaceDraft<string | undefined>(`plan:area-preview:${route.gardenId ?? ""}`, undefined);
  const setEditingLayoutId = (id?: string) => {
    if (route.gardenId) navigate(id ? areaPath(route.gardenId, id) : gardenPath(route.gardenId));
  };
  useEffect(() => {
    if (route.module !== "care" || !search.has("view") || ["tasks", "history"].includes(search.get("view") ?? "")) return;
    const query = new URLSearchParams(search.toString()); query.set("view", "tasks");
    router.replace(`${route.gardenId ? gardenPath(route.gardenId, "care") : "/care"}?${query}`);
  }, [route.module, route.gardenId, router, search]);
  const [newGardenName, setNewGardenName] = useWorkspaceDraft("setup:name", "");
  const [areaName, setAreaName] = useWorkspaceDraft(`area-create:${route.gardenId ?? ""}:areaName`, "");
  const [areaKind, setAreaKind] = useWorkspaceDraft<GrowingAreaKind>(`area-create:${route.gardenId ?? ""}:areaKind`, "raised-bed");
  // Width runs left to right (widthMeters); length runs top to bottom (depthMeters).
  const [areaWidth, setAreaWidth] = useWorkspaceDraft(`area-create:${route.gardenId ?? ""}:width`, "2");
  const [areaLength, setAreaLength] = useWorkspaceDraft(`area-create:${route.gardenId ?? ""}:length`, "1");
  const [areaRotationDegrees, setAreaRotationDegrees] = useWorkspaceDraft(`area-create:${route.gardenId ?? ""}:areaRotationDegrees`, "0");
  const [isAreaFormOpen, setIsAreaFormOpen] = useWorkspaceDraft(`area-create:${route.gardenId ?? ""}:isAreaFormOpen`, false);
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

  useUnsavedDraft(`area-create:${route.gardenId ?? ""}`, Boolean(areaName));
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
  const discardNewArea = () => {
    setIsAreaFormOpen(false); setAreaName(""); setAreaKind("raised-bed"); setAreaWidth("2"); setAreaLength("1"); setAreaRotationDegrees("0");
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

  const openAreaForm = () => {
    setEditingLayoutId(undefined);
    setIsAreaFormOpen(true);
  };

  const openAreaInspector = (areaId: string) => {
    setIsAreaFormOpen(false);
    setEditingLayoutId(areaId);
  };
  // "Whole garden" and Escape close the open area the same way its Close button does.
  const closeAreaInspector = () => {
    if (!garden || !editingArea) return;
    const key = areaDraftKey(garden.id, editingArea.id);
    const draft = areaDrafts[key];
    const dirty = Boolean(draft && !sameAreaProperties(draft.values, draft.baseline)) || plantDraftIsDirty(plantDrafts[key]);
    confirmDiscard(dirty, () => {
      if (dirty) discardDrafts(key);
      setPreviewAreaId(editingArea.id);
      setEditingLayoutId(undefined);
    });
  };

  const saveArea = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = areaName.trim();
    const width = Number(areaWidth);
    const length = Number(areaLength);
    const rotationDegrees = Number(areaRotationDegrees);
    if (!garden || !name)
      return setMessage("Enter a planting-area name to continue.");
    if (!validateLayoutDimensions(width, length))
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
            layout: createRectangularLayout(snapToGrid(width), snapToGrid(length)),
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
    setAreaWidth("2");
    setAreaLength("1");
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
              <EditorWorkbench>{(mode) => <>
                <div className={editorStyles.plan} hidden={mode === "mobile" && (isAreaFormOpen || Boolean(editingArea))}>
                <GardenPlanOverview
                  editable
                  gardenId={garden.id}
                  gardenName={garden.name}
                  growingAreas={garden.growingAreas}
                  headingRef={gardenPlanHeadingRef}
                  isAreaInspectorOpen={isAreaFormOpen || Boolean(editingArea)}
                  selectedAreaId={editingArea?.id ?? (mode === "mobile" ? previewAreaId : undefined)}
                  areaListInSidebar={mode === "wide" && !isAreaFormOpen && !editingArea}
                  showAreaPreview={mode === "mobile"}
                  onExitArea={mode === "mobile" ? () => setPreviewAreaId(undefined) : closeAreaInspector}
                  onAddArea={openAreaForm}
                  onEditLayout={mode === "mobile" ? setPreviewAreaId : openAreaInspector}
                  onGardenNameChange={(name) => updateGarden((current) => ({ ...current, name }))}
                  onPlacementChange={updateAreaPlacement}
                  onPlanChange={updatePlan}
                  plan={garden.plan}
                />
                </div>
                {mode === "wide" && !isAreaFormOpen && !editingArea && <aside className={editorStyles.summary} aria-label="Garden area summary">
                  <GardenAreaList gardenId={garden.id} areas={garden.growingAreas} />
                </aside>}
                <PlantingAreaCreation
                  mode={mode}
                  gardenName={garden.name}
                  areaKind={areaKind}
                  areaWidth={areaWidth}
                  areaName={areaName}
                  areaRotationDegrees={areaRotationDegrees}
                  areaLength={areaLength}
                  isAreaFormOpen={isAreaFormOpen}
                  onSave={saveArea}
                  onSetAreaKind={setAreaKind}
                  onSetAreaWidth={setAreaWidth}
                  onSetAreaName={setAreaName}
                  onSetAreaRotationDegrees={setAreaRotationDegrees}
                  onSetAreaLength={setAreaLength}
                  onSetFormOpen={(open) => open ? setIsAreaFormOpen(true) : confirmDiscard(Boolean(areaName || areaKind !== "raised-bed" || areaWidth !== "2" || areaLength !== "1" || areaRotationDegrees !== "0"), discardNewArea)}
                />
                {editingArea ? (
                  <PlantingAreaInspector
                    key={areaDraftKey(garden.id, editingArea.id)}
                    area={editingArea}
                    plan={garden.plan}
                    mode={mode}
                    gardenName={garden.name}
                    draft={areaDrafts[areaDraftKey(garden.id, editingArea.id)]}
                    onDraftChange={(draft) => setAreaDraft(areaDraftKey(garden.id, editingArea.id), draft)}
                    hasPlantChanges={plantDraftIsDirty(plantDrafts[areaDraftKey(garden.id, editingArea.id)])}
                    onDiscardPlants={() => discardDrafts(areaDraftKey(garden.id, editingArea.id))}
                    onClose={() => { setPreviewAreaId(editingArea.id); setEditingLayoutId(undefined); }}
                    onDelete={() => deleteArea(editingArea)}
                    onSave={saveAreaEditor}
                  >
                    <GrowingAreaLayoutEditor
                      area={editingArea}
                      inInspector
                      draft={plantDrafts[areaDraftKey(garden.id, editingArea.id)] ?? emptyPlantEditorDraft()}
                      onDraftChange={(update) => setPlantDrafts((current) => {
                        const key = areaDraftKey(garden.id, editingArea.id);
                        const nextDraft = update(current[key] ?? emptyPlantEditorDraft());
                        const next = { ...current };
                        if (!nextDraft.selectedId && !nextDraft.isAddFormOpen && !nextDraft.isEditOpen && !plantDraftIsDirty(nextDraft)) delete next[key];
                        else next[key] = nextDraft;
                        return next;
                      })}
                      onArchivePlantingRecord={archivePlantingRecord}
                      onChange={(layout) => updateAreaLayout(editingArea.id, layout)}
                      onSaveArea={(name, kind, rotationDegrees, layout) =>
                        saveAreaEditor(editingArea.id, name, kind, rotationDegrees, layout)
                      }
                      showAreaProperties={false}
                    />
                  </PlantingAreaInspector>
                ) : null}
              </>}</EditorWorkbench>
              <div hidden={Boolean(editingArea) || isAreaFormOpen}>
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

function PlantingAreaCreation({
  mode, gardenName,
  areaKind,
  areaWidth,
  areaName,
  areaRotationDegrees,
  areaLength,
  isAreaFormOpen,
  onSave,
  onSetAreaKind,
  onSetAreaWidth,
  onSetAreaName,
  onSetAreaRotationDegrees,
  onSetAreaLength,
  onSetFormOpen,
}: {
  mode: EditorMode;
  gardenName: string;
  areaKind: GrowingAreaKind;
  areaWidth: string;
  areaName: string;
  areaRotationDegrees: string;
  areaLength: string;
  isAreaFormOpen: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSetAreaKind: (kind: GrowingAreaKind) => void;
  onSetAreaWidth: (width: string) => void;
  onSetAreaName: (name: string) => void;
  onSetAreaRotationDegrees: (rotationDegrees: string) => void;
  onSetAreaLength: (length: string) => void;
  onSetFormOpen: (open: boolean) => void;
}) {
  if (!isAreaFormOpen) return null;

  return (
    <EditorPanel mode={mode} title="Add planting area" context={gardenName} headingId="add-planting-area-heading" returnFocusId="add-planting-area" onClose={() => onSetFormOpen(false)}>
      <p className="planting-area-creation-intro">
        Define the bed, then place it directly on the plan.
      </p>
      <FeedbackForm className="planting-area-creation-form" onSubmit={onSave}>
        <FormField id="planting-area-name" className="field">
          <label htmlFor="planting-area-name">Planting-area name</label>
          <input
            autoFocus
            id="planting-area-name"
            onChange={(event) => onSetAreaName(event.target.value)}
            required
            value={areaName}
          />
        </FormField>
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
          <FormField id="planting-area-width" className="field">
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
          </FormField>
          <FormField id="planting-area-length" className="field">
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
          </FormField>
        </div>
        <FormField id="planting-area-rotation" className="field">
          <label htmlFor="planting-area-rotation">Rotation (degrees)</label>
          <input
            id="planting-area-rotation" required
            onChange={(event) => onSetAreaRotationDegrees(event.target.value)}
            step="1"
            type="number"
            value={areaRotationDegrees}
          />
        </FormField>
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
      </FeedbackForm>
    </EditorPanel>
  );
}


function Status({ message }: { message: string }) {
  return (
    <p aria-live="polite" className="workspace-message" role="status">
      {message}
    </p>
  );
}
