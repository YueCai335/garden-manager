import json
import logging
import os
from collections.abc import Iterator
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, HTTPException, Request, Response, UploadFile, status
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from .agent.allocation import AllocationRequest
from .agent.loop import ModelClient
from .agent.openai_model import DEFAULT_MODEL, OpenAIAllocationModel
from .agent.service import camel_case_response, season_allocation
from .ai import DEFAULT_CARE_NOTE_OPENAI_MODEL, CareNoteExtractor, CareNoteProviderError, OpenAICareNoteExtractor, EmbeddingClient, PlantHealthAssessor, PlantKnowledgeAnswerer, configured_care_note_extractor, configured_embedding_client, configured_plant_health_assessor, configured_plant_knowledge_answerer
from .care_note_public import REQUEST_ID_HEADER, new_request_id, public_care_note_draft, public_generation_available
from .care_note_batch import CareNoteBatchDraftResponse, CareNoteBatchExtractor, OpenAICareNoteBatchExtractor, care_note_batch, configured_batch_extractor
from .care_note_batch_public import public_batch_available, public_care_note_batch
from .database import get_session
from .schemas import CareNoteDraftRequest, CareNoteDraftResponse, HealthResponse, PlantHealthAssessmentRequest, PlantHealthAssessmentResponse, PlantKnowledgeAnswer, PlantKnowledgeQuestion, RotationGuidanceRequest, RotationGuidanceResponse, RuntimeConfigResponse, SeasonAllocationRequest, WorkspaceImport, WorkspaceSave
from .service import care_note_draft, import_workspace, load_workspace, plant_health_assessment, plant_knowledge_answer, rotation_guidance, update_workspace, workspace_response

def configure_agent_logging() -> None:
    """Emit the per-request usage records of the paid AI paths (ADR-0056, ADR-0059).

    Uvicorn configures only its own loggers and leaves the root at WARNING, so
    INFO records from these loggers would otherwise be dropped.
    """
    for name in ("app.agent", "app.care_note_public", "app.care_note_batch_public"):
        paid_logger = logging.getLogger(name)
        paid_logger.setLevel(logging.INFO)
        if not any(handler.get_name() == name for handler in paid_logger.handlers):
            handler = logging.StreamHandler()
            handler.set_name(name)
            handler.setFormatter(logging.Formatter("%(levelname)s %(name)s %(message)s"))
            paid_logger.addHandler(handler)


configure_agent_logging()
app = FastAPI(title="Garden Manager API", version="0.1.0")
uploads_dir = Path(os.getenv("UPLOADS_DIR", "/tmp/sun-aware-garden-planner-uploads"))
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type"],
    # Lets the browser read the public AI Garden Note request ID (ADR-0059).
    expose_headers=[REQUEST_ID_HEADER],
)


@app.exception_handler(RequestValidationError)
async def request_validation_error(request: Request, error: RequestValidationError) -> Response:
    """FastAPI's 422 body, written as ASCII-escaped JSON.

    The default handler echoes the rejected input. A lone surrogate from a JSON
    escape such as \\ud800 cannot be encoded as UTF-8, so the default response
    fails with a 500; the escaped form carries the same JSON for any client.
    """
    return Response(
        json.dumps({"detail": jsonable_encoder(error.errors())}, ensure_ascii=True),
        status_code=422,
        media_type="application/json",
    )


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/health/db", response_model=HealthResponse, tags=["system"])
def database_health(session: Session = Depends(get_session)) -> HealthResponse:
    """Run one read-only query so the scheduled keep-alive reaches the database (ADR-0074).

    `/health` stays database-free because Render uses it to decide whether the
    API is up; a database outage should not make Render restart the service.
    """
    try:
        session.execute(text("SELECT 1"))
    except SQLAlchemyError as error:
        raise HTTPException(status_code=503, detail="Database unavailable") from error
    return HealthResponse(status="ok")


@app.get("/runtime-config", response_model=RuntimeConfigResponse, tags=["system"])
def runtime_config() -> RuntimeConfigResponse:
    return RuntimeConfigResponse(
        portfolio_demo=is_portfolio_demo(),
        care_note_public_available=is_portfolio_demo() and public_generation_available(),
        care_note_batch_available=not is_portfolio_demo(),
        # The public demo's batch path (ADR-0086); the browser shows it only behind its own build flag.
        care_note_batch_public_available=is_portfolio_demo() and public_batch_available(),
    )


def is_portfolio_demo() -> bool:
    return os.getenv("PORTFOLIO_DEMO_MODE", "").lower() in {"1", "true", "yes"}


def require_local_feature(feature: str) -> None:
    if is_portfolio_demo():
        raise HTTPException(
            status_code=503,
            detail=f"{feature} is available in the local app for this portfolio demo.",
        )


