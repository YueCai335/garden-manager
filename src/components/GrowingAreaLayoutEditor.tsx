"use client";

import { FeedbackForm, FormField } from "@/components/forms/FormFeedback";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { emptyPlantEditorDraft, plantDraftIsDirty, plantPositionError, type PlantEditorDraft } from "@/lib/areaEditorDrafts";
import { ConfirmDialog, useConfirmation } from "@/components/ConfirmDialog";
import { Circle, Layer, Line, Rect, Stage, Text } from "react-konva";
import { useCanvasSize } from "@/hooks/useCanvasSize";
import { canvasToMetres, canvasGridTicks, fitCanvas, type CanvasTransform } from "@/lib/canvasViewport";
import { Button } from "./ui/Button";
import canvasStyles from "./canvas/Canvas.module.css";

import {
  type LayoutPoint,
  allocationPlantColor,
  clampAllocationCenter,
  createRectangularLayout,
  findDuplicatePlantPosition,
  growingAreaKindLabels,
  growingAreaKinds,
  snapToGrid,
  validateLayoutDimensions,
  defaultPlantColor,
  plantDisplayName,
  plantTypeSuggestions,
  type GrowingArea,
  type GrowingAreaKind,
  type GrowingAreaLayout,
  type PlantAllocation
} from "@/lib/gardenWorkspace";

type GrowingAreaLayoutEditorProps = {
  area: GrowingArea;
  draft?: PlantEditorDraft;
  onDraftChange?: (update: (draft: PlantEditorDraft) => PlantEditorDraft) => void;
  onChange: (layout: GrowingAreaLayout) => void;
  onArchivePlantingRecord: (plantingRecordId: string) => void;
  showAreaProperties?: boolean;
  inInspector?: boolean;
  onSaveArea: (
    name: string,
    kind: GrowingAreaKind,
    rotationDegrees: number,
    layout: GrowingAreaLayout,
  ) => void;
};


