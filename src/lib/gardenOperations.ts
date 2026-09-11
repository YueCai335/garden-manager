import type {
  Garden,
  GardenWorkspace,
  PlannedPlanting,
  SeasonPlan,
} from "@/lib/gardenWorkspace";

/**
 * Pure garden/workspace edits. Each function takes the current value and
 * returns a new one, so callers never patch related records by hand and
 * every rule here can be unit tested without React.
 */

function markDeletedTargets<
  T extends {
    targetScope: string;
    growingAreaId?: string;
    plantingRecordId?: string;
    targetAreaDeleted?: boolean;
    targetPlantingRecordDeleted?: boolean;
  },
>(items: T[], areaId: string, plantingIds: Set<string>): T[] {
  return items.map((item) =>
    item.targetScope === "planting-area" && item.growingAreaId === areaId
      ? { ...item, targetAreaDeleted: true }
      : item.targetScope === "plant-group" &&
          item.plantingRecordId !== undefined &&
          plantingIds.has(item.plantingRecordId)
        ? { ...item, targetPlantingRecordDeleted: true }
        : item,
  );
}

function withoutEmptyPlans(plans: SeasonPlan[]): SeasonPlan[] {
  return plans.filter((plan) => plan.plantings.length > 0);
}

/** Remove a growing area together with every record that references it. */
export function removeGrowingArea(garden: Garden, areaId: string): Garden {
  const plantingIds = new Set(
    garden.plantings
      .filter((planting) => planting.growingAreaId === areaId)
      .map((planting) => planting.id),
  );
  return {
    ...garden,
    growingAreas: garden.growingAreas.filter((area) => area.id !== areaId),
    plantings: garden.plantings.filter((planting) => planting.growingAreaId !== areaId),
    careEvents: markDeletedTargets(garden.careEvents, areaId, plantingIds),
    careTasks: markDeletedTargets(garden.careTasks, areaId, plantingIds),
    healthRecords: markDeletedTargets(garden.healthRecords, areaId, plantingIds),
    ...(garden.seasonPlans
      ? {
          seasonPlans: withoutEmptyPlans(
            garden.seasonPlans.map((plan) => ({
              ...plan,
              plantings: plan.plantings.filter((planting) => planting.growingAreaId !== areaId),
            })),
          ),
        }
      : {}),
  };
}

/** Remove a garden; returns undefined when it was the last one. */
export function removeGarden(
  workspace: GardenWorkspace,
  gardenId: string,
): GardenWorkspace | undefined {
  const gardens = workspace.gardens.filter((garden) => garden.id !== gardenId);
  if (!gardens.length) return undefined;
  return {
    ...workspace,
    selectedGardenId:
      workspace.selectedGardenId === gardenId ? gardens[0].id : workspace.selectedGardenId,
    gardens,
  };
}

export function archivePlanting(garden: Garden, plantingId: string): Garden {
  return {
    ...garden,
    plantings: garden.plantings.map((planting) =>
      planting.id === plantingId ? { ...planting, isActive: false } : planting,
    ),
  };
}

export function addSeasonPlanPlanting(
  garden: Garden,
  seasonYear: number,
  planting: PlannedPlanting,
  createPlanId: () => string = () => `season-plan-${seasonYear}-${planting.id}`,
): Garden {
  const plans = garden.seasonPlans ?? [];
  const existing = plans.find((plan) => plan.seasonYear === seasonYear);
  return {
    ...garden,
    seasonPlans: existing
      ? plans.map((plan) =>
          plan.id === existing.id ? { ...plan, plantings: [...plan.plantings, planting] } : plan,
        )
      : [...plans, { id: createPlanId(), seasonYear, plantings: [planting] }],
  };
}

export function removeSeasonPlanPlanting(
  garden: Garden,
  seasonYear: number,
  plantingId: string,
): Garden {
  return {
    ...garden,
    seasonPlans: withoutEmptyPlans(
      (garden.seasonPlans ?? []).map((plan) =>
        plan.seasonYear === seasonYear
          ? { ...plan, plantings: plan.plantings.filter((planting) => planting.id !== plantingId) }
          : plan,
      ),
    ),
  };
}