def get_care_note_extractor() -> CareNoteExtractor | None:
    if is_portfolio_demo():
        # The public path builds its own OpenAI extractor (ADR-0059).
        return None
    try:
        return configured_care_note_extractor()
    except CareNoteProviderError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


def get_care_note_batch_extractor() -> CareNoteBatchExtractor | None:
    if is_portfolio_demo():
        # The public path builds its own OpenAI extractor (ADR-0086).
        return None
    try:
        return configured_batch_extractor()
    except CareNoteProviderError as error:
        raise HTTPException(status_code=503, detail="AI Garden Note is unavailable. Enter records manually or try again later.") from error


def get_public_care_note_batch_extractor() -> OpenAICareNoteBatchExtractor | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not is_portfolio_demo() or not api_key:
        return None
    # public_batch_available() refuses any model other than the approved one.
    return OpenAICareNoteBatchExtractor(api_key, os.getenv("CARE_NOTE_OPENAI_MODEL", DEFAULT_CARE_NOTE_OPENAI_MODEL))


def get_public_care_note_extractor() -> OpenAICareNoteExtractor | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not is_portfolio_demo() or not api_key:
        return None
    # public_generation_available() refuses any model other than the approved one.
    return OpenAICareNoteExtractor(api_key, os.getenv("CARE_NOTE_OPENAI_MODEL", DEFAULT_CARE_NOTE_OPENAI_MODEL))


def get_plant_health_assessor() -> PlantHealthAssessor:
    try:
        return configured_plant_health_assessor()
    except CareNoteProviderError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


def get_embedding_client() -> EmbeddingClient:
    try:
        return configured_embedding_client()
    except CareNoteProviderError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


def get_plant_knowledge_answerer() -> PlantKnowledgeAnswerer:
    try:
        return configured_plant_knowledge_answerer()
    except CareNoteProviderError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


def get_season_allocation_model() -> Iterator[ModelClient | None]:
    # The agent uses OpenAI regardless of AI_PROVIDER, with its own pinned model.
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        yield None
        return
    model = OpenAIAllocationModel(api_key, os.getenv("AGENT_OPENAI_MODEL", DEFAULT_MODEL))
    try:
        yield model
    finally:
        # Each request builds its own client; close its connection pool.
        model.close()


@app.put("/workspaces/{workspace_id}/import", status_code=status.HTTP_201_CREATED, tags=["workspaces"])
def import_local_workspace(
    workspace_id: str,
    payload: WorkspaceImport,
    session: Session = Depends(get_session),
):
    if workspace_id != payload.workspace_id:
        raise HTTPException(status_code=422, detail="workspaceId must match the path parameter")
    return workspace_response(import_workspace(session, payload))


