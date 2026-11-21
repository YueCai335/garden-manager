/**
 * The five care types (ADR-0085). This module has no imports, so `next.config.ts` can reach it
 * through `workspaceRoutes.ts` without loading the whole workspace model.
 */
export const careEventTypes = ["watering", "fertilizing", "planting", "pruning", "pest-treatment"] as const;
export type CareEventType = (typeof careEventTypes)[number];
