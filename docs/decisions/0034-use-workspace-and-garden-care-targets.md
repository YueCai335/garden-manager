# ADR-0034: Use Workspace and Garden Care Targets

- Status: Accepted
- Care hub presentation refined by [ADR-0067](0067-project-care-across-locations-with-explicit-ownership.md); stored ownership remains unchanged.
- Date: 2026-09-01
- Supersedes: [ADR-0020](0020-support-garden-area-and-plant-group-care-targets.md)
- Related: [ADR-0023](0023-keep-care-history-as-completed-record.md) and [ADR-0033](0033-use-deterministic-fallbacks-for-clear-ai-care-notes.md)

## Context

A workspace can contain multiple geographic gardens, such as a front yard,
back yard, community plot, or patio. Each garden contains planting areas, and
each planting area can contain plant groups. Care records need to represent
actions at each of these levels without presenting an ambiguous label.

The earlier target model stored every care record inside one garden. That made
the label "Whole garden" unclear when a workspace contained several locations.
It also could not accurately represent one action applied to every garden.

## Decision

Store care records at the level their target describes:

- workspace records target **All gardens**;
- garden records target one named geographic garden;
- garden records can also target one planting area or one plant group.

The Care hub offers one card for All gardens and one card for each named
garden. The target selector uses the selected garden name, such as Back garden,
for location-wide care. AI note extraction maps explicit workspace-wide phrases
to All gardens and phrases about all beds in the selected location to that
garden.

## Why This Option

- The stored location matches the gardener's intent and the visible label.
- All-garden history remains available after a particular garden is deleted.
- Existing planting-area and plant-group workflows stay focused inside their
  owning garden.
- The separation keeps PostgreSQL foreign keys and API validation direct.

## Alternatives Considered

### Store All Care Records Inside One Garden

This creates incorrect ownership for workspace-wide work and makes history
depend on an arbitrary location.

### Use One Garden Target Label for Every Scope

One label cannot distinguish a geographic garden from every garden in the
workspace.

### Add Multi-Target Care Records

Multi-target records require a join table, batch editing rules, and target
specific completion behavior. A workspace-wide target and a single named
garden cover the current workflows with a smaller model.

## Consequences

- The workspace schema moves to version 9 and adds root care-event and
  care-task collections.
- PostgreSQL stores workspace-wide records in dedicated tables.
- Version 8 browser workspaces migrate with empty workspace-wide collections.
- One care record continues to have one target. Care that applies to selected
  areas across several gardens remains future work.

## Revisit When

Revisit this decision when users need one record to target several selected
gardens or planting areas, need target-specific fertilizer amounts, or share a
workspace with other gardeners.
