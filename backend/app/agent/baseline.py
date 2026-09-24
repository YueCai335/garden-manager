"""Deterministic baseline for the allocation evaluation (ADR-0056).

With at most three areas and five crops there are at most 3^5 = 243
assignments, so the baseline tries every one and keeps the one with the
fewest rotation warnings. It cannot read a free-text preference.
"""

from dataclasses import dataclass
from itertools import product

from .allocation import AllocationScope, Assignment, GardenSnapshot, check_assignments


@dataclass(frozen=True)
class BaselineAllocation:
    assignments: list[Assignment]
    warnings: int


def baseline_allocation(snapshot: GardenSnapshot, scope: AllocationScope) -> BaselineAllocation:
    """The assignment with the fewest warnings. Ties go to the first one in a
    fixed order: crops in scope order, each trying areas in scope order."""
    area_ids = [area.id for area in scope.areas]
    best: BaselineAllocation | None = None
    for choice in product(area_ids, repeat=len(scope.crops)):
        assignments = [Assignment(growing_area_id=area, crop=crop) for crop, area in zip(scope.crops, choice)]
        warnings = sum(check.warning for check in check_assignments(snapshot, scope, assignments))
        if best is None or warnings < best.warnings:
            best = BaselineAllocation(assignments, warnings)
    assert best is not None  # build_scope guarantees at least one crop and one area
    return best
