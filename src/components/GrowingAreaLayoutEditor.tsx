"use client";

import { FormEvent, useEffect, useState } from "react";
import { Circle, Layer, Line, Rect, Stage, Text } from "react-konva";
import type { KonvaEventObject } from "konva/lib/Node";

import {
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

const CANVAS_PADDING = 38;

export function GrowingAreaLayoutEditor({
  area,
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
  const [width, setWidth] = useState(layout ? String(layout.widthMeters) : "");
  const [depth, setDepth] = useState(layout ? String(layout.depthMeters) : "");
  const [allocationPlantType, setAllocationPlantType] = useState("");
  const [allocationVariety, setAllocationVariety] = useState("");
  const [allocationColor, setAllocationColor] = useState("");
  const [allocationDiameter, setAllocationDiameter] = useState("0.3");
  const [selectedId, setSelectedId] = useState<string>();
  const [editingAllocation, setEditingAllocation] = useState<PlantAllocation>();
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    setName(area.name);
    setKind(area.kind);
    setRotationDegrees(String(area.planPlacement.rotationDegrees));
    setWidth(layout ? String(layout.widthMeters) : "");
    setDepth(layout ? String(layout.depthMeters) : "");
    setSelectedId(undefined);
    setEditingAllocation(undefined);
    setIsAddFormOpen(false);
    setIsEditOpen(false);
  }, [
    area.id,
    area.kind,
    area.name,
    area.planPlacement.rotationDegrees,
    layout?.widthMeters,
    layout?.depthMeters,
  ]);

  const selected = layout?.allocations.find((allocation) => allocation.id === selectedId);
  const draftAllocation: PlantAllocation | undefined =
    layout && allocationPlantType
      ? {
          id: "new-allocation",
          label: allocationPlantType,
          plantType: allocationPlantType,
          ...(allocationVariety ? { variety: allocationVariety } : {}),
          diameterMeters: 0.1,
          x: 0,
          y: 0,
        }
      : undefined;
  const suggestedAllocationColor = draftAllocation && layout
    ? allocationPlantColor(draftAllocation, [...layout.allocations, draftAllocation])
    : defaultPlantColor(allocationPlantType, allocationVariety);
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
    setMessage("Planting area saved.");
  };

  const createAllocation = () => {
    if (!layout) return;
    const plantType = allocationPlantType.trim(), variety = allocationVariety.trim(), diameterMeters = Number(allocationDiameter);
    if (!plantType || !Number.isFinite(diameterMeters) || diameterMeters < 0.1) {
      setMessage("Enter a plant type and spacing of at least 0.1 metres.");
      return;
    }
    const allocation: PlantAllocation = {
      id: createAllocationId(),
      label: plantDisplayName({ plantType, variety, fallback: plantType }),
      plantType,
      ...(variety ? { variety } : {}),
      ...(allocationColor ? { color: allocationColor } : {}),
      diameterMeters: snapToGrid(diameterMeters),
      ...clampAllocationCenter({ x: layout.widthMeters / 2, y: layout.depthMeters / 2 }, layout)
    };
    return allocation;
  };

  const resetAddForm = () => {
    setSelectedId(undefined);
    setIsAddFormOpen(false);
    setAllocationPlantType("");
    setAllocationVariety("");
    setAllocationColor("");
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
    if (!layout || !editingAllocation || rawValue === "") return;
    const value = Number(rawValue);
    if (!Number.isFinite(value) || (field === "diameterMeters" && value < 0.1)) {
      setMessage(field === "diameterMeters" ? "Plant spacing must be at least 0.1 metres." : "Enter a valid metre position.");
      return;
    }
    const next = field === "diameterMeters"
      ? { ...editingAllocation, diameterMeters: snapToGrid(value) }
      : { ...editingAllocation, ...clampAllocationCenter({ ...editingAllocation, [field]: value }, layout) };
    setEditingAllocation(next);
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

  const moveAllocation = (id: string, event: KonvaEventObject<DragEvent>) => {
    if (!layout) return;
    if (typeof event.target.x !== "function" || typeof event.target.y !== "function") return;
    const point = clampAllocationCenter({ x: (event.target.x() - CANVAS_PADDING) / pixelsPerMeter(layout), y: (event.target.y() - CANVAS_PADDING) / pixelsPerMeter(layout) }, layout);
    onChange({ ...layout, allocations: layout.allocations.map((allocation) => allocation.id === id ? { ...allocation, ...point } : allocation) });
    setSelectedId(id);
    setMessage("Plant snapped to the 0.1 metre grid.");
  };

  const openEdit = (id: string) => {
    const plant = layout?.allocations.find((allocation) => allocation.id === id);
    if (!plant) return;
    setSelectedId(id);
    setEditingAllocation({ ...plant });
    setIsEditOpen(true);
    setIsAddFormOpen(false);
  };

  const savePlant = () => {
    if (!layout || !selected || !editingAllocation) return;
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
    setMessage(`${next.label} saved.`);
  };

  const removePlant = (id: string) => {
    if (!layout) return;
    const plant = layout.allocations.find((allocation) => allocation.id === id);
    if (!plant) return;
    onChange({ ...layout, allocations: layout.allocations.filter((allocation) => allocation.id !== id) });
    archiveRecordIfUnused(plant, layout.allocations);
    if (selectedId === id) {
      setSelectedId(undefined);
      setEditingAllocation(undefined);
      setIsEditOpen(false);
    }
    setMessage(`${plant.label} removed.`);
  };

  const duplicateSelected = () => {
    const source = editingAllocation ?? selected;
    if (!layout || !source) return;
    const position = findDuplicatePlantPosition(source, layout);
    if (!position) {
      setMessage("No open 0.1 metre grid position is available for a duplicate.");
      return;
    }
    const duplicate: PlantAllocation = { ...source, id: createAllocationId(), ...position };
    onChange({ ...layout, allocations: [...layout.allocations, duplicate] });
    setSelectedId(duplicate.id);
    setEditingAllocation({ ...duplicate });
    setIsEditOpen(true);
    setMessage(`${duplicate.label} duplicated.`);
  };

  return <section className={`layout-editor${inInspector ? " layout-editor-in-inspector" : ""}`} aria-labelledby="layout-editor-heading">
    {showAreaProperties ? <section className="planting-area-properties" aria-labelledby="planting-area-properties-heading">
      <div className="layout-editor-heading">
        <div>
          <p className="section-eyebrow">Planting area</p>
          <h2 id="planting-area-properties-heading">Area properties</h2>
        </div>
      </div>
      <form className="planting-area-property-form" onSubmit={saveAreaProperties}>
        <div className="field"><label htmlFor="editing-planting-area-name">Planting-area name</label><input id="editing-planting-area-name" onChange={(event) => setName(event.target.value)} value={name} /></div>
        <div className="field"><label htmlFor="editing-planting-area-kind">Planting-area type</label><select id="editing-planting-area-kind" onChange={(event) => setKind(event.target.value as GrowingAreaKind)} value={kind}>{growingAreaKinds.map((candidate) => <option key={candidate} value={candidate}>{growingAreaKindLabels[candidate]}</option>)}</select></div>
        <div className="field"><label htmlFor="layout-length">Length (m)</label><input id="layout-length" min="0.1" onChange={(event) => setWidth(event.target.value)} step="0.1" type="number" value={width} /></div>
        <div className="field"><label htmlFor="layout-width">Width (m)</label><input id="layout-width" min="0.1" onChange={(event) => setDepth(event.target.value)} step="0.1" type="number" value={depth} /></div>
        <div className="field"><label htmlFor="editing-planting-area-rotation">Rotation (degrees)</label><input id="editing-planting-area-rotation" onChange={(event) => setRotationDegrees(event.target.value)} step="1" type="number" value={rotationDegrees} /></div>
        {hasAreaPropertyChanges ? <button className="save-button" type="submit">Save</button> : null}
      </form>
    </section> : null}
    <div className="layout-editor-heading layout-editor-heading-current"><div><p className="section-eyebrow">Current season</p><h2 id="layout-editor-heading">Plant layout</h2></div>{inInspector ? <div className="plant-toolbar"><button aria-expanded={isAddFormOpen} className="primary-button" onClick={() => { setIsAddFormOpen(!isAddFormOpen); setIsEditOpen(false); setEditingAllocation(undefined); }} type="button">Add plant</button></div> : null}</div>
    <p className="layout-intro">Place and arrange this season's plants on the measured grid.</p>
    {layout ? <>
      <div className="layout-editor-grid">
        <div className="layout-canvas-wrap"><MetricLayoutCanvas layout={layout} onEdit={openEdit} onMove={moveAllocation} onRemove={removePlant} onSelect={openEdit} selectedId={selectedId} /></div>
        <aside className="allocation-controls" aria-label="Plant controls">
          {!inInspector ? <div className="plant-toolbar">
            <button aria-expanded={isAddFormOpen} className="primary-button" onClick={() => { setIsAddFormOpen(!isAddFormOpen); setIsEditOpen(false); setEditingAllocation(undefined); }} type="button">Add plant</button>
          </div> : null}
          {isEditOpen && selected && editingAllocation ? <div className="selected-allocation"><h3>Edit {selected.label}</h3><div className="selected-fields"><div className="field"><label htmlFor="selected-allocation-plant-type">Plant type</label><input id="selected-allocation-plant-type" list="plant-type-suggestions" onChange={(event) => updateEditingIdentity("plantType", event.target.value)} value={editingAllocation.plantType ?? editingAllocation.label} /></div><div className="field"><label htmlFor="selected-allocation-variety">Variety (optional)</label><input id="selected-allocation-variety" onChange={(event) => updateEditingIdentity("variety", event.target.value)} value={editingAllocation.variety ?? ""} /></div><div className="field"><label htmlFor="allocation-x">X position (m)</label><input id="allocation-x" min="0" onChange={(event) => updateEditingAllocation("x", event.target.value)} step="0.1" type="number" value={editingAllocation.x} /></div><div className="field"><label htmlFor="allocation-y">Y position (m)</label><input id="allocation-y" min="0" onChange={(event) => updateEditingAllocation("y", event.target.value)} step="0.1" type="number" value={editingAllocation.y} /></div><div className="field"><label htmlFor="selected-allocation-diameter">Plant spacing (m)</label><input id="selected-allocation-diameter" min="0.1" onChange={(event) => updateEditingAllocation("diameterMeters", event.target.value)} step="0.1" type="number" value={editingAllocation.diameterMeters} /></div><div className="field"><label htmlFor="selected-allocation-color">Plant color</label><input id="selected-allocation-color" onChange={(event) => updateEditingColor(event.target.value)} type="color" value={allocationPlantColor(editingAllocation, layout.allocations)} /></div></div><div className="form-actions">{JSON.stringify(editingAllocation) !== JSON.stringify(selected) ? <button className="primary-button" onClick={savePlant} type="button">Save plant</button> : null}<button className="duplicate-button" onClick={duplicateSelected} type="button">Duplicate plant</button><button className="secondary-button" onClick={() => { setSelectedId(undefined); setEditingAllocation(undefined); setIsEditOpen(false); }} type="button">Cancel</button><button className="remove-button" onClick={() => removePlant(selected.id)} type="button">Remove plant</button></div></div> : null}
          {isAddFormOpen ? <form className="allocation-form" onSubmit={addAllocation}>
            <h3>Add plant</h3>
            <div className="field"><label htmlFor="allocation-plant-type">Plant type</label><input id="allocation-plant-type" list="plant-type-suggestions" onChange={(event) => setAllocationPlantType(event.target.value)} placeholder="e.g. Tomato or 番茄" required value={allocationPlantType} /></div>
            <div className="field"><label htmlFor="allocation-variety">Variety (optional)</label><input id="allocation-variety" onChange={(event) => setAllocationVariety(event.target.value)} placeholder="e.g. Sun Gold" value={allocationVariety} /></div>
            <div className="field"><label htmlFor="allocation-diameter">Plant spacing (m)</label><input id="allocation-diameter" min="0.1" onChange={(event) => setAllocationDiameter(event.target.value)} step="0.1" type="number" value={allocationDiameter} /></div>
            <div className="field"><label htmlFor="allocation-color">Plant color</label><input id="allocation-color" onChange={(event) => setAllocationColor(event.target.value)} type="color" value={allocationColor || suggestedAllocationColor} /></div>
            <div className="form-actions"><button className="primary-button" type="submit">Add</button><button className="duplicate-button" onClick={addAndDuplicateAllocation} type="button">Add &amp; duplicate</button><button className="secondary-button" onClick={() => setIsAddFormOpen(false)} type="button">Cancel</button></div>
          </form> : null}
        </aside>
      </div>
    </> : <div className="empty-areas"><h3>Set the real measurements first</h3><p>Create a rectangular layout using its real length and width.</p></div>}
    <p aria-live="polite" className="workspace-message" role="status">{message}</p>
  </section>;
}

