import os
from pathlib import Path
from uuid import uuid4

from fastapi import Depends, FastAPI, File, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .ai import CareNoteExtractor, CareNoteProviderError, EmbeddingClient, PlantHealthAssessor, PlantKnowledgeAnswerer, configured_care_note_extractor, configured_embedding_client, configured_plant_health_assessor, configured_plant_knowledge_answerer
from .database import get_session
from .schemas import CareNoteDraftRequest, CareNoteDraftResponse, HealthResponse, PlantHealthAssessmentRequest, PlantHealthAssessmentResponse, PlantKnowledgeAnswer, PlantKnowledgeQuestion, RotationGuidanceRequest, RotationGuidanceResponse, RuntimeConfigResponse, WorkspaceImport
from .service import care_note_draft, import_workspace, load_workspace, plant_health_assessment, plant_knowledge_answer, rotation_guidance, update_workspace, workspace_response

app = FastAPI(title="Garden Manager API", version="0.1.0")
uploads_dir = Path(os.getenv("UPLOADS_DIR", "/tmp/sun-aware-garden-planner-uploads"))
uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("FRONTEND_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(","),
    allow_methods=["GET", "POST", "PUT"],
    allow_headers=["Content-Type"],
)


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@app.get("/runtime-config", response_model=RuntimeConfigResponse, tags=["system"])
def runtime_config() -> RuntimeConfigResponse:
    return RuntimeConfigResponse(portfolio_demo=is_portfolio_demo())


def is_portfolio_demo() -> bool:
    return os.getenv("PORTFOLIO_DEMO_MODE", "").lower() in {"1", "true", "yes"}


def require_local_feature(feature: str) -> None:
    if is_portfolio_demo():
        raise HTTPException(
            status_code=503,
            detail=f"{feature} is available in the local app for this portfolio demo.",
        )


def get_care_note_extractor() -> CareNoteExtractor:
    try:
        return configured_care_note_extractor()
    except CareNoteProviderError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


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


@app.post(
    "/workspaces/{workspace_id}/gardens/{garden_id}/ai/care-note-draft",
    response_model=CareNoteDraftResponse,
    tags=["AI"],
)
def create_care_note_draft(
    workspace_id: str,
    garden_id: str,
    payload: CareNoteDraftRequest,
    session: Session = Depends(get_session),
    extractor: CareNoteExtractor = Depends(get_care_note_extractor),
):
    require_local_feature("AI assistance")
    return care_note_draft(session, workspace_id, garden_id, payload, extractor)


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


@app.put("/workspaces/{workspace_id}", tags=["workspaces"])
def save_server_workspace(
    workspace_id: str,
    payload: WorkspaceImport,
    session: Session = Depends(get_session),
):
    if workspace_id != payload.workspace_id:
        raise HTTPException(status_code=422, detail="workspaceId must match the path parameter")
    return workspace_response(update_workspace(session, payload))
