"use client";

import { useEffect, useRef, useState } from "react";

import { createSeasonAllocation, SeasonAllocationError } from "@/lib/gardenWorkspaceApi";
import type { Garden } from "@/lib/gardenWorkspace";
import {
  allocationCrops,
  allocationRequestBody,
  cropLabel,
  eligibleAllocationAreas,
  isAllocationDraftStale,
  MAX_ALLOCATION_AREAS,
  MAX_ALLOCATION_PREFERENCE,
  needsAreaChoice,
  nextSeasonYear,
  selectedAllocationAreaIds,
  type AllocationCropKey,
  type AllocationInput,
  type SeasonAllocationResult,
} from "@/lib/seasonAllocation";

export const PUBLIC_DEMO_GARDEN_ID = "demo-garden";

export type AllocationConfirmOutcome =
  | { status: "added"; added: number; skipped: number; seasonYear: number }
  | { status: "stale" };

const statusMessages: Record<Exclude<SeasonAllocationResult["status"], "draft" | "needs_input">, string> = {
  budget_exhausted: "The portfolio demo has used its AI run budget. No plan was created.",
  provider_unavailable: "The AI planner is not available right now. No plan was created.",
  generation_failed: "The AI planner could not produce a usable plan. No plan was created.",
};

const failureReasons: Record<string, string> = {
  step_limit: "It used all five model requests without finishing.",
  output_limit: "Its answer was cut off at the output limit.",
  input_limit: "The conversation grew past the request size limit.",
  invalid_final: "Its final answer did not place every selected crop in a selected area.",
  refusal: "The model declined to answer.",
  empty_output: "The model returned an empty answer.",
  incomplete_output: "The model stopped before finishing.",
  multiple_tool_calls: "The model asked for several tools at once.",
  malformed_response: "The model service returned a response this app could not read.",
};

type AllocationAssistantProps = {
  garden: Garden;
  workspaceId?: string;
  isPortfolioDemo: boolean | undefined;
  isSynced: boolean;
  onConfirm: (gardenId: string, draft: SeasonAllocationResult, input: AllocationInput) => AllocationConfirmOutcome;
};

/**
 * One panel per workspace and garden. The key remounts the panel when either
 * changes, so a draft, choices, or a request from the previous workspace
 * cannot carry over.
 */
export function AllocationAssistant(props: AllocationAssistantProps) {
  return <AllocationAssistantPanel key={`${props.workspaceId ?? ""}\u0000${props.garden.id}`} {...props} />;
}

