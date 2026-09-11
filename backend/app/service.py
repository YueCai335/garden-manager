import hashlib
import json
from math import sqrt

from fastapi import HTTPException
from sqlalchemy import select, update
from sqlalchemy.orm import Session, selectinload

from .ai import CareNoteExtractor, EmbeddingClient, PlantHealthAssessor, PlantKnowledgeAnswerer, complete_known_care_note_fields
from .knowledge import SEED_KNOWLEDGE_CARDS
from .models import CareEvent, CareTask, Garden, GrowingArea, HealthRecord, KnowledgeChunk, KnowledgeSource, PlannedPlanting, Planting, SeasonPlan, Workspace, WorkspaceCareEvent, WorkspaceCareTask
from .rotation import ROTATION_GROWING_AREA_KINDS, RotationPlanting, evaluate_rotation
from .schemas import CareNoteDraftRequest, PlantHealthAssessmentRequest, PlantKnowledgeAnswer, PlantKnowledgeQuestion, RotationGuidanceRequest, WorkspaceImport, WorkspaceSave


def import_fingerprint(workspace: WorkspaceImport) -> str:
    payload = workspace.model_dump(mode="json", by_alias=True, exclude_none=True)
    return hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def load_workspace(session: Session, workspace_id: str) -> Workspace | None:
    return session.scalar(
        select(Workspace)
        .where(Workspace.id == workspace_id)
        .options(
            selectinload(Workspace.gardens).selectinload(Garden.growing_areas),
            selectinload(Workspace.gardens).selectinload(Garden.plantings),
            selectinload(Workspace.gardens).selectinload(Garden.season_plans).selectinload(SeasonPlan.plantings),
            selectinload(Workspace.gardens).selectinload(Garden.care_events),
            selectinload(Workspace.gardens).selectinload(Garden.care_tasks),
            selectinload(Workspace.gardens).selectinload(Garden.health_records),
            selectinload(Workspace.care_events),
            selectinload(Workspace.care_tasks),
        )
    )


def import_workspace(session: Session, payload: WorkspaceImport) -> Workspace:
    fingerprint = import_fingerprint(payload)
    existing = load_workspace(session, payload.workspace_id)
    if existing:
        if existing.import_hash == fingerprint:
            return existing
        raise HTTPException(
            status_code=409,
            detail="This workspace was already imported. Use the server-backed workflow for later changes.",
        )

    workspace = Workspace(
        id=payload.workspace_id,
        schema_version=payload.version,
        selected_garden_external_id=payload.selected_garden_id,
        import_hash=fingerprint,
    )
    session.add(workspace)
    write_workspace(workspace, payload)
    session.commit()
    return load_workspace(session, payload.workspace_id)  # type: ignore[return-value]


