"use client";

import { FormEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from "react";

import { ConfirmDialog } from "@/components/ConfirmDialog";
import { GardenPlanOverview } from "@/components/GardenPlanOverview";
import { GrowingAreaLayoutEditor } from "@/components/GrowingAreaLayoutEditor";
import { SeasonPlanner } from "@/components/SeasonPlanner";
import { AiGardenNote } from "@/components/AiGardenNote";
import { PlantHealth } from "@/components/PlantHealth";
import { PlantKnowledge } from "@/components/PlantKnowledge";
import {
  addDays,
  careTaskStatus,
  clampAllocationCenter,
  clampPlanPosition,
  createRectangularLayout,
  createDemoGardenWorkspace,
  createGarden,
  createGardenWorkspace,
  defaultPlanPlacement,
  GARDEN_WORKSPACE_STORAGE_KEY,
  growingAreaKindLabels,
  growingAreaKinds,
  linkCurrentLayoutPlants,
  normalizePlanRotation,
  plantingCropFamilyLabels,
  plantDisplayName,
  readGardenWorkspace,
  snapToGrid,
  todayDate,
  validateLayoutDimensions,
  type Garden,
  type HealthRecord,
  type CareEvent,
  type CareEventTargetScope,
  type CareEventType,
  type CareTask,
  type GardenPlan,
  type GardenWorkspace,
  type GrowingArea,
  type GrowingAreaKind,
  type GrowingAreaLayout,
  type PlanPlacement,
  type PlantingCropFamily,
  type PlantingRecord,
} from "@/lib/gardenWorkspace";
import {
  importServerWorkspace,
  type AiCareNoteDraft,
  loadServerWorkspace,
  saveServerWorkspace,
} from "@/lib/gardenWorkspaceApi";

export const SERVER_WORKSPACE_STORAGE_KEY =
  "sun-aware-garden-planner:server-workspace-id:v1";

export function GardenWorkspace() {
  const [workspace, setWorkspace] = useState<GardenWorkspace>();
  const [isManagement, setIsManagement] = useState(false);
  const [isCareLog, setIsCareLog] = useState(false);
  const [careGardenId, setCareGardenId] = useState<string>();
  const [isCareHub, setIsCareHub] = useState(false);
  const [isAiGardenNote, setIsAiGardenNote] = useState(false);
  const [isPlantHealth, setIsPlantHealth] = useState(false);
  const [isPlantKnowledge, setIsPlantKnowledge] = useState(false);
  const [isSeasonPlanner, setIsSeasonPlanner] = useState(false);
  const [careView, setCareView] = useState<"tasks" | "history">("tasks");
  const [isGardenSetup, setIsGardenSetup] = useState(false);
  const [newGardenName, setNewGardenName] = useState("");
  const [areaName, setAreaName] = useState("");
  const [areaKind, setAreaKind] = useState<GrowingAreaKind>("raised-bed");
  const [areaLength, setAreaLength] = useState("2");
  const [areaWidth, setAreaWidth] = useState("1");
  const [areaRotationDegrees, setAreaRotationDegrees] = useState("0");
  const [isAreaFormOpen, setIsAreaFormOpen] = useState(false);
  const [editingLayoutId, setEditingLayoutId] = useState<string>();
  const [isCareFormOpen, setIsCareFormOpen] = useState(false);
  const [editingCareEventId, setEditingCareEventId] = useState<string>();
  const [careForm, setCareForm] = useState<CareForm>(emptyCareForm());
  const [isCareTaskFormOpen, setIsCareTaskFormOpen] = useState(false);
  const [editingCareTaskId, setEditingCareTaskId] = useState<string>();
  const [careTaskForm, setCareTaskForm] =
    useState<CareTaskForm>(emptyCareTaskForm());
  const [completingCareTaskId, setCompletingCareTaskId] = useState<string>();
  const [completionDate, setCompletionDate] = useState("");
  const [isLoaded, setIsLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [storageSource, setStorageSource] = useState<"browser" | "server">("browser");
  const [serverWorkspaceId, setServerWorkspaceId] = useState<string>();
  const [serverLoadFailed, setServerLoadFailed] = useState(false);
  const [pendingConfirmation, setPendingConfirmation] = useState<{
    message: string;
    tone?: "default" | "danger";
    onConfirm: () => void;
  }>();
  const gardenPlanHeadingRef = useRef<HTMLHeadingElement>(null);
  const careLogHeadingRef = useRef<HTMLHeadingElement>(null);
  const queuedServerWorkspaceRef = useRef<string | undefined>(undefined);
  const serverSaveQueueRef = useRef(Promise.resolve());
  const autoSyncInFlightRef = useRef(false);

  useEffect(() => {
    let active = true;
    const restoreWorkspace = async () => {
      try {
        const savedServerWorkspaceId = window.localStorage.getItem(SERVER_WORKSPACE_STORAGE_KEY);
        if (savedServerWorkspaceId) {
          setStorageSource("server");
          setServerWorkspaceId(savedServerWorkspaceId);
          try {
            const serverWorkspace = await loadServerWorkspace(savedServerWorkspaceId);
            const serverSnapshot = JSON.stringify(serverWorkspace);
            const restored = readGardenWorkspace(serverSnapshot);
            if (!restored) throw new Error("Invalid server workspace");
            if (!active) return;
            queuedServerWorkspaceRef.current = serverSnapshot;
            setWorkspace(restored);
            setMessage("Gardens restored from PostgreSQL.");
          } catch {
            if (!active) return;
            setServerLoadFailed(true);
            setMessage("PostgreSQL could not load this garden workspace. Check the API, then try again.");
          }
          return;
        }
        const saved = window.localStorage.getItem(GARDEN_WORKSPACE_STORAGE_KEY);
        const restored = readGardenWorkspace(saved);
        if (restored) {
          setWorkspace(restored);
          setMessage("Gardens restored from this browser.");
        } else if (saved) {
          setMessage("Saved garden data could not be loaded.");
        }
      } catch {
        if (active) setMessage("This browser's garden storage is unavailable.");
      } finally {
        if (active) setIsLoaded(true);
      }
    };
    void restoreWorkspace();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoaded || !workspace) return;
    if (storageSource === "browser") {
      try {
        window.localStorage.setItem(
          GARDEN_WORKSPACE_STORAGE_KEY,
          JSON.stringify(workspace),
        );
      } catch {
        setMessage("Changes could not be saved in this browser.");
      }
      if (autoSyncInFlightRef.current) return;
      autoSyncInFlightRef.current = true;
      void (async () => {
        const workspaceId = `local-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
        try {
          const imported = await importServerWorkspace(workspaceId, workspace);
          const restored = readGardenWorkspace(JSON.stringify(imported));
          if (!restored) throw new Error("Invalid server workspace");
          window.localStorage.setItem(SERVER_WORKSPACE_STORAGE_KEY, workspaceId);
          queuedServerWorkspaceRef.current = JSON.stringify(restored);
          setServerWorkspaceId(workspaceId);
          setStorageSource("server");
          setWorkspace(restored);
        } catch {
          // PostgreSQL isn't reachable yet. Stay in browser storage and
          // retry automatically the next time the workspace changes.
        } finally {
          autoSyncInFlightRef.current = false;
        }
      })();
      return;
    }
    if (!serverWorkspaceId) return;
    const snapshot = JSON.stringify(workspace);
    if (snapshot === queuedServerWorkspaceRef.current) return;
    queuedServerWorkspaceRef.current = snapshot;
    serverSaveQueueRef.current = serverSaveQueueRef.current.then(async () => {
      try {
        await saveServerWorkspace(serverWorkspaceId, workspace);
        setMessage("Changes saved to PostgreSQL.");
      } catch {
        setMessage("Changes could not be saved to PostgreSQL. Keep this page open and make another change after the API recovers.");
      }
    });
  }, [isLoaded, serverWorkspaceId, storageSource, workspace]);

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
    if ((!isManagement && !isCareLog) || editingArea) return;
    const heading = isCareLog
      ? careLogHeadingRef.current
      : gardenPlanHeadingRef.current;
    heading?.focus();
  }, [editingArea, isCareLog, isManagement, garden?.id]);

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
    setIsCareFormOpen(false);
    setEditingCareEventId(undefined);
    setIsCareTaskFormOpen(false);
    setEditingCareTaskId(undefined);
    setCompletingCareTaskId(undefined);
    setCompletionDate("");
  };

  const openManagement = (gardenId = garden?.id) => {
    const nextGarden = workspace?.gardens.find(
      (candidate) => candidate.id === gardenId,
    );
    if (gardenId)
      setWorkspace((current) =>
        current ? { ...current, selectedGardenId: gardenId } : current,
      );
    setIsManagement(true);
    setIsCareLog(false);
    setIsCareHub(false);
    setIsAiGardenNote(false);
    setIsPlantHealth(false);
    setIsPlantKnowledge(false);
    setIsSeasonPlanner(false);
    setIsGardenSetup(false);
    clearTransientState();
  };

  const openCareLog = (gardenId = garden?.id) => {
    if (gardenId && gardenId !== "all-gardens")
      setWorkspace((current) =>
        current ? { ...current, selectedGardenId: gardenId } : current,
      );
    setCareGardenId(gardenId);
    setIsManagement(false);
    setIsCareLog(true);
    setIsCareHub(false);
    setIsAiGardenNote(false);
    setIsPlantHealth(false);
    setIsPlantKnowledge(false);
    setIsSeasonPlanner(false);
    setIsGardenSetup(false);
    setCareView("tasks");
    clearTransientState();
  };

  const openCareHub = () => {
    setIsManagement(false);
    setIsCareLog(false);
    setIsCareHub(true);
    setIsAiGardenNote(false);
    setIsPlantHealth(false);
    setIsPlantKnowledge(false);
    setIsGardenSetup(false);
    setIsSeasonPlanner(false);
    clearTransientState();
  };

  const returnToDashboard = () => {
    setIsManagement(false);
    setIsCareLog(false);
    setIsCareHub(false);
    setIsAiGardenNote(false);
    setIsPlantHealth(false);
    setIsPlantKnowledge(false);
    setIsSeasonPlanner(false);
    setIsGardenSetup(false);
    setCareGardenId(undefined);
    clearTransientState();
  };

  const createFirstGarden = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newGardenName.trim();
    if (!name) return setMessage("Enter a garden name to continue.");
    setWorkspace(createGardenWorkspace(name));
    setNewGardenName("");
    setIsManagement(true);
    setIsGardenSetup(true);
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
    setIsManagement(true);
    setIsGardenSetup(true);
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
    setIsManagement(true);
    setIsCareLog(false);
    setIsCareHub(false);
    setIsAiGardenNote(false);
    setIsPlantHealth(false);
    setIsPlantKnowledge(false);
    setIsSeasonPlanner(false);
    setIsGardenSetup(false);
    clearTransientState();
    setMessage("Demo garden opened.");
  };

  const openGardenSetup = () => {
    setNewGardenName("");
    setIsGardenSetup(true);
    setIsManagement(false);
    setIsCareLog(false);
    setIsAiGardenNote(false);
    clearTransientState();
  };

  const deleteGarden = () => {
    if (!workspace || !garden) return;
    const impact = `${garden.growingAreas.length} planting area${garden.growingAreas.length === 1 ? "" : "s"} and ${garden.plantings.length} planting record${garden.plantings.length === 1 ? "" : "s"}`;
    setPendingConfirmation({
      message: `Delete ${garden.name}? This removes its ${impact} from this browser.`,
      tone: "danger",
      onConfirm: () => {
        const gardens = workspace.gardens.filter(
          (candidate) => candidate.id !== garden.id,
        );
        if (!gardens.length) {
          if (storageSource === "server") {
            setMessage("Add another garden before deleting the last PostgreSQL garden.");
            return;
          }
          window.localStorage.removeItem(GARDEN_WORKSPACE_STORAGE_KEY);
          setWorkspace(undefined);
          setIsManagement(false);
          setMessage("Create a garden when you are ready.");
          return;
        }

        setWorkspace({ ...workspace, selectedGardenId: gardens[0].id, gardens });
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
    setPendingConfirmation({
      message: `Delete ${area.name}? This removes the planting area and its ${linkedPlantings.length} planting record${linkedPlantings.length === 1 ? "" : "s"} from this browser. Care history stays in this garden.`,
      tone: "danger",
      onConfirm: () => {
        updateGarden((current) => ({
          ...current,
          growingAreas: current.growingAreas.filter(
            (candidate) => candidate.id !== area.id,
          ),
          plantings: current.plantings.filter(
            (planting) => planting.growingAreaId !== area.id,
          ),
          careEvents: current.careEvents.map((event) =>
            event.targetScope === "planting-area" && event.growingAreaId === area.id
              ? { ...event, targetAreaDeleted: true }
              : event.targetScope === "plant-group" &&
                  linkedPlantings.some(
                    (planting) => planting.id === event.plantingRecordId,
                  )
                ? { ...event, targetPlantingRecordDeleted: true }
              : event,
          ),
          careTasks: current.careTasks.map((task) =>
            task.targetScope === "planting-area" && task.growingAreaId === area.id
              ? { ...task, targetAreaDeleted: true }
              : task.targetScope === "plant-group" &&
                  linkedPlantings.some(
                    (planting) => planting.id === task.plantingRecordId,
                  )
                ? { ...task, targetPlantingRecordDeleted: true }
                : task,
          ),
          healthRecords: current.healthRecords.map((record) =>
            record.targetScope === "planting-area" && record.growingAreaId === area.id
              ? { ...record, targetAreaDeleted: true }
              : record.targetScope === "plant-group" &&
                  linkedPlantings.some(
                    (planting) => planting.id === record.plantingRecordId,
                  )
                ? { ...record, targetPlantingRecordDeleted: true }
                : record,
          ),
        }));
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
    updateGarden((current) => ({
      ...current,
      plantings: current.plantings.map((planting) =>
        planting.id === plantingRecordId
          ? { ...planting, isActive: false }
          : planting,
      ),
    }));
  };

  const openSeasonPlanner = () => {
    setIsManagement(false);
    setIsCareLog(false);
    setIsCareHub(false);
    setIsAiGardenNote(false);
    setIsPlantHealth(false);
    setIsPlantKnowledge(false);
    setIsGardenSetup(false);
    setIsSeasonPlanner(true);
    clearTransientState();
  };

  const openAiGardenNote = () => {
    setIsManagement(false);
    setIsCareLog(false);
    setIsCareHub(false);
    setIsGardenSetup(false);
    setIsSeasonPlanner(false);
    setIsAiGardenNote(true);
    setIsPlantHealth(false);
    setIsPlantKnowledge(false);
    clearTransientState();
  };

  const openPlantHealth = () => {
    setIsManagement(false);
    setIsCareLog(false);
    setIsCareHub(false);
    setIsAiGardenNote(false);
    setIsPlantHealth(true);
    setIsPlantKnowledge(false);
    setIsGardenSetup(false);
    setIsSeasonPlanner(false);
    clearTransientState();
  };

  const openPlantKnowledge = () => {
    setIsManagement(false);
    setIsCareLog(false);
    setIsCareHub(false);
    setIsAiGardenNote(false);
    setIsPlantHealth(false);
    setIsPlantKnowledge(true);
    setIsGardenSetup(false);
    setIsSeasonPlanner(false);
    clearTransientState();
  };

  const saveSeasonPlanPlant = (
    gardenId: string,
    growingAreaId: string,
    choice: { plantType: string; cropFamily: PlantingCropFamily },
  ) => {
    const planningYear = new Date().getFullYear() + 1;
    setWorkspace((current) =>
      current
        ? {
            ...current,
            gardens: current.gardens.map((garden) => {
              if (garden.id !== gardenId) return garden;
              const plannedPlanting = {
                id: createId("planned-planting"),
                commonName: choice.plantType,
                plantType: choice.plantType,
                cropFamily: choice.cropFamily,
                growingAreaId,
              };
              const existingPlan = garden.seasonPlans?.find(
                (plan) => plan.seasonYear === planningYear,
              );
              return {
                ...garden,
                seasonPlans: existingPlan
                  ? garden.seasonPlans?.map((plan) =>
                      plan.id === existingPlan.id
                        ? {
                            ...plan,
                            plantings: [...plan.plantings, plannedPlanting],
                          }
                        : plan,
                    )
                  : [
                      ...(garden.seasonPlans ?? []),
                      {
                        id: createId("season-plan"),
                        seasonYear: planningYear,
                        plantings: [plannedPlanting],
                      },
                    ],
              };
            }),
          }
        : current,
    );
    setMessage(`${choice.plantType} added to the ${planningYear} plan.`);
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
            gardens: current.gardens.map((garden) => {
              if (garden.id !== gardenId) return garden;
              return {
                ...garden,
                seasonPlans: (garden.seasonPlans ?? []).flatMap((plan) => {
                  if (plan.seasonYear !== seasonYear) return [plan];
                  const plantings = plan.plantings.filter(
                    (planting) => planting.id !== plantingId,
                  );
                  return plantings.length ? [{ ...plan, plantings }] : [];
                }),
              };
            }),
          }
        : current,
    );
    setMessage("Plant removed from the season plan.");
  };

  const openAddCare = () => {
    setCareForm(emptyCareForm(careGardenId === "all-gardens" ? "all-gardens" : "garden"));
    setEditingCareEventId(undefined);
    setIsCareFormOpen(true);
  };

  const openEditCare = (event: CareEvent) => {
    setCareForm({
      type: event.type,
      date: event.date,
      note: event.note,
      targetScope: event.targetScope,
      growingAreaId: event.growingAreaId ?? "",
      plantingRecordId: event.plantingRecordId ?? "",
      fertilizerProduct: event.fertilizerProduct ?? "",
      fertilizerAmount: event.fertilizerAmount ? String(event.fertilizerAmount) : "",
      fertilizerUnit: event.fertilizerUnit ?? "",
    });
    setEditingCareEventId(event.id);
    setIsCareFormOpen(true);
  };

  const saveCare = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!workspace || !garden || !careGarden) return;
    const allGardens = careGarden.id === "all-gardens";
    if (!isCalendarDate(careForm.date))
      return setMessage("Enter a valid care date.");
    const previous = (allGardens ? workspace.careEvents : garden.careEvents).find(
      (event) => event.id === editingCareEventId,
    );
    const area = garden.growingAreas.find(
      (candidate) => candidate.id === careForm.growingAreaId,
    );
    const planting = garden.plantings.find(
      (candidate) => candidate.id === careForm.plantingRecordId,
    );
    if (
      careForm.targetScope === "planting-area" &&
      !area &&
      !(previous?.targetScope === "planting-area" &&
        previous.growingAreaId === careForm.growingAreaId)
    )
      return setMessage("Choose an existing planting area.");
    if (
      careForm.targetScope === "plant-group" &&
      !planting &&
      !(previous?.targetScope === "plant-group" &&
        previous.plantingRecordId === careForm.plantingRecordId)
    )
      return setMessage("Choose an existing plant group.");

    const fertilizerProduct = careForm.fertilizerProduct.trim();
    const fertilizerUnit = careForm.fertilizerUnit.trim();
    const hasFertilizerAmount = Boolean(careForm.fertilizerAmount.trim());
    const fertilizerAmount = Number(careForm.fertilizerAmount);
    if (
      careForm.type === "fertilizing" &&
      hasFertilizerAmount &&
      (!Number.isFinite(fertilizerAmount) || fertilizerAmount <= 0)
    )
      return setMessage("Enter a fertilizer amount greater than zero.");

    const event: CareEvent = {
      id: editingCareEventId ?? createId("care"),
      type: careForm.type,
      date: careForm.date,
      note: careForm.note.trim(),
      targetScope: allGardens ? "all-gardens" : careForm.targetScope,
      ...(!allGardens && careForm.targetScope === "planting-area"
        ? {
            growingAreaId: careForm.growingAreaId,
            growingAreaName: area?.name ?? previous?.growingAreaName,
            ...(area ? {} : { targetAreaDeleted: true }),
          }
        : {}),
      ...(!allGardens && careForm.targetScope === "plant-group"
        ? {
            plantingRecordId: careForm.plantingRecordId,
            plantingRecordName:
              planting
                ? plantGroupDisplayName(planting, garden)
                : previous?.plantingRecordName,
            ...(planting ? {} : { targetPlantingRecordDeleted: true }),
          }
        : {}),
      ...(careForm.type === "fertilizing"
        ? {
            ...(fertilizerProduct ? { fertilizerProduct } : {}),
            ...(hasFertilizerAmount ? { fertilizerAmount } : {}),
            ...(fertilizerUnit ? { fertilizerUnit } : {}),
          }
        : {}),
    };
    const action = editingCareEventId ? "updated" : "added";
    setWorkspace((current) => {
      if (!current) return current;
      if (allGardens) {
        return {
          ...current,
          careEvents: editingCareEventId
            ? current.careEvents.map((item) => item.id === editingCareEventId ? event : item)
            : [...current.careEvents, event],
        };
      }
      return {
        ...current,
        gardens: current.gardens.map((candidate) => candidate.id === garden.id ? {
          ...candidate,
          careEvents: editingCareEventId
            ? candidate.careEvents.map((item) => item.id === editingCareEventId ? event : item)
            : [...candidate.careEvents, event],
        } : candidate),
      };
    });
    setIsCareFormOpen(false);
    setEditingCareEventId(undefined);
    setMessage(`${careForm.type === "watering" ? "Watering" : "Fertilizing"} event ${action}.`);
  };

  const removeCare = (event: CareEvent) => {
    setWorkspace((current) => {
      if (!current) return current;
      if (careGardenId === "all-gardens") return { ...current, careEvents: current.careEvents.filter((item) => item.id !== event.id) };
      return { ...current, gardens: current.gardens.map((candidate) => candidate.id === garden?.id ? { ...candidate, careEvents: candidate.careEvents.filter((item) => item.id !== event.id) } : candidate) };
    });
    setMessage("Care event removed.");
  };

  const openAddCareTask = () => {
    setCareTaskForm(emptyCareTaskForm(careGardenId === "all-gardens" ? "all-gardens" : "garden"));
    setEditingCareTaskId(undefined);
    setIsCareTaskFormOpen(true);
  };

  const openEditCareTask = (task: CareTask) => {
    setCareTaskForm({
      type: task.type,
      dueDate: task.dueDate,
      note: task.note,
      targetScope: task.targetScope,
      growingAreaId: task.growingAreaId ?? "",
      plantingRecordId: task.plantingRecordId ?? "",
      repeatIntervalDays: task.repeatIntervalDays
        ? String(task.repeatIntervalDays)
        : "",
    });
    setEditingCareTaskId(task.id);
    setIsCareTaskFormOpen(true);
  };

  const saveCareTask = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!workspace || !garden || !careGarden) return;
    const allGardens = careGarden.id === "all-gardens";
    if (!isCalendarDate(careTaskForm.dueDate))
      return setMessage("Enter a valid due date.");
    const previous = (allGardens ? workspace.careTasks : garden.careTasks).find(
      (task) => task.id === editingCareTaskId,
    );
    const area = garden.growingAreas.find(
      (candidate) => candidate.id === careTaskForm.growingAreaId,
    );
    const planting = garden.plantings.find(
      (candidate) => candidate.id === careTaskForm.plantingRecordId,
    );
    if (
      careTaskForm.targetScope === "planting-area" &&
      !area &&
      !(previous?.targetScope === "planting-area" &&
        previous.growingAreaId === careTaskForm.growingAreaId)
    )
      return setMessage("Choose an existing planting area.");
    if (
      careTaskForm.targetScope === "plant-group" &&
      !planting &&
      !(previous?.targetScope === "plant-group" &&
        previous.plantingRecordId === careTaskForm.plantingRecordId)
    )
      return setMessage("Choose an existing plant group.");

    const hasRepeatInterval = Boolean(careTaskForm.repeatIntervalDays.trim());
    const repeatIntervalDays = Number(careTaskForm.repeatIntervalDays);
    if (
      hasRepeatInterval &&
      (!Number.isInteger(repeatIntervalDays) || repeatIntervalDays < 1)
    )
      return setMessage("Enter a whole-day repeat interval of at least 1.");

    const task: CareTask = {
      id: editingCareTaskId ?? createId("care-task"),
      type: careTaskForm.type,
      dueDate: careTaskForm.dueDate,
      note: careTaskForm.note.trim(),
      targetScope: allGardens ? "all-gardens" : careTaskForm.targetScope,
      ...(!allGardens && careTaskForm.targetScope === "planting-area"
        ? {
            growingAreaId: careTaskForm.growingAreaId,
            growingAreaName: area?.name ?? previous?.growingAreaName,
            ...(area ? {} : { targetAreaDeleted: true }),
          }
        : {}),
      ...(!allGardens && careTaskForm.targetScope === "plant-group"
        ? {
            plantingRecordId: careTaskForm.plantingRecordId,
            plantingRecordName: planting
              ? plantGroupDisplayName(planting, garden)
              : previous?.plantingRecordName,
            ...(planting ? {} : { targetPlantingRecordDeleted: true }),
          }
        : {}),
      ...(hasRepeatInterval ? { repeatIntervalDays } : {}),
    };
    const action = editingCareTaskId ? "updated" : "added";
    setWorkspace((current) => {
      if (!current) return current;
      if (allGardens) {
        return {
          ...current,
          careTasks: editingCareTaskId
            ? current.careTasks.map((item) => item.id === editingCareTaskId ? task : item)
            : [...current.careTasks, task],
        };
      }
      return {
        ...current,
        gardens: current.gardens.map((candidate) => candidate.id === garden.id ? {
          ...candidate,
          careTasks: editingCareTaskId
            ? candidate.careTasks.map((item) => item.id === editingCareTaskId ? task : item)
            : [...candidate.careTasks, task],
        } : candidate),
      };
    });
    setIsCareTaskFormOpen(false);
    setEditingCareTaskId(undefined);
    setMessage(`${task.type === "watering" ? "Watering" : "Fertilizing"} task ${action}.`);
  };

  const openCompleteCareTask = (task: CareTask) => {
    setCompletingCareTaskId(task.id);
    setCompletionDate(todayDate());
  };

  const completeCareTask = (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!workspace || !garden || !careGarden || !completingCareTaskId) return;
    const allGardens = careGarden.id === "all-gardens";
    if (!isCalendarDate(completionDate))
      return setMessage("Enter a valid completion date.");
    const task = (allGardens ? workspace.careTasks : garden.careTasks).find(
      (candidate) => candidate.id === completingCareTaskId,
    );
    if (!task) return;
    const event: CareEvent = {
      id: createId("care"),
      type: task.type,
      date: completionDate,
      note: task.note,
      targetScope: task.targetScope,
      ...(task.targetScope === "planting-area"
        ? {
            growingAreaId: task.growingAreaId,
            growingAreaName: task.growingAreaName,
            ...(task.targetAreaDeleted ? { targetAreaDeleted: true } : {}),
          }
        : {}),
      ...(task.targetScope === "plant-group"
        ? {
            plantingRecordId: task.plantingRecordId,
            plantingRecordName: task.plantingRecordName,
            ...(task.targetPlantingRecordDeleted
              ? { targetPlantingRecordDeleted: true }
              : {}),
          }
        : {}),
    };
    setWorkspace((current) => {
      if (!current) return current;
      const nextTasks = (items: CareTask[]) => items.flatMap((item) =>
        item.id !== task.id ? [item] : item.repeatIntervalDays ? [{ ...item, dueDate: addDays(completionDate, item.repeatIntervalDays) }] : [],
      );
      if (allGardens) return { ...current, careEvents: [...current.careEvents, { ...event, targetScope: "all-gardens" }], careTasks: nextTasks(current.careTasks) };
      return { ...current, gardens: current.gardens.map((candidate) => candidate.id === garden.id ? { ...candidate, careEvents: [...candidate.careEvents, event], careTasks: nextTasks(candidate.careTasks) } : candidate) };
    });
    setCompletingCareTaskId(undefined);
    setCompletionDate("");
    setMessage(`${task.type === "watering" ? "Watering" : "Fertilizing"} task completed.`);
  };

  const removeCareTask = (task: CareTask) => {
    setWorkspace((current) => {
      if (!current) return current;
      if (careGardenId === "all-gardens") return { ...current, careTasks: current.careTasks.filter((item) => item.id !== task.id) };
      return { ...current, gardens: current.gardens.map((candidate) => candidate.id === garden?.id ? { ...candidate, careTasks: candidate.careTasks.filter((item) => item.id !== task.id) } : candidate) };
    });
    setMessage("Care task removed.");
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
    setIsAiGardenNote(false);
    setIsCareLog(true);
    setCareView("history");
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
        <p className="product-kicker">Sun-Aware Garden Planner</p>
        <div className="header-actions">
          {isManagement || isCareLog || isCareHub || isSeasonPlanner || isAiGardenNote || isPlantHealth || isPlantKnowledge ? (
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
      {isGardenSetup && !isManagement ? (
          <GardenSetupStart
            name={newGardenName}
            message={message}
            onChangeName={setNewGardenName}
            onCreate={addGarden}
            onCancel={returnToDashboard}
          />
        ) : isSeasonPlanner ? (
          <SeasonPlanner
            gardens={workspace.gardens}
            onRemovePlan={removeSeasonPlanPlant}
            onSavePlan={saveSeasonPlanPlant}
          />
        ) : isAiGardenNote ? (
          <AiGardenNote
            gardens={workspace.gardens}
            initialGardenId={garden.id}
            isServerBacked={storageSource === "server"}
            onSave={saveAiCareNote}
            workspaceId={serverWorkspaceId}
          />
        ) : isPlantHealth ? (
          <PlantHealth
            gardens={workspace.gardens}
            initialGardenId={garden.id}
            isServerBacked={storageSource === "server"}
            onSave={saveHealthRecord}
            workspaceId={serverWorkspaceId}
          />
        ) : isPlantKnowledge ? (
          <PlantKnowledge
            gardens={workspace.gardens}
            initialGardenId={garden.id}
            isServerBacked={storageSource === "server"}
            workspaceId={serverWorkspaceId}
          />
        ) : isCareHub ? (
          <CareHub
            gardens={workspace.gardens}
            onOpenCare={openCareLog}
            workspace={workspace}
          />
      ) : !isManagement && !isCareLog ? (
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
        ) : isCareLog && careGarden ? (
          <section className="operations-content">
            <CareWorkspace
              garden={careGarden}
              view={careView}
              onChangeView={setCareView}
              careTaskForm={careTaskForm}
              completingCareTaskId={completingCareTaskId}
              completionDate={completionDate}
              editingCareTaskId={editingCareTaskId}
              isCareTaskFormOpen={isCareTaskFormOpen}
              onAddTask={openAddCareTask}
              onCancelTask={() => {
                setIsCareTaskFormOpen(false);
                setEditingCareTaskId(undefined);
              }}
              onCompleteTask={openCompleteCareTask}
              onCancelCompletion={() => {
                setCompletingCareTaskId(undefined);
                setCompletionDate("");
              }}
              onEditTask={openEditCareTask}
              onRemoveTask={removeCareTask}
              onSaveTask={saveCareTask}
              onSaveCompletion={completeCareTask}
              onSetCareTaskForm={setCareTaskForm}
              onSetCompletionDate={setCompletionDate}
              editingCareEventId={editingCareEventId}
              form={careForm}
              headingRef={careLogHeadingRef}
              isFormOpen={isCareFormOpen}
              onAdd={openAddCare}
              onCancel={() => {
                setIsCareFormOpen(false);
                setEditingCareEventId(undefined);
              }}
              onEdit={openEditCare}
              onRemove={removeCare}
              onSave={saveCare}
              onSetForm={setCareForm}
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
                isSetup={isGardenSetup}
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
        <p className="product-kicker">Sun-Aware Garden Planner</p>
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

function CareSummary({ garden }: { garden: Garden }) {
  const events = [...garden.careEvents]
    .sort((left, right) => right.date.localeCompare(left.date))
    .slice(0, 5);

  return (
    <section className="care-summary" aria-labelledby="care-summary-heading">
      <div>
        <p className="section-eyebrow">Care summary</p>
        <h2 id="care-summary-heading">Recent care</h2>
      </div>
      {events.length ? (
        <ul className="care-summary-list" aria-label="Recent care events">
          {events.map((event) => (
            <li key={event.id}>
              <span className={`care-event-type care-event-type-${event.type}`}>
                {event.type === "watering" ? "Watering" : "Fertilizing"}
              </span>
              <span>{event.date}</span>
              <span>{careTargetLabel(event, garden.name)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="section-context">No care events yet.</p>
      )}
    </section>
  );
}

function CareWorkspace({
  garden,
  view,
  onChangeView,
  careTaskForm,
  completingCareTaskId,
  completionDate,
  editingCareTaskId,
  isCareTaskFormOpen,
  onAddTask,
  onCancelTask,
  onCompleteTask,
  onCancelCompletion,
  onEditTask,
  onRemoveTask,
  onSaveTask,
  onSaveCompletion,
  onSetCareTaskForm,
  onSetCompletionDate,
  editingCareEventId,
  form,
  headingRef,
  isFormOpen,
  onAdd,
  onCancel,
  onEdit,
  onRemove,
  onSave,
  onSetForm,
}: {
  garden: Garden;
  view: "tasks" | "history";
  onChangeView: (view: "tasks" | "history") => void;
  careTaskForm: CareTaskForm;
  completingCareTaskId?: string;
  completionDate: string;
  editingCareTaskId?: string;
  isCareTaskFormOpen: boolean;
  onAddTask: () => void;
  onCancelTask: () => void;
  onCompleteTask: (task: CareTask) => void;
  onCancelCompletion: () => void;
  onEditTask: (task: CareTask) => void;
  onRemoveTask: (task: CareTask) => void;
  onSaveTask: (event: FormEvent<HTMLFormElement>) => void;
  onSaveCompletion: (event: FormEvent<HTMLFormElement>) => void;
  onSetCareTaskForm: (form: CareTaskForm) => void;
  onSetCompletionDate: (date: string) => void;
  editingCareEventId?: string;
  form: CareForm;
  headingRef: RefObject<HTMLHeadingElement | null>;
  isFormOpen: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onEdit: (event: CareEvent) => void;
  onRemove: (event: CareEvent) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSetForm: (form: CareForm) => void;
}) {
  return (
    <section className="management-section care-workspace" aria-labelledby="care-workspace-heading">
      <div className="section-header">
        <div>
          <p className="section-eyebrow">Garden records</p>
          <h2 id="care-workspace-heading" ref={headingRef} tabIndex={-1}>Care</h2>
          <p className="section-context">{garden.name}</p>
        </div>
      </div>
      <div aria-label="Care views" className="care-tabs" role="tablist">
        <button
          aria-selected={view === "tasks"}
          className="text-button"
          onClick={() => onChangeView("tasks")}
          role="tab"
          type="button"
        >
          Tasks
        </button>
        <button
          aria-selected={view === "history"}
          className="text-button"
          onClick={() => onChangeView("history")}
          role="tab"
          type="button"
        >
          History
        </button>
      </div>
      {view === "tasks" ? (
        <CareTasks
          garden={garden}
          form={careTaskForm}
          completingCareTaskId={completingCareTaskId}
          completionDate={completionDate}
          editingCareTaskId={editingCareTaskId}
          isFormOpen={isCareTaskFormOpen}
          onAdd={onAddTask}
          onCancel={onCancelTask}
          onCancelCompletion={onCancelCompletion}
          onComplete={onCompleteTask}
          onEdit={onEditTask}
          onRemove={onRemoveTask}
          onSave={onSaveTask}
          onSaveCompletion={onSaveCompletion}
          onSetCompletionDate={onSetCompletionDate}
          onSetForm={onSetCareTaskForm}
        />
      ) : (
        <CareLog
          garden={garden}
          editingCareEventId={editingCareEventId}
          form={form}
          isFormOpen={isFormOpen}
          onAdd={onAdd}
          onCancel={onCancel}
          onEdit={onEdit}
          onRemove={onRemove}
          onSave={onSave}
          onSetForm={onSetForm}
        />
      )}
    </section>
  );
}

function CareTasks({
  garden,
  form,
  completingCareTaskId,
  completionDate,
  editingCareTaskId,
  isFormOpen,
  onAdd,
  onCancel,
  onCancelCompletion,
  onComplete,
  onEdit,
  onRemove,
  onSave,
  onSaveCompletion,
  onSetCompletionDate,
  onSetForm,
}: {
  garden: Garden;
  form: CareTaskForm;
  completingCareTaskId?: string;
  completionDate: string;
  editingCareTaskId?: string;
  isFormOpen: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onCancelCompletion: () => void;
  onComplete: (task: CareTask) => void;
  onEdit: (task: CareTask) => void;
  onRemove: (task: CareTask) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSaveCompletion: (event: FormEvent<HTMLFormElement>) => void;
  onSetCompletionDate: (date: string) => void;
  onSetForm: (form: CareTaskForm) => void;
}) {
  const historicalTarget = garden.careTasks.find(
    (task) => task.id === editingCareTaskId,
  );
  const hasTaskChanges = Boolean(
    historicalTarget && (
      form.type !== historicalTarget.type ||
      form.dueDate !== historicalTarget.dueDate ||
      form.note !== historicalTarget.note ||
      form.targetScope !== historicalTarget.targetScope ||
      form.growingAreaId !== (historicalTarget.growingAreaId ?? "") ||
      form.plantingRecordId !== (historicalTarget.plantingRecordId ?? "") ||
      form.repeatIntervalDays !== String(historicalTarget.repeatIntervalDays ?? "")
    ),
  );
  const completingTask = garden.careTasks.find(
    (task) => task.id === completingCareTaskId,
  );
  const today = todayDate();
  const groups = [
    ["overdue", "Overdue"],
    ["due-today", "Due today"],
    ["upcoming", "Upcoming"],
  ] as const;

  return (
    <section className="care-view" aria-labelledby="care-tasks-heading">
      <div className="care-view-header">
        <h3 id="care-tasks-heading">Tasks</h3>
        <button className="primary-button" onClick={onAdd} type="button">Add task</button>
      </div>
      {isFormOpen ? (
        <form className="care-form" onSubmit={onSave}>
          <h3>{editingCareTaskId ? "Edit care task" : "Add care task"}</h3>
          <div className="field">
            <label htmlFor="care-task-type">Care type</label>
            <select
              id="care-task-type"
              onChange={(event) => onSetForm({ ...form, type: event.target.value as CareEventType })}
              value={form.type}
            >
              <option value="watering">Watering</option>
              <option value="fertilizing">Fertilizing</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="care-task-due-date">Due date</label>
            <input
              autoFocus
              id="care-task-due-date"
              onChange={(event) => onSetForm({ ...form, dueDate: event.target.value })}
              required
              type="date"
              value={form.dueDate}
            />
          </div>
          <CareTargetSelect
            form={form}
            garden={garden}
            historicalTarget={historicalTarget}
            onSetForm={onSetForm}
          />
          <div className="field">
            <label htmlFor="care-task-repeat">Repeat every whole days (optional)</label>
            <input
              id="care-task-repeat"
              min="1"
              onChange={(event) => onSetForm({ ...form, repeatIntervalDays: event.target.value })}
              step="1"
              type="number"
              value={form.repeatIntervalDays}
            />
          </div>
          <div className="field care-note-field">
            <label htmlFor="care-task-note">Note (optional)</label>
            <input
              id="care-task-note"
              onChange={(event) => onSetForm({ ...form, note: event.target.value })}
              value={form.note}
            />
          </div>
          <div className="form-actions">
            {editingCareTaskId
              ? hasTaskChanges ? <button className="primary-button" type="submit">Save care task</button> : null
              : <button className="primary-button" type="submit">Add care task</button>}
            <button className="secondary-button" onClick={onCancel} type="button">Cancel</button>
          </div>
        </form>
      ) : null}
      {completingTask ? (
        <form className="care-completion-form" onSubmit={onSaveCompletion}>
          <h3>Complete {completingTask.type === "watering" ? "watering" : "fertilizing"} task</h3>
          <div className="field">
            <label htmlFor="care-task-completion-date">Completion date</label>
            <input
              id="care-task-completion-date"
              onChange={(event) => onSetCompletionDate(event.target.value)}
              required
              type="date"
              value={completionDate}
            />
          </div>
          <div className="form-actions">
            <button className="primary-button" type="submit">Complete task</button>
            <button className="secondary-button" onClick={onCancelCompletion} type="button">Cancel</button>
          </div>
        </form>
      ) : null}
      {groups.map(([status, label]) => {
        const tasks = garden.careTasks
          .filter((task) => careTaskStatus(task, today) === status)
          .sort((left, right) => left.dueDate.localeCompare(right.dueDate));
        return (
          <section className="care-task-group" key={status} aria-labelledby={`care-task-${status}`}>
            <h4 id={`care-task-${status}`}>{label}</h4>
            {tasks.length ? (
              <ul className="care-event-list">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <div>
                      <strong>{task.type === "watering" ? "Watering" : "Fertilizing"}</strong>
                      <p>
                        Due {task.dueDate} · {careTargetLabel(task, garden.name)}
                        {task.repeatIntervalDays ? ` · Repeats every ${task.repeatIntervalDays} days` : ""}
                        {task.note ? ` · ${task.note}` : ""}
                      </p>
                    </div>
                    <div className="area-actions">
                      <button className="primary-button" onClick={() => onComplete(task)} type="button">Complete</button>
                      <button className="text-button" onClick={() => onEdit(task)} type="button">Edit</button>
                      <button className="remove-button" onClick={() => onRemove(task)} type="button">Remove</button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="section-context">No {label.toLowerCase()} tasks.</p>
            )}
          </section>
        );
      })}
    </section>
  );
}

function CareTargetSelect({
  form,
  garden,
  historicalTarget,
  onSetForm,
}: {
  form: CareTaskForm;
  garden: Garden;
  historicalTarget?: CareTask;
  onSetForm: (form: CareTaskForm) => void;
}) {
  return (
    <div className="field">
      <label htmlFor="care-task-target">Target</label>
      <select
        id="care-task-target"
        onChange={(event) => {
          const [targetScope, targetId] = event.target.value.split(":");
          onSetForm({
            ...form,
            targetScope: targetScope as CareEventTargetScope,
            growingAreaId: targetScope === "planting-area" ? targetId : "",
            plantingRecordId: targetScope === "plant-group" ? targetId : "",
          });
        }}
        value={form.targetScope === "all-gardens" || form.targetScope === "garden" ? form.targetScope : `${form.targetScope}:${form.targetScope === "planting-area" ? form.growingAreaId : form.plantingRecordId}`}
      >
        <option value={garden.id === "all-gardens" ? "all-gardens" : "garden"}>{garden.name}</option>
        <optgroup label="Planting areas">
          {historicalTarget?.targetScope === "planting-area" &&
          historicalTarget.growingAreaId === form.growingAreaId &&
          !garden.growingAreas.some((area) => area.id === form.growingAreaId) ? (
            <option value={`planting-area:${form.growingAreaId}`}>Former planting area: {historicalTarget.growingAreaName}</option>
          ) : null}
          {garden.growingAreas.map((area) => (
            <option key={area.id} value={`planting-area:${area.id}`}>{area.name}</option>
          ))}
        </optgroup>
        <optgroup label="Plant groups">
          {historicalTarget?.targetScope === "plant-group" &&
          historicalTarget.plantingRecordId === form.plantingRecordId &&
          !garden.plantings.some((planting) => planting.id === form.plantingRecordId) ? (
            <option value={`plant-group:${form.plantingRecordId}`}>Former plant group: {historicalTarget.plantingRecordName}</option>
          ) : null}
          {garden.plantings.map((planting) => (
            <option key={planting.id} value={`plant-group:${planting.id}`}>{plantGroupDisplayName(planting, garden)}</option>
          ))}
        </optgroup>
      </select>
    </div>
  );
}

function CareLog({
  garden,
  editingCareEventId,
  form,
  isFormOpen,
  onAdd,
  onCancel,
  onEdit,
  onRemove,
  onSave,
  onSetForm,
}: {
  garden: Garden;
  editingCareEventId?: string;
  form: CareForm;
  isFormOpen: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onEdit: (event: CareEvent) => void;
  onRemove: (event: CareEvent) => void;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSetForm: (form: CareForm) => void;
}) {
  const historicalTarget = garden.careEvents.find(
    (event) => event.id === editingCareEventId,
  );
  const hasEventChanges = Boolean(
    historicalTarget && (
      form.type !== historicalTarget.type ||
      form.date !== historicalTarget.date ||
      form.note !== historicalTarget.note ||
      form.targetScope !== historicalTarget.targetScope ||
      form.growingAreaId !== (historicalTarget.growingAreaId ?? "") ||
      form.plantingRecordId !== (historicalTarget.plantingRecordId ?? "") ||
      form.fertilizerProduct !== (historicalTarget.fertilizerProduct ?? "") ||
      form.fertilizerAmount !== String(historicalTarget.fertilizerAmount ?? "") ||
      form.fertilizerUnit !== (historicalTarget.fertilizerUnit ?? "")
    ),
  );
  const events = [...garden.careEvents].sort((left, right) =>
    right.date.localeCompare(left.date),
  );

  return (
    <section className="care-view care-log" aria-labelledby="care-history-heading">
      <div className="care-view-header">
        <h3 id="care-history-heading">History</h3>
        <button className="primary-button" onClick={onAdd} type="button">
          Add care event
        </button>
      </div>
      {isFormOpen ? (
        <form className="care-form" onSubmit={onSave}>
          <h3>{editingCareEventId ? "Edit care event" : "Add care event"}</h3>
          <div className="field">
            <label htmlFor="care-type">Care type</label>
            <select
              id="care-type"
              onChange={(event) =>
                onSetForm({ ...form, type: event.target.value as CareEventType })
              }
              value={form.type}
            >
              <option value="watering">Watering</option>
              <option value="fertilizing">Fertilizing</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="care-date">Date</label>
            <input
              autoFocus
              id="care-date"
              onChange={(event) => onSetForm({ ...form, date: event.target.value })}
              type="date"
              value={form.date}
            />
          </div>
          <div className="field">
            <label htmlFor="care-target">Target</label>
            <select
              id="care-target"
              onChange={(event) => {
                const [targetScope, targetId] = event.target.value.split(":");
                onSetForm({
                  ...form,
                  targetScope: targetScope as CareEventTargetScope,
                  growingAreaId:
                    targetScope === "planting-area" ? targetId : "",
                  plantingRecordId:
                    targetScope === "plant-group" ? targetId : "",
                });
              }}
              value={
                form.targetScope === "all-gardens" || form.targetScope === "garden"
                  ? form.targetScope
                  : `${form.targetScope}:${form.targetScope === "planting-area" ? form.growingAreaId : form.plantingRecordId}`
              }
            >
              <option value={garden.id === "all-gardens" ? "all-gardens" : "garden"}>{garden.name}</option>
              <optgroup label="Planting areas">
                {historicalTarget?.targetScope === "planting-area" &&
                  historicalTarget.growingAreaId === form.growingAreaId &&
                  !garden.growingAreas.some(
                    (area) => area.id === form.growingAreaId,
                  ) ? (
                  <option value={`planting-area:${form.growingAreaId}`}>
                    Former planting area: {historicalTarget.growingAreaName}
                  </option>
                ) : null}
                {garden.growingAreas.map((area) => (
                  <option key={area.id} value={`planting-area:${area.id}`}>
                    {area.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Plant groups">
                {historicalTarget?.targetScope === "plant-group" &&
                  historicalTarget.plantingRecordId === form.plantingRecordId &&
                  !garden.plantings.some(
                    (planting) => planting.id === form.plantingRecordId,
                  ) ? (
                  <option value={`plant-group:${form.plantingRecordId}`}>
                    Former plant group: {historicalTarget.plantingRecordName}
                  </option>
                ) : null}
                {garden.plantings.map((planting) => (
                  <option key={planting.id} value={`plant-group:${planting.id}`}>
                    {plantGroupDisplayName(planting, garden)}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
          {form.type === "fertilizing" ? (
            <>
              <div className="field">
                <label htmlFor="fertilizer-product">Fertilizer product (optional)</label>
                <input
                  id="fertilizer-product"
                  onChange={(event) => onSetForm({ ...form, fertilizerProduct: event.target.value })}
                  value={form.fertilizerProduct}
                />
              </div>
              <div className="field">
                <label htmlFor="fertilizer-amount">Fertilizer amount (optional)</label>
                <input
                  id="fertilizer-amount"
                  min="0.01"
                  onChange={(event) => onSetForm({ ...form, fertilizerAmount: event.target.value })}
                  step="any"
                  type="number"
                  value={form.fertilizerAmount}
                />
              </div>
              <div className="field">
                <label htmlFor="fertilizer-unit">Fertilizer unit (optional)</label>
                <input
                  id="fertilizer-unit"
                  onChange={(event) => onSetForm({ ...form, fertilizerUnit: event.target.value })}
                  placeholder="e.g. g, tbsp, mL"
                  value={form.fertilizerUnit}
                />
              </div>
            </>
          ) : null}
          <div className="field care-note-field">
            <label htmlFor="care-note">Note (optional)</label>
            <input
              id="care-note"
              onChange={(event) => onSetForm({ ...form, note: event.target.value })}
              value={form.note}
            />
          </div>
          <div className="form-actions">
            {editingCareEventId
              ? hasEventChanges ? <button className="primary-button" type="submit">Save care event</button> : null
              : <button className="primary-button" type="submit">Add care event</button>}
            <button className="secondary-button" onClick={onCancel} type="button">
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {events.length ? (
        <ul className="care-event-list">
          {events.map((event) => (
            <li key={event.id}>
              <div>
                <strong>{event.type === "watering" ? "Watering" : "Fertilizing"}</strong>
                <p>
                  {event.date} · {careTargetLabel(event, garden.name)}
                  {event.type === "fertilizing" && careFertilizerDetails(event)
                    ? ` · ${careFertilizerDetails(event)}`
                    : ""}
                  {event.note ? ` · ${event.note}` : ""}
                </p>
              </div>
              <div className="area-actions">
                <button className="text-button" onClick={() => onEdit(event)} type="button">
                  Correct record
                </button>
                <button className="remove-button" onClick={() => onRemove(event)} type="button">
                  Delete record
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-areas">
          <h3>No care events yet</h3>
          <p>Record completed watering or fertilizing for {garden.name}.</p>
        </div>
      )}
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

type CareForm = {
  type: CareEventType;
  date: string;
  note: string;
  targetScope: CareEventTargetScope;
  growingAreaId: string;
  plantingRecordId: string;
  fertilizerProduct: string;
  fertilizerAmount: string;
  fertilizerUnit: string;
};

type CareTaskForm = {
  type: CareEventType;
  dueDate: string;
  note: string;
  targetScope: CareEventTargetScope;
  growingAreaId: string;
  plantingRecordId: string;
  repeatIntervalDays: string;
};

function emptyCareForm(targetScope: CareEventTargetScope = "garden"): CareForm {
  return {
    type: "watering",
    date: "",
    note: "",
    targetScope,
    growingAreaId: "",
    plantingRecordId: "",
    fertilizerProduct: "",
    fertilizerAmount: "",
    fertilizerUnit: "",
  };
}

function emptyCareTaskForm(targetScope: CareEventTargetScope = "garden"): CareTaskForm {
  return {
    type: "watering",
    dueDate: "",
    note: "",
    targetScope,
    growingAreaId: "",
    plantingRecordId: "",
    repeatIntervalDays: "",
  };
}

function careTargetLabel(event: CareEvent | CareTask, gardenName?: string) {
  if (event.targetScope === "all-gardens") return "All gardens";
  if (event.targetScope === "garden") return gardenName ?? "Garden";
  if (event.targetScope === "plant-group")
    return event.targetPlantingRecordDeleted
      ? `Former plant group: ${event.plantingRecordName}`
      : event.plantingRecordName ?? "Plant group";
  return event.targetAreaDeleted
    ? `Former planting area: ${event.growingAreaName}`
    : event.growingAreaName ?? "Planting area";
}

function plantGroupDisplayName(planting: PlantingRecord, garden: Garden) {
  const area = garden.growingAreas.find(
    (candidate) => candidate.id === planting.growingAreaId,
  );
  return `${plantDisplayName({ plantType: planting.plantType, variety: planting.variety, fallback: planting.commonName })} · ${area?.name ?? "Planting area"}`;
}

function careFertilizerDetails(event: CareEvent) {
  const amount =
    event.fertilizerAmount === undefined
      ? undefined
      : `${event.fertilizerAmount}${event.fertilizerUnit ? ` ${event.fertilizerUnit}` : ""}`;
  return [
    event.fertilizerProduct,
    amount,
    amount ? undefined : event.fertilizerUnit,
  ]
    .filter(Boolean)
    .join(" · ");
}

function isCalendarDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function createId(prefix: string) {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}
