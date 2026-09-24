"""The allocation agent's two read-only tools (ADR-0056).

Each tool has a Pydantic argument model; the JSON schema sent to the model is
generated from that same class, so the two cannot drift apart. A tool never
raises for bad model input: every problem comes back as an error result the
model can read and correct.
"""

import json
from dataclasses import dataclass
from typing import Callable

from pydantic import Field, ValidationError

from .allocation import (
    CROPS,
    AgentModel,
    AllocationScope,
    Assignment,
    GardenSnapshot,
    allocation_errors,
    check_assignments,
    rotation_summary,
)


class GetPlantingHistoryArgs(AgentModel):
    pass


class CheckAllocationArgs(AgentModel):
    assignments: list[Assignment] = Field(min_length=1)


@dataclass(frozen=True)
class ToolResult:
    ok: bool
    output: dict
    summary: str


def get_planting_history(snapshot: GardenSnapshot, scope: AllocationScope, _args: GetPlantingHistoryArgs) -> ToolResult:
    rows = rotation_summary(snapshot, scope)
    # Nested {area: {year: [groups]}} instead of one object per row: the same
    # facts in a fraction of the bytes. Areas and the season year are already
    # in the first message.
    history: dict[str, dict[str, list[str]]] = {area.id: {} for area in scope.areas}
    for row in rows:
        history[row.growing_area_id].setdefault(str(row.year), []).append(row.rotation_group)
    return ToolResult(
        ok=True,
        output={
            "crop_rotation_groups": {crop: CROPS[crop][1] for crop in scope.crops},
            "history": history,
        },
        summary=f"{len(rows)} history rows for {len(scope.areas)} areas",
    )


def check_allocation(snapshot: GardenSnapshot, scope: AllocationScope, args: CheckAllocationArgs) -> ToolResult:
    errors = allocation_errors(scope, args.assignments, complete=False)
    if errors:
        return error_result(errors)
    checks = check_assignments(snapshot, scope, args.assignments)
    warnings = sum(check.warning for check in checks)
    # Rotation details only matter where there is a warning; leaving them out
    # elsewhere keeps later requests inside the byte limit.
    no_warning_details = {"repeated_years", "rotation_friendly_groups"}
    return ToolResult(
        ok=True,
        output={
            "checks": [
                check.model_dump(exclude=None if check.warning else no_warning_details) for check in checks
            ]
        },
        summary=f"{len(checks)} checked, {warnings} rotation warnings",
    )


@dataclass(frozen=True)
class Tool:
    name: str
    description: str
    args_model: type[AgentModel]
    run: Callable


TOOLS = {
    tool.name: tool
    for tool in (
        Tool(
            name="get_planting_history",
            description=(
                "Return the rotation group of each selected crop, and which rotation groups each "
                "selected growing area grew in the previous three years."
            ),
            args_model=GetPlantingHistoryArgs,
            run=get_planting_history,
        ),
        Tool(
            name="check_allocation",
            description=(
                "Check a candidate assignment of crops to growing areas against the crop-rotation rule. "
                "Returns a warning per assignment when the area grew the same rotation group in the "
                "previous three years, plus rotation-friendly groups for that area."
            ),
            args_model=CheckAllocationArgs,
            run=check_allocation,
        ),
    )
}


def tool_definitions() -> list[dict]:
    """Tool definitions in the exact shape the Responses API receives."""
    return [
        {
            "type": "function",
            "name": tool.name,
            "description": tool.description,
            "parameters": tool.args_model.model_json_schema(),
            # Non-strict first; run_tool validates every call either way.
            "strict": False,
        }
        for tool in TOOLS.values()
    ]


def error_result(errors: list[str]) -> ToolResult:
    return ToolResult(ok=False, output={"error": " ".join(errors)}, summary=f"error: {errors[0]}")


def run_tool(name: str, arguments: str, snapshot: GardenSnapshot, scope: AllocationScope) -> ToolResult:
    tool = TOOLS.get(name)
    if tool is None:
        return error_result([f"Unknown tool {name}. Available tools: {', '.join(TOOLS)}."])
    try:
        args = tool.args_model.model_validate_json(arguments or "{}")
    except ValidationError as error:
        problems = [
            f"{'.'.join(str(part) for part in issue['loc']) or 'arguments'}: {issue['msg']}"
            for issue in error.errors()
        ]
        return error_result([f"Invalid arguments for {name}: {'; '.join(problems)}."])
    return tool.run(snapshot, scope, args)


def parse_arguments(arguments: str) -> dict | str:
    """Arguments for the trace: parsed JSON when possible, otherwise the raw text."""
    try:
        parsed = json.loads(arguments or "{}")
    except json.JSONDecodeError:
        return arguments
    return parsed if isinstance(parsed, dict) else arguments
