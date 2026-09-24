"""HTTP-facing flow for the season-allocation agent (ADR-0056).

Local mode reads the stored garden and has no run limit. Public demo mode
reads a fixed copy of the demo garden, allows one run at a time, and reserves
a run from the shared cumulative budget before the first model request.
"""

import json
import threading
from datetime import date
from importlib import resources

from fastapi import HTTPException
from sqlalchemy.orm import Session

from ..service import load_workspace
from .allocation import AllocationRequest, AreaSnapshot, GardenSnapshot, PlantingSnapshot, garden_snapshot
from .budget import public_run_limit, reserve_public_run
from .loop import AllocationRunResult, ModelClient, run_allocation_agent


PUBLIC_DEMO_GARDEN_ID = "demo-garden"

# One public run at a time. This holds only with one API process: the Render
# start command runs uvicorn with --workers 1.
public_run_lock = threading.Lock()


def load_demo_garden() -> GardenSnapshot:
    data = json.loads(resources.files("app.agent").joinpath("demo_garden.json").read_text(encoding="utf-8"))
    return GardenSnapshot(
        garden_id=data["gardenId"],
        areas=tuple(AreaSnapshot(area["id"], area["name"], area["kind"]) for area in data["growingAreas"]),
        plantings=tuple(
            PlantingSnapshot(
                id=planting["id"],
                common_name=planting["commonName"],
                crop_family=planting["cropFamily"],
                planting_date=date.fromisoformat(planting["plantingDate"]),
                growing_area_id=planting["growingAreaId"],
            )
            for planting in data["plantings"]
        ),
    )


def stored_garden(session: Session, workspace_id: str, garden_id: str) -> GardenSnapshot:
    workspace = load_workspace(session, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    garden = next((garden for garden in workspace.gardens if garden.external_id == garden_id), None)
    if garden is None:
        raise HTTPException(status_code=404, detail="Garden not found in this workspace")
    return garden_snapshot(garden)


def season_allocation(
    session: Session,
    workspace_id: str,
    garden_id: str,
    request: AllocationRequest,
    model: ModelClient | None,
    *,
    public: bool,
    today: date,
) -> AllocationRunResult:
    if not public:
        return run_allocation_agent(stored_garden(session, workspace_id, garden_id), request, model, today=today)

    if garden_id != PUBLIC_DEMO_GARDEN_ID:
        raise HTTPException(status_code=404, detail="The portfolio demo plans the demo garden only.")
    if not public_run_lock.acquire(blocking=False):
        raise HTTPException(status_code=429, detail="Another example run is in progress. Try again in a moment.")
    try:
        limit = public_run_limit()
        return run_allocation_agent(
            load_demo_garden(), request, model, today=today, reserve_run=lambda: reserve_public_run(limit)
        )
    finally:
        public_run_lock.release()


def camel_case_response(result: AllocationRunResult) -> dict:
    """camelCase keys for the HTTP contract. Trace args stay exactly as the model sent them."""

    def camel(key: str) -> str:
        first, *rest = key.split("_")
        return first + "".join(part.title() for part in rest)

    def convert(value):
        if isinstance(value, list):
            return [convert(item) for item in value]
        if isinstance(value, dict):
            return {camel(key): item if key == "args" else convert(item) for key, item in value.items()}
        return value

    return convert(result.model_dump(mode="json"))
