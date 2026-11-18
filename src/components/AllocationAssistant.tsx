"use client";

import { FeedbackForm, FormField } from "@/components/forms/FormFeedback";

import { useWorkspaceDraft, useUnsavedDraft } from "@/components/workspace/WorkspaceProvider";

import { useEffect, useMemo, useRef, useState } from "react";

import recordedExampleRun from "@/data/exampleAllocationRun.json";
import { createSeasonAllocation, SeasonAllocationError } from "@/lib/gardenWorkspaceApi";
import type { Garden } from "@/lib/gardenWorkspace";
import { seasonPlantColors } from "@/lib/seasonPlanner";
import { PlantChip } from "@/components/season/PlantChip";
import styles from "@/components/season/PlanWithAi.module.css";
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
  type AllocationTraceStep,
  type ExampleAllocationRun,
  type SeasonAllocationResult,
} from "@/lib/seasonAllocation";

export const PUBLIC_DEMO_GARDEN_ID = "demo-garden";

// null until a real run is recorded (backend/scripts/agent_live.py example).
const defaultExampleRun = recordedExampleRun as unknown as ExampleAllocationRun | null;

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
  exampleRun?: ExampleAllocationRun | null;
  /** The drawer title that names this panel (ADR-0082). Without it the panel is named "Plan with AI". */
  labelledBy?: string;
  /** The page's plant colours, so the drawer reuses them instead of working them out again. */
  plantColors?: ColorOf;
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
  exampleRun = defaultExampleRun,
  labelledBy,
  plantColors,
}: AllocationAssistantProps) {
  const [crops, setCrops] = useWorkspaceDraft<AllocationCropKey[]>(`allocation:${workspaceId ?? "local"}:${garden.id}:crops`, []);
  const [preference, setPreference] = useWorkspaceDraft(`allocation:${workspaceId ?? "local"}:${garden.id}:preference`, "");
  const [chosenAreaIds, setChosenAreaIds] = useWorkspaceDraft<string[]>(`allocation:${workspaceId ?? "local"}:${garden.id}:chosenAreaIds`, []);
  const [isPlanning, setIsPlanning] = useState(false);
  const [result, setResult] = useWorkspaceDraft<SeasonAllocationResult | undefined>(`allocation:${workspaceId ?? "local"}:${garden.id}:result`, undefined);
  const [requestError, setRequestError] = useWorkspaceDraft<string | undefined>(`allocation:${workspaceId ?? "local"}:${garden.id}:requestError`, undefined);
  const [confirmation, setConfirmation] = useWorkspaceDraft<AllocationConfirmOutcome | undefined>(`allocation:${workspaceId ?? "local"}:${garden.id}:confirmation`, undefined);
  const [showExample, setShowExample] = useWorkspaceDraft(`allocation:${workspaceId ?? "local"}:${garden.id}:showExample`, false);
  useUnsavedDraft(`allocation:${workspaceId ?? "local"}:${garden.id}`, Boolean((crops.length || preference || result) && confirmation?.status !== "added"));
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
  const ownColors = useMemo(() => (plantColors ? undefined : seasonPlantColors(garden)), [plantColors, garden]);
  const colorOf = plantColors ?? ownColors!;
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
  // Live runs are closed in the public demo (ADR-0057), so the recorded run is
  // offered up front instead of only after a request that cannot succeed.
  const offersDemoExample = Boolean(isPortfolioDemo && !blocker && exampleRun);
  const exampleToggle = (
    <button className={styles.textButton} onClick={() => setShowExample((shown) => !shown)} type="button">
      {showExample ? "Hide example run" : "View example run"}
    </button>
  );

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
    setShowExample(false);
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
    <section aria-labelledby={labelledBy} aria-label={labelledBy ? undefined : "Plan with AI"} className={styles.assistant}>
      {offersDemoExample ? (
        <div className={styles.demoNote}>
          <p className={styles.notice}>
            Live AI runs are closed in the public demo. A real run recorded on this garden shows how the
            assistant works.
          </p>
          {exampleToggle}
        </div>
      ) : null}

      {blocker ? (
        <p className={styles.notice}>{blocker}</p>
      ) : (
        <FeedbackForm
          error={requestError}
          notice={isConfirmed ? "" : undefined}
          validate={() => ({
            [`${headingId}-crop-${allocationCrops[0].key}`]: !crops.length ? "Choose at least one crop." : undefined,
            [`${headingId}-area-${eligibleAreas[0]?.id}`]: choosesAreas && (!selectedAreaIds.length || selectedAreaIds.length > MAX_ALLOCATION_AREAS) ? `Choose between 1 and ${MAX_ALLOCATION_AREAS} planting areas.` : undefined,
          })}
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            void plan();
          }}
        >
          <fieldset className={styles.choices} aria-describedby={`${headingId}-crop-help`} aria-invalid={!crops.length}>
            <legend>Crops</legend>
            {!crops.length && <p className={styles.help} id={`${headingId}-crop-help`}>Choose at least one crop before planning.</p>}
            <div className={styles.pills}>
              {allocationCrops.map((crop) => {
                const colors = colorOf({ commonName: crop.label });
                return (
                  <label className={styles.pill} key={crop.key}>
                    <input
                      id={`${headingId}-crop-${crop.key}`}
                      checked={crops.includes(crop.key)}
                      onChange={() => toggleCrop(crop.key)}
                      type="checkbox"
                    />
                    <i data-plant-swatch style={{ background: colors.fill, borderColor: colors.stroke }} aria-hidden="true" />
                    {crop.label}
                  </label>
                );
              })}
            </div>
          </fieldset>

          {choosesAreas ? (
            <fieldset className={styles.choices} aria-describedby={`${headingId}-area-help`} aria-invalid={!selectedAreaIds.length}>
              <legend>Planting areas (up to {MAX_ALLOCATION_AREAS})</legend>
              {!selectedAreaIds.length && <p className={styles.help} id={`${headingId}-area-help`}>Choose at least one planting area before planning.</p>}
              <div className={styles.pills}>
                {eligibleAreas.map((area) => (
                  <label className={styles.pill} key={area.id}>
                    <input
                      id={`${headingId}-area-${area.id}`}
                      checked={chosenAreaIds.includes(area.id)}
                      disabled={!chosenAreaIds.includes(area.id) && chosenAreaIds.length >= MAX_ALLOCATION_AREAS}
                      onChange={() => toggleArea(area.id)}
                      type="checkbox"
                    />
                    {area.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <p className={styles.areasAll}>
              <strong>Planting areas</strong>
              <span>{eligibleAreas.map((area) => area.name).join(" · ")}</span>
            </p>
          )}

          <FormField id={`${headingId}-preference`} className={`field ${styles.preference}`}>
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
            <span className={styles.count} id={`${headingId}-preference-count`}>
              {preference.length}/{MAX_ALLOCATION_PREFERENCE} characters
            </span>
          </FormField>

          {waitingForSave ? (
            <p className={styles.notice}>Waiting for your latest changes to save before planning.</p>
          ) : null}
          {isPlanning ? (
            <p className={styles.notice} role="status">
              Planning can take up to two minutes. The steps appear when the plan is ready.
            </p>
          ) : null}
          <div className={styles.actions}>
            <button className={styles.primary} disabled={!canPlan} type="submit">
              {isPlanning ? "Planning…" : "Plan with AI"}
            </button>
          </div>
        </FeedbackForm>
      )}


      {result && result.status === "needs_input" ? (
        <div className={styles.error} role="alert">
          <strong>More input needed</strong>
          <ul>
            {result.missingInputs.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {result && result.status !== "draft" && result.status !== "needs_input" ? (
        offersDemoExample ? (
          <p className={styles.notice} role="status">
            Live AI runs are closed in the public demo, so no plan was created. View the example run to see a recorded one.
          </p>
        ) : (
          <div className={styles.error} role="alert">
            <p>{statusMessages[result.status]}</p>
            {result.failureReason ? <p>{failureReasons[result.failureReason] ?? result.failureReason}</p> : null}
            {exampleRun ? exampleToggle : null}
          </div>
        )
      ) : null}

      {showExample && exampleRun ? <ExampleRun run={exampleRun} colorOf={colorOf} /> : null}

      {draft?.scope ? (
        <section aria-label="Draft allocation" className={styles.draft}>
          <strong className={styles.fieldTitle}>Draft for {draft.scope.seasonYear}</strong>
          <DraftAreas draft={draft} colorOf={colorOf} />
          {isStale && !isConfirmed ? (
            <p className={styles.notice}>
              The garden or your choices changed after this draft was made. Plan again to use them.
            </p>
          ) : null}
          {confirmation?.status === "stale" ? (
            <p className={styles.notice}>This draft is out of date. Plan again before adding it.</p>
          ) : null}
          {confirmation?.status === "added" ? (
            <p className={styles.confirmed} role="status">
              Added {confirmation.added}, skipped {confirmation.skipped} already in the {confirmation.seasonYear} plan.
            </p>
          ) : null}
          <div className={styles.actions}>
            <button className={styles.primary} disabled={isStale || isConfirmed} onClick={confirm} type="button">
              Add to {draft.scope.seasonYear} plan
            </button>
          </div>
        </section>
      ) : null}

      {result?.trace.length ? <AgentSteps label="Agent steps" trace={result.trace} /> : null}
    </section>
  );
}

type ColorOf = ReturnType<typeof seasonPlantColors>;

/**
 * One line per placement, "crop → area", with its rotation warning under it. A warning that
 * matches no placement and an area left empty still get a line of their own.
 */
function DraftAreas({ draft, colorOf }: { draft: SeasonAllocationResult; colorOf: ColorOf }) {
  const areas = draft.scope?.areas ?? [];
  const areaName = (id: string) => areas.find((area) => area.id === id)?.name ?? id;
  const empty = areas.filter((area) => !draft.allocation.some((assignment) => assignment.growingAreaId === area.id));
  const placed = (warning: SeasonAllocationResult["warnings"][number]) =>
    draft.allocation.some((assignment) => assignment.growingAreaId === warning.growingAreaId && assignment.crop === warning.crop);
  const warningText = (warning: SeasonAllocationResult["warnings"][number]) =>
    `Rotation warning: ${cropLabel(warning.crop)} is ${warning.rotationGroup}, grown here in ${warning.repeatedYears.join(", ")}.`;
  return (
    <>
      <ul className={styles.draftList}>
        {draft.allocation.map((assignment, index) => (
          <li key={`${assignment.growingAreaId}:${assignment.crop}:${index}`}>
            <PlantChip name={cropLabel(assignment.crop)} colors={colorOf({ commonName: cropLabel(assignment.crop) })} />
            <span aria-hidden="true">→</span>
            <strong>{areaName(assignment.growingAreaId)}</strong>
            {draft.warnings
              .filter((warning) => warning.growingAreaId === assignment.growingAreaId && warning.crop === assignment.crop)
              .map((warning, warningIndex) => (
                <span className={styles.warning} key={warningIndex}>{warningText(warning)}</span>
              ))}
          </li>
        ))}
        {draft.warnings.filter((warning) => !placed(warning)).map((warning, index) => (
          <li key={`unplaced:${warning.growingAreaId}:${warning.crop}:${index}`}>
            <strong>{areaName(warning.growingAreaId)}</strong>
            <span className={styles.warning}>{warningText(warning)}</span>
          </li>
        ))}
        {empty.map((area) => (
          <li key={area.id}>
            <strong>{area.name}</strong>
            <span className={styles.why}>Nothing planned</span>
          </li>
        ))}
      </ul>
      {draft.explanation ? (
        <p className={styles.explanation}>
          <strong>AI explanation</strong>
          <span>{draft.explanation}</span>
        </p>
      ) : null}
    </>
  );
}

function AgentSteps({ label, trace }: { label: string; trace: AllocationTraceStep[] }) {
  return (
    <section aria-label={label} className={styles.trace}>
      <strong className={styles.fieldTitle}>{label}</strong>
      <ol>
        {trace.map((step) => (
          <li key={step.step}>
            <span className={styles.traceTool}>
              Step {step.step} · {step.tool}
            </span>
            <code>{typeof step.args === "string" ? step.args : JSON.stringify(step.args)}</code>
            <span>{step.shortResult}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A recorded run, clearly labelled, read-only: it is not a plan for this garden. */
function ExampleRun({ run, colorOf }: { run: ExampleAllocationRun; colorOf: ColorOf }) {
  const recordedOn = run.recordedAt.slice(0, 10);
  return (
    <section aria-label="Example run" className={styles.example}>
      <p className={styles.fieldTitle}>Example run record</p>
      <p className={styles.notice}>
        Recorded on {recordedOn} with {run.model} on the {run.gardenName}. This shows how the assistant works. It is
        not a plan for your garden and cannot be added.
      </p>
      <p className={styles.areasAll}>
        <strong>Request</strong>
        <span>
          {run.request.crops.map(cropLabel).join(" · ")}
          {run.request.preference ? ` — “${run.request.preference}”` : ""}
        </span>
      </p>
      {run.result.scope ? (
        <div className={styles.draft}>
          <strong className={styles.fieldTitle}>Recorded draft for {run.result.scope.seasonYear}</strong>
          <DraftAreas draft={run.result} colorOf={colorOf} />
        </div>
      ) : null}
      {run.result.trace.length ? <AgentSteps label="Recorded agent steps" trace={run.result.trace} /> : null}
      <details className={styles.toolResults}>
        <summary>Full tool results</summary>
        <ol>
          {run.toolResults.map((item, index) => (
            <li key={index}>
              <span className={styles.traceTool}>{item.tool}</span>
              <code>{JSON.stringify(item.output)}</code>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}