function AllocationAssistantPanel({
  garden,
  workspaceId,
  isPortfolioDemo,
  isSynced,
  onConfirm,
}: AllocationAssistantProps) {
  const [crops, setCrops] = useState<AllocationCropKey[]>([]);
  const [preference, setPreference] = useState("");
  const [chosenAreaIds, setChosenAreaIds] = useState<string[]>([]);
  const [isPlanning, setIsPlanning] = useState(false);
  const [result, setResult] = useState<SeasonAllocationResult>();
  const [requestError, setRequestError] = useState<string>();
  const [confirmation, setConfirmation] = useState<AllocationConfirmOutcome>();
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | undefined>(undefined);

  // Leaving the panel, including the remount on a workspace or garden change,
  // discards a response still on its way.
  useEffect(() => {
    return () => {
      requestIdRef.current += 1;
      abortRef.current?.abort();
    };
  }, []);

  const headingId = `allocation-assistant-${garden.id}`;
  const input: AllocationInput = { crops, preference, chosenAreaIds };
  const eligibleAreas = eligibleAllocationAreas(garden);
  const choosesAreas = needsAreaChoice(garden);
  const selectedAreaIds = selectedAllocationAreaIds(garden, chosenAreaIds);
  const requestWorkspaceId = isPortfolioDemo ? (workspaceId ?? "portfolio-demo") : workspaceId;

  const blocker =
    isPortfolioDemo === undefined
      ? "Checking whether the AI planner is available…"
      : isPortfolioDemo && garden.id !== PUBLIC_DEMO_GARDEN_ID
        ? "In the portfolio demo, the Allocation Assistant plans the Demo Garden only."
        : !eligibleAreas.length
          ? "Add a raised bed, in-ground area, or container group to plan with the Allocation Assistant."
          : !isPortfolioDemo && !workspaceId
            ? "The Allocation Assistant works once this workspace is saved to the garden server."
            : undefined;
  const waitingForSave = !isPortfolioDemo && !isSynced;
  const canPlan =
    !blocker &&
    !waitingForSave &&
    !isPlanning &&
    crops.length > 0 &&
    selectedAreaIds.length > 0 &&
    selectedAreaIds.length <= MAX_ALLOCATION_AREAS;

  const draft = result?.status === "draft" ? result : undefined;
  const isStale = draft ? isAllocationDraftStale(draft, garden, input, nextSeasonYear()) : false;
  const isConfirmed = confirmation?.status === "added";

  const plan = async () => {
    if (!canPlan || !requestWorkspaceId) return;
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsPlanning(true);
    setResult(undefined);
    setRequestError(undefined);
    setConfirmation(undefined);
    try {
      const response = await createSeasonAllocation(
        requestWorkspaceId,
        garden.id,
        allocationRequestBody(garden, input),
        controller.signal,
      );
      if (requestId === requestIdRef.current) setResult(response);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setRequestError(
        error instanceof SeasonAllocationError ? error.message : "The Allocation Assistant request failed. Nothing was changed.",
      );
    } finally {
      if (requestId === requestIdRef.current) setIsPlanning(false);
    }
  };

  const confirm = () => {
    if (!draft || isStale || isConfirmed) return;
    setConfirmation(onConfirm(garden.id, draft, input));
  };

  const toggleCrop = (key: AllocationCropKey) =>
    setCrops((current) => (current.includes(key) ? current.filter((crop) => crop !== key) : [...current, key]));
  const toggleArea = (areaId: string) =>
    setChosenAreaIds((current) =>
      current.includes(areaId) ? current.filter((id) => id !== areaId) : [...current, areaId],
    );

  return (
    <section aria-labelledby={headingId} className="allocation-assistant">
      <div>
        <p className="section-eyebrow">AI planning · {garden.name}</p>
        <h3 id={headingId}>Allocation Assistant</h3>
        <p className="allocation-context">
          Choose crops for next season. The assistant checks each placement against this garden&apos;s crop
          rotation history and returns a draft. Nothing is added until you confirm.
        </p>
      </div>

      {blocker ? (
        <p className="allocation-notice">{blocker}</p>
      ) : (
        <form
          className="allocation-form"
          onSubmit={(event) => {
            event.preventDefault();
            void plan();
          }}
        >
          <fieldset className="allocation-choices">
            <legend>Crops</legend>
            {allocationCrops.map((crop) => (
              <label key={crop.key}>
                <input
                  checked={crops.includes(crop.key)}
                  onChange={() => toggleCrop(crop.key)}
                  type="checkbox"
                />
                {crop.label}
              </label>
            ))}
          </fieldset>

          {choosesAreas ? (
            <fieldset className="allocation-choices">
              <legend>Planting areas (up to {MAX_ALLOCATION_AREAS})</legend>
              {eligibleAreas.map((area) => (
                <label key={area.id}>
                  <input
                    checked={chosenAreaIds.includes(area.id)}
                    disabled={!chosenAreaIds.includes(area.id) && chosenAreaIds.length >= MAX_ALLOCATION_AREAS}
                    onChange={() => toggleArea(area.id)}
                    type="checkbox"
                  />
                  {area.name}
                </label>
              ))}
            </fieldset>
          ) : (
            <p className="allocation-areas">
              <strong>Planting areas</strong>
              <span>{eligibleAreas.map((area) => area.name).join(" · ")}</span>
            </p>
          )}

          <div className="field">
            <label htmlFor={`${headingId}-preference`}>Preference (optional)</label>
            <textarea
              aria-describedby={`${headingId}-preference-count`}
              id={`${headingId}-preference`}
              maxLength={MAX_ALLOCATION_PREFERENCE}
              onChange={(event) => setPreference(event.target.value)}
              placeholder="e.g. Put the lettuce in the containers"
              rows={2}
              value={preference}
            />
            <span className="allocation-count" id={`${headingId}-preference-count`}>
              {preference.length}/{MAX_ALLOCATION_PREFERENCE} characters
            </span>
          </div>

          <div className="form-actions">
            <button className="primary-button" disabled={!canPlan} type="submit">
              {isPlanning ? "Planning…" : "Plan with AI"}
            </button>
          </div>
          {waitingForSave ? (
            <p className="allocation-notice">Waiting for your latest changes to save before planning.</p>
          ) : null}
          {isPlanning ? (
            <p className="allocation-notice" role="status">
              Planning can take up to two minutes. The steps appear when the plan is ready.
            </p>
          ) : null}
        </form>
      )}

      {requestError ? (
        <p className="allocation-error" role="alert">
          {requestError}
        </p>
      ) : null}

      {result && result.status === "needs_input" ? (
        <div className="allocation-error" role="alert">
          <strong>More input needed</strong>
          <ul>
            {result.missingInputs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result && result.status !== "draft" && result.status !== "needs_input" ? (
        <div className="allocation-error" role="alert">
          <p>{statusMessages[result.status]}</p>
          {result.failureReason ? <p>{failureReasons[result.failureReason] ?? result.failureReason}</p> : null}
        </div>
      ) : null}

      {draft?.scope ? (
        <section aria-label="Draft allocation" className="allocation-draft">
          <strong>Draft for {draft.scope.seasonYear}</strong>
          <ul className="allocation-draft-areas">
            {draft.scope.areas.map((area) => {
              const assigned = draft.allocation.filter((assignment) => assignment.growingAreaId === area.id);
              return (
                <li key={area.id}>
                  <strong>{area.name}</strong>
                  <span>{assigned.length ? assigned.map((item) => cropLabel(item.crop)).join(" · ") : "Nothing planned"}</span>
                  {draft.warnings
                    .filter((warning) => warning.growingAreaId === area.id)
                    .map((warning) => (
                      <span className="allocation-warning" key={warning.crop}>
                        Rotation warning: {cropLabel(warning.crop)} is {warning.rotationGroup}, grown here in{" "}
                        {warning.repeatedYears.join(", ")}.
                      </span>
                    ))}
                </li>
              );
            })}
          </ul>
          {draft.explanation ? (
            <p className="allocation-explanation">
              <strong>AI explanation</strong>
              <span>{draft.explanation}</span>
            </p>
          ) : null}
          <div className="form-actions">
            <button className="primary-button" disabled={isStale || isConfirmed} onClick={confirm} type="button">
              Add to {draft.scope.seasonYear} plan
            </button>
          </div>
          {isStale && !isConfirmed ? (
            <p className="allocation-notice">
              The garden or your choices changed after this draft was made. Plan again to use them.
            </p>
          ) : null}
          {confirmation?.status === "stale" ? (
            <p className="allocation-notice">This draft is out of date. Plan again before adding it.</p>
          ) : null}
          {confirmation?.status === "added" ? (
            <p className="allocation-confirmed" role="status">
              Added {confirmation.added}, skipped {confirmation.skipped} already in the {confirmation.seasonYear} plan.
            </p>
          ) : null}
        </section>
      ) : null}

      {result?.trace.length ? (
        <section aria-label="Agent steps" className="allocation-trace">
          <strong>Agent steps</strong>
          <ol>
            {result.trace.map((step) => (
              <li key={step.step}>
                <span className="allocation-trace-tool">
                  Step {step.step} · {step.tool}
                </span>
                <code>{typeof step.args === "string" ? step.args : JSON.stringify(step.args)}</code>
                <span>{step.shortResult}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </section>
  );
}