def update_workspace(session: Session, payload: WorkspaceSave) -> Workspace:
    workspace = load_workspace(session, payload.workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    # Optimistic lock: bump the revision only if it still matches what the
    # client read. The conditional UPDATE is atomic, so two clients racing on
    # the same revision cannot both win.
    claimed = session.execute(
        update(Workspace)
        .where(Workspace.id == payload.workspace_id, Workspace.revision == payload.revision)
        .values(revision=Workspace.revision + 1)
    )
    if claimed.rowcount != 1:
        session.rollback()
        current = load_workspace(session, payload.workspace_id)
        raise HTTPException(
            status_code=409,
            detail={
                "message": "This workspace was changed elsewhere since it was loaded. Reload it before saving again.",
                "currentRevision": current.revision if current else None,
            },
        )
    session.refresh(workspace)
    write_workspace(workspace, payload)
    session.commit()
    return load_workspace(session, payload.workspace_id)  # type: ignore[return-value]


def rotation_guidance(
    session: Session,
    workspace_id: str,
    garden_id: str,
    payload: RotationGuidanceRequest,
) -> dict:
    workspace = load_workspace(session, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    garden = next((garden for garden in workspace.gardens if garden.external_id == garden_id), None)
    if garden is None:
        raise HTTPException(status_code=404, detail="Garden not found in this workspace")
    area = next((area for area in garden.growing_areas if area.external_id == payload.growing_area_id), None)
    if area is None:
        raise HTTPException(status_code=422, detail="growingAreaId must reference a growing area in this garden")
    if payload.exclude_planting_id:
        excluded = next((planting for planting in garden.plantings if planting.external_id == payload.exclude_planting_id), None)
        if excluded is None or excluded.growing_area_id != area.id:
            raise HTTPException(status_code=422, detail="excludePlantingId must reference a planting in this growing area")
    evaluation = evaluate_rotation(
        growing_area_kind=area.kind,
        crop_family=payload.crop_family,
        planting_date=payload.planting_date,
        plantings=[
            RotationPlanting(
                id=planting.external_id,
                common_name=planting.common_name,
                crop_family=planting.crop_family,
                planting_date=planting.planting_date,
            )
            for planting in garden.plantings
            if planting.growing_area_id == area.id and planting.external_id != payload.exclude_planting_id
        ],
    )
    history = [
        {
            "plantingId": planting.id,
            "commonName": planting.common_name,
            "cropFamily": planting.crop_family,
            "plantingDate": planting.planting_date,
            "season": planting.planting_date.year,
        }
        for planting in evaluation["history"]
    ]
    warning_plantings = [
        {
            "plantingId": planting.id,
            "commonName": planting.common_name,
            "cropFamily": planting.crop_family,
            "plantingDate": planting.planting_date,
            "season": planting.planting_date.year,
        }
        for planting in evaluation["warning_plantings"]
    ]
    return {
        "growingAreaId": area.external_id,
        "growingAreaKind": area.kind,
        "season": payload.planting_date.year,
        "history": history,
        "warning": {"cropFamily": payload.crop_family, "plantings": warning_plantings} if evaluation["warning"] else None,
        "automatedWarningSupported": area.kind in ROTATION_GROWING_AREA_KINDS,
        "hasAutomaticCompatibilityConclusion": evaluation["has_automatic_compatibility_conclusion"],
        "rotationFriendlyCropFamilies": evaluation["rotation_friendly_crop_families"],
    }


def care_note_draft(
    session: Session,
    workspace_id: str,
    garden_id: str,
    payload: CareNoteDraftRequest,
    extractor: CareNoteExtractor,
) -> dict:
    workspace = load_workspace(session, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    garden = next((garden for garden in workspace.gardens if garden.external_id == garden_id), None)
    if garden is None:
        raise HTTPException(status_code=404, detail="Garden not found in this workspace")

    garden_context = {
        "name": garden.name,
        "plantingAreas": [area.name for area in garden.growing_areas],
        "plantGroups": [planting.common_name for planting in garden.plantings],
    }
    extraction = complete_known_care_note_fields(
        extractor.extract(payload.note, garden_context),
        payload.note,
        garden_context,
    )
    target = resolve_care_note_target(garden, extraction.target_scope, extraction.target_name)
    review_notes: list[str] = []
    if extraction.type is None:
        review_notes.append("Choose a care type before saving.")
    if extraction.date is None:
        review_notes.append("Choose the care date before saving.")
    if target is None:
        target = {"targetScope": "garden"}
        if extraction.target_name:
            review_notes.append("Choose a target because the note did not match one garden item.")

    return {
        "type": extraction.type,
        "date": extraction.date,
        "note": payload.note,
        **target,
        **(
            {
                "fertilizerProduct": extraction.fertilizer_product,
                "fertilizerAmount": extraction.fertilizer_amount,
                "fertilizerUnit": extraction.fertilizer_unit,
            }
            if extraction.type == "fertilizing"
            else {}
        ),
        "reviewNotes": review_notes,
    }


def plant_health_assessment(
    session: Session,
    workspace_id: str,
    garden_id: str,
    payload: PlantHealthAssessmentRequest,
    assessor: PlantHealthAssessor,
) -> dict:
    workspace = load_workspace(session, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    garden = next((garden for garden in workspace.gardens if garden.external_id == garden_id), None)
    if garden is None:
        raise HTTPException(status_code=404, detail="Garden not found in this workspace")
    return assessor.assess(
        payload.symptoms,
        payload.severity,
        payload.photo_count,
        {
            "name": garden.name,
            "plantingAreas": [area.name for area in garden.growing_areas],
            "plantGroups": [planting.common_name for planting in garden.plantings],
        },
    ).model_dump(by_alias=True)


def plant_knowledge_answer(
    session: Session,
    workspace_id: str,
    payload: PlantKnowledgeQuestion,
    embedding_client: EmbeddingClient,
    answerer: PlantKnowledgeAnswerer,
) -> dict:
    workspace = load_workspace(session, workspace_id)
    if workspace is None:
        raise HTTPException(status_code=404, detail="Workspace not found")
    garden = None
    if payload.garden_id:
        garden = next((candidate for candidate in workspace.gardens if candidate.external_id == payload.garden_id), None)
        if garden is None:
            raise HTTPException(status_code=422, detail="gardenId must reference a garden in this workspace")

    seed_knowledge_cards(session)
    chunks = list(
        session.scalars(
            select(KnowledgeChunk)
            .options(selectinload(KnowledgeChunk.source))
            .order_by(KnowledgeChunk.position)
        )
    )
    missing_embeddings = [chunk for chunk in chunks if chunk.embedding_model != embedding_client.model or chunk.embedding is None]
    if missing_embeddings:
        for chunk, embedding in zip(missing_embeddings, embedding_client.embed([chunk.content for chunk in missing_embeddings]), strict=True):
            chunk.embedding = embedding
            chunk.embedding_model = embedding_client.model
        session.commit()

    query_embedding = embedding_client.embed([payload.question])[0]
    evidence = retrieve_knowledge(session, chunks, query_embedding)
    if not evidence or cosine_similarity(query_embedding, evidence[0].embedding) < 0.2:
        return PlantKnowledgeAnswer(
            answer="The current Plant Knowledge library does not contain enough evidence for that question. Add the plant name, symptom, timing, and recent care details, or consult a local plant diagnostic service.",
            confidence="low",
            followUpQuestions=["Which plant is affected?", "What changed first, and when did it begin?"],
            citations=[],
        ).model_dump(by_alias=True)

    garden_context = None if garden is None else {
        "name": garden.name,
        "plantingAreas": [area.name for area in garden.growing_areas],
        "plantGroups": [planting.common_name for planting in garden.plantings],
    }
    draft = answerer.answer(
        payload.question,
        garden_context,
        [{"title": chunk.source.title, "publisher": chunk.source.publisher, "content": chunk.content} for chunk in evidence],
    )
    citations = []
    seen_source_keys: set[str] = set()
    for chunk in evidence:
        if chunk.source.source_key in seen_source_keys:
            continue
        seen_source_keys.add(chunk.source.source_key)
        citations.append({
            "sourceKey": chunk.source.source_key,
            "title": chunk.source.title,
            "publisher": chunk.source.publisher,
            "sourceUrl": chunk.source.source_url,
            "reviewedOn": chunk.source.reviewed_on,
            "excerpt": chunk.content,
        })
    return PlantKnowledgeAnswer(
        **draft.model_dump(by_alias=True),
        citations=citations,
    ).model_dump(by_alias=True)


def seed_knowledge_cards(session: Session) -> None:
    existing_keys = set(session.scalars(select(KnowledgeSource.source_key)))
    for position, card in enumerate(SEED_KNOWLEDGE_CARDS):
        if card.source_key in existing_keys:
            continue
        source = KnowledgeSource(
            source_key=card.source_key,
            title=card.title,
            publisher=card.publisher,
            source_url=card.source_url,
            reviewed_on=card.reviewed_on,
        )
        source.chunks.append(
            KnowledgeChunk(
                external_id=f"{card.source_key}-summary",
                position=position,
                content=card.content,
                tags=card.tags,
            )
        )
        session.add(source)
    session.commit()


def retrieve_knowledge(session: Session, chunks: list[KnowledgeChunk], query_embedding: list[float]) -> list[KnowledgeChunk]:
    if session.bind and session.bind.dialect.name == "postgresql":
        return list(
            session.scalars(
                select(KnowledgeChunk)
                .where(KnowledgeChunk.embedding.is_not(None))
                .options(selectinload(KnowledgeChunk.source))
                .order_by(KnowledgeChunk.embedding.cosine_distance(query_embedding))
                .limit(4)
            )
        )
    return sorted(
        [chunk for chunk in chunks if chunk.embedding is not None],
        key=lambda chunk: cosine_similarity(query_embedding, chunk.embedding),
        reverse=True,
    )[:4]


def cosine_similarity(left: list[float], right) -> float:
    right_values = list(right)
    denominator = sqrt(sum(value * value for value in left)) * sqrt(sum(value * value for value in right_values))
    if not denominator:
        return 0
    return sum(left_value * right_value for left_value, right_value in zip(left, right_values, strict=True)) / denominator


def resolve_care_note_target(garden: Garden, target_scope: str | None, target_name: str | None) -> dict | None:
    if target_scope == "all-gardens":
        return {"targetScope": "all-gardens"}
    if target_scope in (None, "garden"):
        return {"targetScope": "garden"}
    if not target_name:
        return None
    normalized_name = target_name.casefold()
    if target_scope == "planting-area":
        matches = [area for area in garden.growing_areas if area.name.casefold() == normalized_name]
        if len(matches) == 1:
            return {
                "targetScope": "planting-area",
                "growingAreaId": matches[0].external_id,
                "growingAreaName": matches[0].name,
            }
    if target_scope == "plant-group":
        matches = [planting for planting in garden.plantings if planting.common_name.casefold() == normalized_name]
        if len(matches) == 1:
            return {
                "targetScope": "plant-group",
                "plantingRecordId": matches[0].external_id,
                "plantingRecordName": planting_target_name(matches[0], garden),
            }
    return None


def planting_target_name(planting: Planting, garden: Garden) -> str:
    area = next((area for area in garden.growing_areas if area.id == planting.growing_area_id), None)
    return f"{planting.common_name} · {area.name if area else 'Planting area'}"


def write_workspace(workspace: Workspace, payload: WorkspaceImport) -> None:
    workspace.schema_version = payload.version
    workspace.selected_garden_external_id = payload.selected_garden_id
    workspace.gardens.clear()
    workspace.care_events.clear()
    workspace.care_tasks.clear()
    session = Session.object_session(workspace)
    if session is None:
        raise RuntimeError("Workspace must be attached to a session")
    session.flush()
    for position, event_input in enumerate(payload.care_events):
        workspace.care_events.append(
            WorkspaceCareEvent(
                external_id=event_input.id,
                position=position,
                event_type=event_input.type,
                occurred_on=event_input.date,
                note=event_input.note,
                fertilizer_product=event_input.fertilizer_product,
                fertilizer_amount=event_input.fertilizer_amount,
                fertilizer_unit=event_input.fertilizer_unit,
            )
        )
    for position, task_input in enumerate(payload.care_tasks):
        workspace.care_tasks.append(
            WorkspaceCareTask(
                external_id=task_input.id,
                position=position,
                task_type=task_input.type,
                due_date=task_input.due_date,
                note=task_input.note,
                repeat_interval_days=task_input.repeat_interval_days,
            )
        )
    for garden_position, garden_input in enumerate(payload.gardens):
        garden = Garden(
            external_id=garden_input.id,
            position=garden_position,
            name=garden_input.name,
            plan_width_meters=garden_input.plan.width_meters,
            plan_depth_meters=garden_input.plan.depth_meters,
        )
        workspace.gardens.append(garden)
        areas: dict[str, GrowingArea] = {}
        for position, area_input in enumerate(garden_input.growing_areas):
            area = GrowingArea(
                external_id=area_input.id,
                position=position,
                name=area_input.name,
                kind=area_input.kind,
                plan_x=area_input.plan_placement.x,
                plan_y=area_input.plan_placement.y,
                plan_rotation_degrees=area_input.plan_placement.rotation_degrees,
                layout=area_input.layout.model_dump(by_alias=True, exclude_none=True) if area_input.layout else None,
            )
            garden.growing_areas.append(area)
            areas[area_input.id] = area
        for position, planting_input in enumerate(garden_input.plantings):
            garden.plantings.append(
                Planting(
                    external_id=planting_input.id,
                    position=position,
                    common_name=planting_input.common_name,
                    plant_type=planting_input.plant_type,
                    variety=planting_input.variety,
                    crop_family=planting_input.crop_family,
                    quantity=planting_input.quantity,
                    planting_date=planting_input.planting_date,
                    is_active=planting_input.is_active,
                    growing_area=areas[planting_input.growing_area_id],
                )
            )
        for plan_input in garden_input.season_plans:
            season_plan = SeasonPlan(
                external_id=plan_input.id,
                season_year=plan_input.season_year,
            )
            garden.season_plans.append(season_plan)
            for position, planting_input in enumerate(plan_input.plantings):
                season_plan.plantings.append(
                    PlannedPlanting(
                        external_id=planting_input.id,
                        position=position,
                        common_name=planting_input.common_name,
                        plant_type=planting_input.plant_type,
                        variety=planting_input.variety,
                        crop_family=planting_input.crop_family,
                        growing_area=areas[planting_input.growing_area_id],
                    )
                )
        for position, event_input in enumerate(garden_input.care_events):
            garden.care_events.append(
                CareEvent(
                    external_id=event_input.id,
                    position=position,
                    event_type=event_input.type,
                    occurred_on=event_input.date,
                    note=event_input.note,
                    fertilizer_product=event_input.fertilizer_product,
                    fertilizer_amount=event_input.fertilizer_amount,
                    fertilizer_unit=event_input.fertilizer_unit,
                    **target_fields(event_input),
                )
            )
        for position, task_input in enumerate(garden_input.care_tasks):
            garden.care_tasks.append(
                CareTask(
                    external_id=task_input.id,
                    position=position,
                    task_type=task_input.type,
                    due_date=task_input.due_date,
                    note=task_input.note,
                    repeat_interval_days=task_input.repeat_interval_days,
                    **target_fields(task_input),
                )
            )
        for position, health_input in enumerate(garden_input.health_records):
            garden.health_records.append(
                HealthRecord(
                    external_id=health_input.id,
                    position=position,
                    observed_on=health_input.observed_on,
                    symptoms=health_input.symptoms,
                    severity=health_input.severity,
                    photo_paths=health_input.photo_paths,
                    assessment=health_input.assessment.model_dump(by_alias=True) if health_input.assessment else None,
                    **target_fields(health_input),
                )
            )


def target_fields(record):
    return {
        "target_scope": record.target_scope,
        "growing_area_external_id": record.growing_area_id,
        "growing_area_name_snapshot": record.growing_area_name,
        "target_area_deleted": record.target_area_deleted,
        "planting_external_id": record.planting_record_id,
        "planting_name_snapshot": record.planting_record_name,
        "target_planting_deleted": record.target_planting_record_deleted,
    }


def workspace_response(workspace: Workspace) -> dict:
    return {
        "workspaceId": workspace.id,
        "version": 10,
        "revision": workspace.revision,
        "selectedGardenId": workspace.selected_garden_external_id,
        "gardens": [garden_response(garden) for garden in workspace.gardens],
        "careEvents": [workspace_care_event_response(event) for event in workspace.care_events],
        "careTasks": [workspace_care_task_response(task) for task in workspace.care_tasks],
    }


def garden_response(garden: Garden) -> dict:
    return {
        "id": garden.external_id,
        "name": garden.name,
        "plan": {"widthMeters": garden.plan_width_meters, "depthMeters": garden.plan_depth_meters},
        "growingAreas": [
            {
                "id": area.external_id,
                "name": area.name,
                "kind": area.kind,
                "planPlacement": {"x": area.plan_x, "y": area.plan_y, "rotationDegrees": area.plan_rotation_degrees},
                **({"layout": area.layout} if area.layout is not None else {}),
            }
            for area in garden.growing_areas
        ],
        "plantings": [
            {
                "id": planting.external_id,
                "commonName": planting.common_name,
                **({"plantType": planting.plant_type} if planting.plant_type is not None else {}),
                **({"variety": planting.variety} if planting.variety is not None else {}),
                "cropFamily": planting.crop_family,
                "quantity": planting.quantity,
                "plantingDate": planting.planting_date.isoformat(),
                "growingAreaId": planting.growing_area.external_id,
                "isActive": planting.is_active,
            }
            for planting in garden.plantings
        ],
        "seasonPlans": [
            {
                "id": plan.external_id,
                "seasonYear": plan.season_year,
                "plantings": [
                    {
                        "id": planting.external_id,
                        "commonName": planting.common_name,
                        **({"plantType": planting.plant_type} if planting.plant_type is not None else {}),
                        **({"variety": planting.variety} if planting.variety is not None else {}),
                        "cropFamily": planting.crop_family,
                        "growingAreaId": planting.growing_area.external_id,
                    }
                    for planting in plan.plantings
                ],
            }
            for plan in garden.season_plans
        ],
        "careEvents": [care_event_response(event) for event in garden.care_events],
        "careTasks": [care_task_response(task) for task in garden.care_tasks],
        "healthRecords": [health_record_response(record) for record in garden.health_records],
    }


def target_response(record) -> dict:
    fields = {"targetScope": record.target_scope}
    if record.growing_area_external_id is not None:
        fields.update(
            {
                "growingAreaId": record.growing_area_external_id,
                "growingAreaName": record.growing_area_name_snapshot,
                **({"targetAreaDeleted": record.target_area_deleted} if record.target_area_deleted is not None else {}),
            }
        )
    if record.planting_external_id is not None:
        fields.update(
            {
                "plantingRecordId": record.planting_external_id,
                "plantingRecordName": record.planting_name_snapshot,
                **({"targetPlantingRecordDeleted": record.target_planting_deleted} if record.target_planting_deleted is not None else {}),
            }
        )
    return fields


def care_event_response(event: CareEvent) -> dict:
    return {
        "id": event.external_id,
        "type": event.event_type,
        "date": event.occurred_on.isoformat(),
        "note": event.note,
        **target_response(event),
        **({"fertilizerProduct": event.fertilizer_product} if event.fertilizer_product is not None else {}),
        **({"fertilizerAmount": event.fertilizer_amount} if event.fertilizer_amount is not None else {}),
        **({"fertilizerUnit": event.fertilizer_unit} if event.fertilizer_unit is not None else {}),
    }


def care_task_response(task: CareTask) -> dict:
    return {
        "id": task.external_id,
        "type": task.task_type,
        "dueDate": task.due_date.isoformat(),
        "note": task.note,
        **target_response(task),
        **({"repeatIntervalDays": task.repeat_interval_days} if task.repeat_interval_days is not None else {}),
    }


def health_record_response(record: HealthRecord) -> dict:
    return {
        "id": record.external_id,
        "observedOn": record.observed_on.isoformat(),
        "symptoms": record.symptoms,
        "severity": record.severity,
        "photoPaths": record.photo_paths,
        **target_response(record),
        **({"assessment": record.assessment} if record.assessment is not None else {}),
    }


def workspace_care_event_response(event: WorkspaceCareEvent) -> dict:
    return {
        "id": event.external_id,
        "type": event.event_type,
        "date": event.occurred_on.isoformat(),
        "note": event.note,
        "targetScope": "all-gardens",
        **({"fertilizerProduct": event.fertilizer_product} if event.fertilizer_product is not None else {}),
        **({"fertilizerAmount": event.fertilizer_amount} if event.fertilizer_amount is not None else {}),
        **({"fertilizerUnit": event.fertilizer_unit} if event.fertilizer_unit is not None else {}),
    }


def workspace_care_task_response(task: WorkspaceCareTask) -> dict:
    return {
        "id": task.external_id,
        "type": task.task_type,
        "dueDate": task.due_date.isoformat(),
        "note": task.note,
        "targetScope": "all-gardens",
        **({"repeatIntervalDays": task.repeat_interval_days} if task.repeat_interval_days is not None else {}),
    }