function MetricLayoutCanvas({ layout, onMove, onSelect, onEdit, onRemove, selectedId }: { layout: GrowingAreaLayout; onMove: (id: string, event: KonvaEventObject<DragEvent>) => void; onSelect: (id: string) => void; onEdit: (id: string) => void; onRemove: (id: string) => void; selectedId?: string }) {
  const scale = pixelsPerMeter(layout), padding = CANVAS_PADDING, width = layout.widthMeters * scale + padding * 2, height = layout.depthMeters * scale + padding * 2;
  const grid = Array.from({ length: Math.floor(layout.widthMeters) + 1 }, (_, index) => index);
  const horizontalGrid = Array.from({ length: Math.floor(layout.depthMeters) + 1 }, (_, index) => index);
  return <><datalist id="plant-type-suggestions">{plantTypeSuggestions.map((plantType) => <option key={plantType} value={plantType} />)}</datalist><Stage aria-label={`Metric layout, ${layout.widthMeters} metres long by ${layout.depthMeters} metres wide`} height={height} width={width}>
    <Layer>
      <Rect fill="#f8fbf6" height={layout.depthMeters * scale} stroke="#183a2a" strokeWidth={2} width={layout.widthMeters * scale} x={padding} y={padding} />
      {grid.map((metre) => <Line key={`vertical-${metre}`} points={[padding + metre * scale, padding, padding + metre * scale, padding + layout.depthMeters * scale]} stroke="#cfd7ce" strokeWidth={1} />)}
      {horizontalGrid.map((metre) => <Line key={`horizontal-${metre}`} points={[padding, padding + metre * scale, padding + layout.widthMeters * scale, padding + metre * scale]} stroke="#cfd7ce" strokeWidth={1} />)}
      {grid.map((metre) => <Text fontSize={11} key={`x-label-${metre}`} text={`${metre} m`} x={padding + metre * scale - 10} y={12} />)}
      {horizontalGrid.map((metre) => <Text fontSize={11} key={`y-label-${metre}`} text={`${metre} m`} x={3} y={padding + metre * scale - 6} />)}
      {layout.allocations.map((allocation) => <Circle aria-label={`${allocation.label} plant`} draggable fill={allocationPlantColor(allocation, layout.allocations)} key={allocation.id} onClick={() => onSelect(allocation.id)} onDblClick={() => onEdit(allocation.id)} onDblTap={() => onEdit(allocation.id)} onDragEnd={(event) => onMove(allocation.id, event)} onTap={() => onSelect(allocation.id)} radius={allocationRadius(allocation, scale)} stroke="#183a2a" strokeWidth={allocation.id === selectedId ? 3 : 1} x={padding + allocation.x * scale} y={padding + allocation.y * scale} />)}
      {layout.allocations.map((allocation) => { const radius = allocationRadius(allocation, scale), x = padding + allocation.x * scale, y = padding + allocation.y * scale, inset = 2; return <Text align="center" data-testid={`allocation-label-${allocation.id}`} ellipsis fill="#ffffff" fontSize={Math.max(6, Math.min(12, radius * 0.6))} height={Math.max(2, radius * 2 - inset * 2)} key={`label-${allocation.id}`} listening={false} text={allocation.label} verticalAlign="middle" width={Math.max(2, radius * 2 - inset * 2)} wrap="none" x={x - radius + inset} y={y - radius + inset} />; })}
      {layout.allocations.map((allocation) => allocation.id === selectedId ? <Circle aria-label={`Remove ${allocation.label}`} fill="#ba3f36" key={`remove-${allocation.id}`} onClick={(event) => { event.cancelBubble = true; onRemove(allocation.id); }} radius={10} stroke="#ffffff" strokeWidth={1} x={padding + allocation.x * scale + allocationRadius(allocation, scale) * 0.65} y={padding + allocation.y * scale - allocationRadius(allocation, scale) * 0.65} /> : null)}
      {layout.allocations.map((allocation) => allocation.id === selectedId ? <Text align="center" fill="#ffffff" fontSize={16} fontStyle="bold" height={20} key={`remove-label-${allocation.id}`} listening={false} text="×" verticalAlign="middle" width={20} x={padding + allocation.x * scale + allocationRadius(allocation, scale) * 0.65 - 10} y={padding + allocation.y * scale - allocationRadius(allocation, scale) * 0.65 - 10} /> : null)}
    </Layer>
  </Stage></>;
}

function pixelsPerMeter(layout: Pick<GrowingAreaLayout, "widthMeters" | "depthMeters">) {
  return Math.max(45, Math.min(160, 620 / Math.max(layout.widthMeters, layout.depthMeters)));
}

function allocationRadius(allocation: PlantAllocation, scale: number) {
  return Math.max(6, allocation.diameterMeters * scale / 2);
}

function createAllocationId() {
  return globalThis.crypto?.randomUUID?.() ?? `allocation-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