export function GrowingAreaLayoutEditor({
  area,
  draft,
  onDraftChange,
  onArchivePlantingRecord,
  onChange,
  onSaveArea,
  showAreaProperties = true,
  inInspector = false,
}: GrowingAreaLayoutEditorProps) {
  const layout = area.layout;
  const [name, setName] = useState(area.name);
  const [kind, setKind] = useState<GrowingAreaKind>(area.kind);
  const [rotationDegrees, setRotationDegrees] = useState(
    String(area.planPlacement.rotationDegrees),
  );
  const [width, setWidth] = useState(String(layout?.widthMeters ?? ""));
  const [depth, setDepth] = useState(String(layout?.depthMeters ?? ""));
  const { requestConfirmation, confirmation } = useConfirmation();
  const currentLayout = useRef(layout);
  currentLayout.current = layout;
  const [localDraft, setLocalDraft] = useState(emptyPlantEditorDraft);
  const plantDraft = draft ?? localDraft;
  const { allocationPlantType, allocationVariety, allocationColor, allocationDiameter, selectedId, editingAllocation, isAddFormOpen, isEditOpen, coordinates } = plantDraft;
  const updateDraft = useCallback((update: (current: PlantEditorDraft) => PlantEditorDraft) => (onDraftChange ?? setLocalDraft)(update), [onDraftChange]);
  const setField = <K extends keyof PlantEditorDraft>(key: K, value: PlantEditorDraft[K]) => updateDraft((current) => ({ ...current, [key]: value }));
  const setAllocationPlantType = (value: string) => setField("allocationPlantType", value);
  const setAllocationVariety = (value: string) => setField("allocationVariety", value);
  const setAllocationColor = (value: string) => setField("allocationColor", value);
  const setAllocationDiameter = (value: string) => setField("allocationDiameter", value);
  const setSelectedId = (value: string | undefined) => setField("selectedId", value);
  const setEditingAllocation = (value: PlantAllocation | undefined) => setField("editingAllocation", value);
  const setIsAddFormOpen = (value: boolean) => setField("isAddFormOpen", value);
  const setIsEditOpen = (value: boolean) => setField("isEditOpen", value);
  const [message, setMessage] = useState("");
  const [pendingDiscard, setPendingDiscard] = useState<{ action: () => void }>();
  const withDiscardCheck = (action: () => void) => {
    if (plantDraftIsDirty(plantDraft)) setPendingDiscard({ action });
    else action();
  };
  const cancelPlantForm = () => withDiscardCheck(() => updateDraft(() => emptyPlantEditorDraft()));
  const toggleAddForm = () => withDiscardCheck(() => updateDraft(() => ({ ...emptyPlantEditorDraft(), isAddFormOpen: !isAddFormOpen })));


  useEffect(() => {
    setName(area.name);
    setKind(area.kind);
    setRotationDegrees(String(area.planPlacement.rotationDegrees));
    setWidth(String(layout?.widthMeters ?? ""));
    setDepth(String(layout?.depthMeters ?? ""));
  }, [area.id, area.name, area.kind, area.planPlacement.rotationDegrees, layout?.widthMeters, layout?.depthMeters]);

  useEffect(() => {
    // Area property changes must not erase an open plant form.
    setLocalDraft(emptyPlantEditorDraft());
  }, [area.id]);

  const selected = layout?.allocations.find((allocation) => allocation.id === selectedId);
  const plantDirty = plantDraftIsDirty(plantDraft);
  const plantChangedElsewhere = Boolean(editingAllocation && selected && plantDraft.baselineAllocation && JSON.stringify(selected) !== JSON.stringify(plantDraft.baselineAllocation));
  useEffect(() => {
    if (!plantChangedElsewhere || plantDirty || !selected) return;
    updateDraft((current) => ({ ...current, editingAllocation: { ...selected }, baselineAllocation: { ...selected }, coordinates: { x: String(selected.x), y: String(selected.y), diameterMeters: String(selected.diameterMeters) } }));
  }, [plantChangedElsewhere, plantDirty, selected, updateDraft]);
  const draftPlantType = allocationPlantType.trim();
  const draftVariety = allocationVariety.trim();
  const draftSpacing = Number(allocationDiameter);
  const draftAllocation: PlantAllocation | undefined =
    layout && draftPlantType && Number.isFinite(draftSpacing) && draftSpacing >= 0.1
      ? {
          id: "new-allocation",
          label: plantDisplayName({ plantType: draftPlantType, variety: draftVariety, fallback: draftPlantType }),
          plantType: draftPlantType,
          ...(draftVariety ? { variety: draftVariety } : {}),
          ...(allocationColor ? { color: allocationColor } : {}),
          diameterMeters: snapToGrid(draftSpacing),
          ...clampAllocationCenter({ x: layout.widthMeters / 2, y: layout.depthMeters / 2 }, layout),
        }
      : undefined;
  const suggestedAllocationColor = draftAllocation && layout
    ? allocationPlantColor(draftAllocation, [...layout.allocations, draftAllocation])
    : defaultPlantColor(allocationPlantType, allocationVariety);
  const preview = isAddFormOpen ? draftAllocation
    : isEditOpen && plantDirty && selected && editingAllocation && layout && !plantPositionError(plantDraft, layout) ? {
      ...editingAllocation,
      ...clampAllocationCenter({ x: Number(coordinates.x), y: Number(coordinates.y) }, layout),
      diameterMeters: snapToGrid(Number(coordinates.diameterMeters)),
    } : undefined;
  const hasAreaPropertyChanges =
    name !== area.name ||
    kind !== area.kind ||
    Number(rotationDegrees) !== area.planPlacement.rotationDegrees ||
    Number(width) !== layout?.widthMeters ||
    Number(depth) !== layout?.depthMeters;
  const saveAreaProperties = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();
    const widthMeters = Number(width);
    const depthMeters = Number(depth);
    const nextRotationDegrees = Number(rotationDegrees);
    if (!trimmedName) {
      setMessage("Enter a planting-area name to continue.");
      return;
    }
    if (!validateLayoutDimensions(widthMeters, depthMeters)) {
      setMessage("Enter length and width of at least 0.1 metres.");
      return;
    }
    if (!Number.isFinite(nextRotationDegrees)) {
      setMessage("Enter a valid rotation angle.");
      return;
    }
    const next = createRectangularLayout(snapToGrid(widthMeters), snapToGrid(depthMeters));
    const nextLayout = {
      ...next,
      allocations: layout?.allocations.map((allocation) => ({
        ...allocation,
        ...clampAllocationCenter(allocation, next),
      })) ?? [],
    };
    onSaveArea(trimmedName, kind, nextRotationDegrees, nextLayout);
    setMessage("Planting area updated.");
  };

  const createAllocation = () => {
    if (!draftAllocation) {
      setMessage("Enter a plant type and spacing of at least 0.1 metres.");
      return;
    }
    return { ...draftAllocation, id: createAllocationId() };
  };

  const resetAddForm = () => {
    setSelectedId(undefined);
    setIsAddFormOpen(false);
    setAllocationPlantType("");
    setAllocationVariety("");
    setAllocationColor("");
    setAllocationDiameter("0.3");
  };

  const addAllocation = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const allocation = createAllocation();
    if (!layout || !allocation) return;
    onChange({ ...layout, allocations: [...layout.allocations, allocation] });
    resetAddForm();
    setMessage(`${allocation.label} added at the centre of this area.`);
  };

  const addAndDuplicateAllocation = () => {
    const allocation = createAllocation();
    if (!layout || !allocation) return;
    const nextLayout = { ...layout, allocations: [...layout.allocations, allocation] };
    const position = findDuplicatePlantPosition(allocation, nextLayout);
    if (!position) {
      setMessage("No open 0.1 metre grid position is available for a duplicate.");
      return;
    }
    const duplicate: PlantAllocation = { ...allocation, id: createAllocationId(), ...position };
    onChange({ ...layout, allocations: [...nextLayout.allocations, duplicate] });
    resetAddForm();
    setMessage(`${allocation.label} added with a duplicate.`);
  };

  function archiveRecordIfUnused(
    allocation: PlantAllocation,
    allocations: PlantAllocation[],
  ) {
    if (!allocation.plantingRecordId) return;
    const stillPlaced = allocations.some(
      (candidate) =>
        candidate.id !== allocation.id &&
        candidate.plantingRecordId === allocation.plantingRecordId,
    );
    if (!stillPlaced) onArchivePlantingRecord(allocation.plantingRecordId);
  }

  const updateEditingAllocation = (field: "x" | "y" | "diameterMeters", rawValue: string) => {
    updateDraft((current) => ({ ...current, coordinates: { ...current.coordinates, [field]: rawValue } }));
  };

  const updateEditingColor = (color: string) => {
    if (!editingAllocation) return;
    setEditingAllocation({ ...editingAllocation, color });
  };

  const updateEditingIdentity = (field: "plantType" | "variety", value: string) => {
    if (!editingAllocation) return;
    const plantType = field === "plantType" ? value : editingAllocation.plantType ?? editingAllocation.label;
    const variety = field === "variety" ? value : editingAllocation.variety ?? "";
    const { variety: _previousVariety, ...allocationWithoutVariety } = editingAllocation;
    setEditingAllocation({
      ...allocationWithoutVariety,
      plantType,
      ...(variety ? { variety } : {}),
      label: plantDisplayName({ plantType: plantType.trim(), variety: variety.trim(), fallback: editingAllocation.label }),
    });
  };

  const moveAllocation = (id: string, position: LayoutPoint) => {
    if (!layout) return;
    const point = clampAllocationCenter(position, layout);
    onChange({ ...layout, allocations: layout.allocations.map((allocation) => allocation.id === id ? { ...allocation, ...point } : allocation) });
    if (!editingAllocation) setSelectedId(id);
    setMessage("Plant snapped to the 0.1 metre grid.");
  };

  const openEdit = (id: string) => {
    const plant = layout?.allocations.find((allocation) => allocation.id === id);
    if (!plant) return;
    if (selectedId === id && editingAllocation) { setIsEditOpen(true); return; }
    withDiscardCheck(() => updateDraft(() => ({
      ...emptyPlantEditorDraft(), selectedId: id, editingAllocation: { ...plant }, baselineAllocation: { ...plant },
      coordinates: { x: String(plant.x), y: String(plant.y), diameterMeters: String(plant.diameterMeters) }, isEditOpen: true,
    })));
  };

  const savePlant = () => {
    if (!layout || !editingAllocation) return;
    if (!selected) { setMessage("This plant no longer exists. Copy your edits or discard this draft."); return; }
    const positionError = plantPositionError(plantDraft, layout);
    if (positionError) { setMessage(positionError); return; }
    const plantType = (editingAllocation.plantType ?? editingAllocation.label).trim();
    const variety = (editingAllocation.variety ?? "").trim();
    if (!plantType) {
      setMessage("Enter a plant type.");
      return;
    }
    const identityChanged = plantType !== (selected.plantType ?? selected.label) || variety !== (selected.variety ?? "");
    const { variety: _previousVariety, ...allocationWithoutVariety } = editingAllocation;
    const next: PlantAllocation = {
      ...allocationWithoutVariety,
      ...clampAllocationCenter({ x: Number(coordinates.x), y: Number(coordinates.y) }, layout),
      diameterMeters: snapToGrid(Number(coordinates.diameterMeters)),
      ...(identityChanged ? { plantingRecordId: undefined } : {}),
      plantType,
      ...(variety ? { variety } : {}),
      label: plantDisplayName({ plantType, variety, fallback: selected.label }),
    };
    onChange({ ...layout, allocations: layout.allocations.map((allocation) => allocation.id === selected.id ? next : allocation) });
    if (identityChanged) archiveRecordIfUnused(selected, layout.allocations);
    setSelectedId(undefined);
    setEditingAllocation(undefined);
    setIsEditOpen(false);
    setMessage(`${next.label} updated.`);
  };

  const removePlant = (id: string) => {
    const plant = layout?.allocations.find((allocation) => allocation.id === id);
    if (!plant) return;
    const archives = plant.plantingRecordId && layout!.allocations.filter((item) => item.plantingRecordId === plant.plantingRecordId).length === 1;
    requestConfirmation({
      confirmLabel: "Remove plant", tone: "danger", fallbackFocusId: "layout-editor-heading",
      message: `Remove “${plant.label}” from this layout? ${archives ? "Its linked planting record will be archived because no other layout plant uses it." : "Other layout plants and planting records stay available."} Care and health history stay available. Unsaved edits to this plant will be discarded.`,
      onConfirm: () => {
        const latest = currentLayout.current;
        if (!latest?.allocations.some((item) => item.id === id)) throw new Error("This plant no longer exists. Cancel to return to the layout.");
        if (JSON.stringify(latest) !== JSON.stringify(layout)) throw new Error("The layout changed. Cancel and review removal again.");
        onChange({ ...latest, allocations: latest.allocations.filter((allocation) => allocation.id !== id) });
        archiveRecordIfUnused(plant, latest.allocations);
        updateDraft((current) => current.selectedId === id ? emptyPlantEditorDraft() : current);
        setMessage(`${plant.label} removed.`);
      },
    });
  };

  const duplicateSelected = () => {
    if (editingAllocation && layout) {
      const error = plantPositionError(plantDraft, layout);
      if (error) { setMessage(error); return; }
    }
    const source = editingAllocation ? { ...editingAllocation, x: Number(coordinates.x), y: Number(coordinates.y), diameterMeters: snapToGrid(Number(coordinates.diameterMeters)) } : selected;
    if (!layout || !source) return;
    const position = findDuplicatePlantPosition(source, layout);
    if (!position) {
      setMessage("No open 0.1 metre grid position is available for a duplicate.");
      return;
    }
    const duplicate: PlantAllocation = { ...source, id: createAllocationId(), ...position };
    onChange({ ...layout, allocations: [...layout.allocations, duplicate] });
    setSelectedId(duplicate.id);
    updateDraft((current) => ({ ...current, editingAllocation: { ...duplicate }, baselineAllocation: { ...duplicate }, coordinates: { x: String(duplicate.x), y: String(duplicate.y), diameterMeters: String(duplicate.diameterMeters) } }));
    setIsEditOpen(true);
    setMessage(`${duplicate.label} duplicated.`);
  };

  return <section className={`layout-editor${inInspector ? " layout-editor-in-inspector" : ""}`} aria-labelledby="layout-editor-heading">
    {confirmation}
    {pendingDiscard && <ConfirmDialog message="Discard unsaved plant changes?" confirmLabel="Discard changes" cancelLabel="Keep editing" onCancel={() => setPendingDiscard(undefined)} onConfirm={() => { pendingDiscard.action(); setPendingDiscard(undefined); }} />}
    {plantDraftIsDirty(plantDraft) && <p role="status">Unsaved plant changes</p>}
    {plantChangedElsewhere && plantDirty && <p role="alert">This plant changed elsewhere. Your edits are kept; review its current position before saving.</p>}
    {showAreaProperties ? <section className="planting-area-properties" aria-labelledby="planting-area-properties-heading">
      <div className="layout-editor-heading">
        <div>
          <p className="section-eyebrow">Planting area</p>
          <h2 id="planting-area-properties-heading">Area properties</h2>
        </div>
      </div>
      <FeedbackForm notice={hasAreaPropertyChanges ? "Unsaved changes" : ""} className="planting-area-property-form" onSubmit={saveAreaProperties}>
        <FormField id="editing-planting-area-name" className="field"><label htmlFor="editing-planting-area-name">Planting-area name</label><input id="editing-planting-area-name" required onChange={(event) => setName(event.target.value)} value={name} /></FormField>
        <div className="field"><label htmlFor="editing-planting-area-kind">Planting-area type</label><select id="editing-planting-area-kind" onChange={(event) => setKind(event.target.value as GrowingAreaKind)} value={kind}>{growingAreaKinds.map((candidate) => <option key={candidate} value={candidate}>{growingAreaKindLabels[candidate]}</option>)}</select></div>
        <FormField id="layout-length" className="field"><label htmlFor="layout-length">Length (m)</label><input id="layout-length" required min="0.1" onChange={(event) => setWidth(event.target.value)} step="0.1" type="number" value={width} /></FormField>
        <FormField id="layout-width" className="field"><label htmlFor="layout-width">Width (m)</label><input id="layout-width" required min="0.1" onChange={(event) => setDepth(event.target.value)} step="0.1" type="number" value={depth} /></FormField>
        <FormField id="editing-planting-area-rotation" className="field"><label htmlFor="editing-planting-area-rotation">Rotation (degrees)</label><input id="editing-planting-area-rotation" required onChange={(event) => setRotationDegrees(event.target.value)} step="1" type="number" value={rotationDegrees} /></FormField>
        {hasAreaPropertyChanges ? <button className="save-button" type="submit">Save</button> : null}
      </FeedbackForm>
    </section> : null}
    <div className="layout-editor-heading layout-editor-heading-current"><div><p className="section-eyebrow">Current season</p><h2 id="layout-editor-heading" tabIndex={-1}>Plant layout</h2></div>{inInspector ? <div className="plant-toolbar"><button aria-expanded={isAddFormOpen} className="primary-button" onClick={toggleAddForm} type="button">Add plant</button></div> : null}</div>
    <p className="layout-intro">{layout && `${layout.allocations.length} ${layout.allocations.length === 1 ? "plant" : "plants"} placed · `}Circles show planting spacing.</p>
    {editingAllocation && layout && plantPositionError(plantDraft, layout) && <p role="alert" id="plant-position-error">{plantPositionError(plantDraft, layout)}</p>}
    {editingAllocation && !selected && <div role="alert"><p>This plant no longer exists. Your draft is kept for copying.</p><textarea aria-label="Unavailable plant draft" readOnly value={JSON.stringify({ ...editingAllocation, ...coordinates })} /><button type="button" onClick={() => updateDraft(() => emptyPlantEditorDraft())}>Discard plant draft</button></div>}
    {layout ? <>
      <div className="layout-editor-grid">
        <MetricLayoutCanvas layout={layout} onMove={moveAllocation} onSelect={openEdit} selectedId={selectedId} preview={preview} />
        <aside className="allocation-controls" aria-label="Plant controls">
          {!inInspector ? <div className="plant-toolbar">
            <button aria-expanded={isAddFormOpen} className="primary-button" onClick={toggleAddForm} type="button">Add plant</button>
          </div> : null}
          {isEditOpen && selected && editingAllocation ? <FeedbackForm className="selected-allocation" notice={plantDraftIsDirty(plantDraft) ? "Unsaved changes" : ""} onSubmit={(event) => {
            if ((event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-action") === "duplicate") duplicateSelected();
            else savePlant();
          }}><h3>Edit {selected.label}</h3><div className="selected-fields"><FormField id="selected-allocation-plant-type"><label htmlFor="selected-allocation-plant-type">Plant type</label><input id="selected-allocation-plant-type" autoFocus required list="plant-type-suggestions" onChange={(event) => updateEditingIdentity("plantType", event.target.value)} value={editingAllocation.plantType ?? editingAllocation.label} /></FormField><div className="field"><label htmlFor="selected-allocation-variety">Variety (optional)</label><input id="selected-allocation-variety" onChange={(event) => updateEditingIdentity("variety", event.target.value)} value={editingAllocation.variety ?? ""} /></div><FormField id="allocation-x"><label htmlFor="allocation-x">X position (m)</label><input id="allocation-x" required max={layout.widthMeters} aria-invalid={Boolean(layout && plantPositionError(plantDraft, layout))} aria-describedby={layout && plantPositionError(plantDraft, layout) ? "plant-position-error" : undefined} min="0" onChange={(event) => updateEditingAllocation("x", event.target.value)} step="0.1" type="number" value={coordinates.x} /></FormField><FormField id="allocation-y"><label htmlFor="allocation-y">Y position (m)</label><input id="allocation-y" required max={layout.depthMeters} aria-invalid={Boolean(layout && plantPositionError(plantDraft, layout))} aria-describedby={layout && plantPositionError(plantDraft, layout) ? "plant-position-error" : undefined} min="0" onChange={(event) => updateEditingAllocation("y", event.target.value)} step="0.1" type="number" value={coordinates.y} /></FormField><FormField id="selected-allocation-diameter"><label htmlFor="selected-allocation-diameter">Plant spacing (m)</label><input id="selected-allocation-diameter" required aria-invalid={Boolean(layout && plantPositionError(plantDraft, layout))} aria-describedby={layout && plantPositionError(plantDraft, layout) ? "plant-position-error" : undefined} min="0.1" onChange={(event) => updateEditingAllocation("diameterMeters", event.target.value)} step="0.1" type="number" value={coordinates.diameterMeters} /></FormField><div className="field"><label htmlFor="selected-allocation-color">Plant color</label><input id="selected-allocation-color" onChange={(event) => updateEditingColor(event.target.value)} type="color" value={allocationPlantColor(editingAllocation, layout.allocations)} /></div></div><div className="form-actions">{plantDraftIsDirty(plantDraft) ? <button className="primary-button" type="submit">Save plant</button> : null}<button className="duplicate-button" data-action="duplicate" type="submit">Duplicate plant</button><button className="secondary-button" onClick={cancelPlantForm} type="button">Cancel</button><button className="remove-button" onClick={() => removePlant(selected.id)} type="button">Remove plant</button></div></FeedbackForm> : null}
          {isAddFormOpen ? <FeedbackForm className="allocation-form" onSubmit={(event) => {
            if ((event.nativeEvent as SubmitEvent).submitter?.getAttribute("data-action") === "duplicate") addAndDuplicateAllocation();
            else addAllocation(event);
          }}>
            <h3>Add plant</h3>
            <FormField id="allocation-plant-type" className="field"><label htmlFor="allocation-plant-type">Plant type</label><input id="allocation-plant-type" autoFocus list="plant-type-suggestions" onChange={(event) => setAllocationPlantType(event.target.value)} placeholder="e.g. Tomato" required value={allocationPlantType} /></FormField>
            <div className="field"><label htmlFor="allocation-variety">Variety (optional)</label><input id="allocation-variety" onChange={(event) => setAllocationVariety(event.target.value)} placeholder="e.g. Sun Gold" value={allocationVariety} /></div>
            <FormField id="allocation-diameter" className="field"><label htmlFor="allocation-diameter">Plant spacing (m)</label><input id="allocation-diameter" required min="0.1" onChange={(event) => setAllocationDiameter(event.target.value)} step="0.1" type="number" value={allocationDiameter} /></FormField>
            <div className="field"><label htmlFor="allocation-color">Plant color</label><input id="allocation-color" onChange={(event) => setAllocationColor(event.target.value)} type="color" value={allocationColor || suggestedAllocationColor} /></div>
            <div className="form-actions"><button className="primary-button" type="submit">Add</button><button className="duplicate-button" data-action="duplicate" type="submit">Add &amp; duplicate</button><button className="secondary-button" onClick={cancelPlantForm} type="button">Cancel</button></div>
          </FeedbackForm> : null}
        </aside>
      </div>
    </> : <div className="empty-areas"><h3>Set the real measurements first</h3><p>Create a rectangular layout using its real length and width.</p></div>}
    <p aria-live="polite" className="workspace-message" role="status">{message}</p>
  </section>;
}

function MetricLayoutCanvas({ layout, onMove, onSelect, selectedId, preview }: { layout: GrowingAreaLayout; onMove: (id: string, position: LayoutPoint) => void; onSelect: (id: string) => void; selectedId?: string; preview?: PlantAllocation }) {
  const size = useCanvasSize();
  const [moveMode, setMoveMode] = useState(false);
  const [dragTransform, setDragTransform] = useState<CanvasTransform>();
  const transform = dragTransform ?? fitCanvas({ x: 0, y: 0, widthMeters: layout.widthMeters, depthMeters: layout.depthMeters }, size.width, size.height);
  const { scale = 0, padding = 34, width = 0, height = 0 } = transform ?? {};
  const grid = canvasGridTicks(0, layout.widthMeters, scale);
  const horizontalGrid = canvasGridTicks(0, layout.depthMeters, scale);
  return <div className={canvasStyles.frame}>
    <datalist id="plant-type-suggestions">{plantTypeSuggestions.map((plantType) => <option key={plantType} value={plantType} />)}</datalist>
    <div className={canvasStyles.toolbar}><Button aria-pressed={moveMode} onClick={() => setMoveMode((value) => !value)}>Move plants</Button><p>{moveMode ? "Drag a plant to move it. Turn off Move to scroll." : "Tap a plant or choose it below to edit."}</p></div>
    {preview && <p className={canvasStyles.preview}>Preview: {preview.label} · {Math.round(preview.diameterMeters * 100)} cm spacing · X {preview.x} m, Y {preview.y} m</p>}
    <div ref={size.ref} className={canvasStyles.surface}>
      {transform ? <Stage aria-label={`Metric layout, ${layout.widthMeters} metres long by ${layout.depthMeters} metres wide`} height={height} width={width} style={{ touchAction: moveMode ? "none" : "pan-y" }}>
        <Layer>
          <Rect preventDefault={false} fill="#f8fbf6" height={layout.depthMeters * scale} stroke="#183a2a" strokeWidth={2} width={layout.widthMeters * scale} x={padding} y={padding} />
          {grid.map((metre) => <Line listening={false} key={`vertical-${metre}`} points={[padding + metre * scale, padding, padding + metre * scale, padding + layout.depthMeters * scale]} stroke="#cfd7ce" strokeWidth={1} />)}
          {horizontalGrid.map((metre) => <Line listening={false} key={`horizontal-${metre}`} points={[padding, padding + metre * scale, padding + layout.widthMeters * scale, padding + metre * scale]} stroke="#cfd7ce" strokeWidth={1} />)}
          {grid.map((metre) => <Text listening={false} fontSize={12} key={`x-label-${metre}`} text={`${metre} m`} x={padding + metre * scale - 10} y={12} />)}
          {horizontalGrid.map((metre) => <Text listening={false} fontSize={12} key={`y-label-${metre}`} text={`${metre} m`} x={3} y={padding + metre * scale - 6} />)}
          {layout.allocations.map((allocation) => <Circle aria-label={`${allocation.label} plant`} draggable={moveMode} preventDefault={moveMode} fill={allocationPlantColor(allocation, layout.allocations)} key={allocation.id}
            onClick={() => onSelect(allocation.id)} onTap={() => onSelect(allocation.id)}
            onDragStart={() => setDragTransform(transform)} onDragEnd={(event) => {
              if (moveMode) onMove(allocation.id, canvasToMetres({ x: event.target.x(), y: event.target.y() }, transform));
              setDragTransform(undefined);
            }}
            radius={allocation.diameterMeters * scale / 2} stroke="#183a2a" strokeWidth={allocation.id === selectedId ? 3 : 1} x={padding + allocation.x * scale} y={padding + allocation.y * scale} />)}
          {layout.allocations.filter((allocation) => allocation.diameterMeters * scale >= 36).map((allocation) => {
            const diameter = allocation.diameterMeters * scale;
            return <Text align="center" data-testid={`allocation-label-${allocation.id}`} ellipsis fill="#ffffff" fontSize={12} height={diameter - 4} key={`label-${allocation.id}`} listening={false} text={allocation.label} verticalAlign="middle" width={diameter - 4} wrap="none" x={padding + allocation.x * scale - diameter / 2 + 2} y={padding + allocation.y * scale - diameter / 2 + 2} />;
          })}
          {preview && <Circle listening={false} x={padding + preview.x * scale} y={padding + preview.y * scale}
            radius={preview.diameterMeters * scale / 2} stroke="#183a2a" fill="#d7e5d2" opacity={0.85} strokeWidth={2} dash={[5, 3]} />}
        </Layer>
      </Stage> : <p className={canvasStyles.placeholder}>Preparing plant layout…</p>}
    </div>
    {layout.allocations.length > 0 && <ul aria-label="Plants in this area" className={canvasStyles.plants}>
      {layout.allocations.map((plant) => <li key={plant.id}><Button aria-label={`Edit ${plant.label}`} aria-pressed={plant.id === selectedId} onClick={() => onSelect(plant.id)}>{plant.label}</Button></li>)}
    </ul>}
  </div>;
}

function createAllocationId() {
  return globalThis.crypto?.randomUUID?.() ?? `allocation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