@app.get("/workspaces/{workspace_id}", tags=["workspaces"])
def get_workspace(workspace_id: str, session: Session = Depends(get_session)):
    workspace = load_workspace(session, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    return workspace_response(workspace)


@app.post(
    "/workspaces/{workspace_id}/gardens/{garden_id}/rotation-guidance",
    response_model=RotationGuidanceResponse,
    tags=["garden planning"],
)
def get_rotation_guidance(
    workspace_id: str,
    garden_id: str,
    payload: RotationGuidanceRequest,
    session: Session = Depends(get_session),
):
    return rotation_guidance(session, workspace_id, garden_id, payload)


@app.post("/workspaces/{workspace_id}/ai/care-note-drafts", response_model=CareNoteBatchDraftResponse, tags=["AI"])
def create_care_note_batch(
    workspace_id: str,
    payload: CareNoteDraftRequest,
    request: Request,
    response: Response,
    extractor: CareNoteBatchExtractor | None = Depends(get_care_note_batch_extractor),
    public_extractor: OpenAICareNoteBatchExtractor | None = Depends(get_public_care_note_batch_extractor),
    session: Session = Depends(get_session),
):
    server_today = datetime.now(timezone.utc).date()
    if is_portfolio_demo():
        # The fixed showcase gardens, not the workspace in the path, are the model's context (ADR-0086).
        request_id = new_request_id()
        try:
            result = public_care_note_batch(
                payload,
                public_extractor,
                server_today=server_today,
                # Uvicorn sets this from forwarding headers only for trusted proxies (FORWARDED_ALLOW_IPS).
                client_ip=request.client.host if request.client else "unknown",
                request_id=request_id,
            )
        except HTTPException as error:
            error.headers = {**(error.headers or {}), REQUEST_ID_HEADER: request_id}
            raise
        response.headers[REQUEST_ID_HEADER] = request_id
        return result
    if extractor is None:
        raise HTTPException(status_code=503, detail="AI Garden Note is unavailable. Enter records manually or try again later.")
    return care_note_batch(session, workspace_id, payload, extractor, server_today)


@app.post(
    "/workspaces/{workspace_id}/gardens/{garden_id}/ai/care-note-draft",
    response_model=CareNoteDraftResponse,
    tags=["AI"],
)
def create_care_note_draft(
    workspace_id: str,
    garden_id: str,
    payload: CareNoteDraftRequest,
    request: Request,
    response: Response,
    session: Session = Depends(get_session),
    extractor: CareNoteExtractor | None = Depends(get_care_note_extractor),
    public_extractor: OpenAICareNoteExtractor | None = Depends(get_public_care_note_extractor),
):
    server_today = datetime.now(timezone.utc).date()
    if is_portfolio_demo():
        # The fixed demo garden, not the workspace in the path, is the model's context (ADR-0059).
        request_id = new_request_id()
        try:
            draft = public_care_note_draft(
                garden_id,
                payload,
                public_extractor,
                server_today=server_today,
                # Uvicorn sets this from forwarding headers only for trusted proxies (FORWARDED_ALLOW_IPS).
                client_ip=request.client.host if request.client else "unknown",
                request_id=request_id,
            )
        except HTTPException as error:
            error.headers = {**(error.headers or {}), REQUEST_ID_HEADER: request_id}
            raise
        response.headers[REQUEST_ID_HEADER] = request_id
        return draft
    return care_note_draft(session, workspace_id, garden_id, payload, extractor, server_today=server_today)


@app.post(
    "/workspaces/{workspace_id}/gardens/{garden_id}/plant-health/photos",
    tags=["plant health"],
)
async def upload_plant_health_photo(
    workspace_id: str,
    garden_id: str,
    photo: UploadFile = File(...),
    session: Session = Depends(get_session),
):
    require_local_feature("Photo upload")
    workspace = load_workspace(session, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    if not any(garden.external_id == garden_id for garden in workspace.gardens):
        raise HTTPException(status_code=404, detail="Garden not found in this workspace")
    suffixes = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
    suffix = suffixes.get(photo.content_type or "")
    if suffix is None:
        raise HTTPException(status_code=415, detail="Upload a JPEG, PNG, or WebP photo.")
    content = await photo.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Each photo must be 10 MB or smaller.")
    filename = f"{uuid4().hex}{suffix}"
    (uploads_dir / filename).write_bytes(content)
    return {"path": f"/uploads/{filename}"}


@app.post(
    "/workspaces/{workspace_id}/gardens/{garden_id}/ai/plant-health-assessment",
    response_model=PlantHealthAssessmentResponse,
    tags=["AI"],
)
def create_plant_health_assessment(
    workspace_id: str,
    garden_id: str,
    payload: PlantHealthAssessmentRequest,
    session: Session = Depends(get_session),
    assessor: PlantHealthAssessor = Depends(get_plant_health_assessor),
):
    require_local_feature("AI assistance")
    return plant_health_assessment(session, workspace_id, garden_id, payload, assessor)


@app.post(
    "/workspaces/{workspace_id}/plant-knowledge/answer",
    response_model=PlantKnowledgeAnswer,
    tags=["AI"],
)
def create_plant_knowledge_answer(
    workspace_id: str,
    payload: PlantKnowledgeQuestion,
    session: Session = Depends(get_session),
    embedding_client: EmbeddingClient = Depends(get_embedding_client),
    answerer: PlantKnowledgeAnswerer = Depends(get_plant_knowledge_answerer),
):
    require_local_feature("AI assistance")
    return plant_knowledge_answer(session, workspace_id, payload, embedding_client, answerer)


@app.post("/workspaces/{workspace_id}/gardens/{garden_id}/ai/season-allocation", tags=["AI"])
def create_season_allocation(
    workspace_id: str,
    garden_id: str,
    payload: SeasonAllocationRequest,
    session: Session = Depends(get_session),
    model: ModelClient | None = Depends(get_season_allocation_model),
):
    # Unlike the other AI endpoints, this one runs in the portfolio demo too,
    # on the fixed demo garden and a cumulative run limit (ADR-0056).
    result = season_allocation(
        session,
        workspace_id,
        garden_id,
        AllocationRequest(
            crops=payload.crops, preference=payload.preference, growing_area_ids=payload.growing_area_ids
        ),
        model,
        public=is_portfolio_demo(),
        today=date.today(),
    )
    return camel_case_response(result)


@app.put("/workspaces/{workspace_id}", tags=["workspaces"])
def save_server_workspace(
    workspace_id: str,
    payload: WorkspaceSave,
    session: Session = Depends(get_session),
):
    if workspace_id != payload.workspace_id:
        raise HTTPException(status_code=422, detail="workspaceId must match the path parameter")
    return update_workspace(session, payload)
