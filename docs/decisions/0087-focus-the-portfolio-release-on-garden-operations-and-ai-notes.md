# ADR-0087: Focus the Portfolio Release on Garden Operations and AI Garden Note

- Status: Accepted. Product changes are pending.
- Date: 2026-11-25
- Scope: Garden Manager portfolio release, public demo, and portfolio presentation.
- Supersedes in part: [ADR-0013](0013-prioritize-garden-operations-and-ai-planning.md) on the release scope for AI, [ADR-0073](0073-separate-the-landing-page-and-use-a-textured-deep-green-look.md) on Plant AI placement, and [ADR-0085](0085-split-one-garden-note-into-reviewed-records-across-gardens.md) on the Plant Doctor link from a note question.

## Context

Garden Manager already covers garden layouts, daily care, and seasonal planning. The public portfolio demo opened live AI Garden Note drafting on November 23 under [ADR-0086](0086-open-the-public-note-demo-on-its-safety-record.md). Plant Doctor and Plant Guide appear as previews in the public demo. The Allocation Assistant runs locally and has a recorded public example. Each feature adds work across navigation, documentation, testing, and model evaluation. The owner chose to narrow the release around one workflow that a visitor can complete end to end.

## Decision

Position Garden Manager as an **AI-assisted garden management and seasonal planning app**. A gardener maps their growing spaces, keeps a record of daily work, and plans next season using planting history and crop-rotation rules.

| Product area | Release scope |
| --- | --- |
| Gardens | Manage multiple gardens, planting areas, and plants in a scaled visual layout. |
| Care | Manage care tasks and completed records. Keep AI Garden Note directly available from Gardens home and through the global `+ Note` entry. |
| Next Season | Use planting history and deterministic crop-rotation checks to review and edit next-season plans. |

AI Garden Note is the sole featured AI workflow. A gardener writes one note, potentially spanning multiple gardens and jobs. The LLM extracts structured drafts. Deterministic checks validate the fields and match eligible care tasks. The gardener reviews, edits, and confirms each record before it is saved. Planned work can be added as a task through review. Follow [ADR-0085](0085-split-one-garden-note-into-reviewed-records-across-gardens.md) and [ADR-0086](0086-open-the-public-note-demo-on-its-safety-record.md) for draft behavior and public demo limits.

| Capability | Disposition |
| --- | --- |
| Plant Doctor | Retire the standalone health assessment from the portfolio release. Remove its public promotion, navigation entry, and link from note question notices. Preserve saved health records and photos during the release cleanup. |
| Plant Guide | Remove the plant question-and-answer experience from the portfolio release. Preserve the local RAG implementation, source cards, tests, and evaluation evidence as an archived experiment. [ADR-0036](0036-use-curated-local-rag-for-plant-knowledge.md) describes that implementation. |
| Allocation Assistant | Freeze the existing tool-calling experiment and retain its code, recorded example, and evaluation in [agent.md](../agent.md). Keep public live runs closed under [ADR-0057](0057-keep-live-allocation-runs-closed-after-evaluation.md). Give the deterministic Next Season workflow the primary product presentation. |
| New capabilities | Defer garden-history Q&A, local community, and sun analysis until after the portfolio release. |

## Rationale and alternatives

AI Garden Note serves a frequent personal workflow across gardens. Its structured outputs, validation, review-before-save flow, model evaluations, and usage limits demonstrate applied LLM engineering. Plant Doctor adds a separate assessment and photo workflow. Plant Guide demonstrates source-grounded retrieval through embeddings and pgvector, with its own maintenance and evaluation needs. AI Garden Note supplies garden context for extraction. Portfolio materials should describe RAG and tool calling as separate, completed experiments and label recorded examples as such.

Keeping either plant assistant in the release would preserve additional product breadth and require a separate experience to explain and maintain. Adding retrieval to AI Garden Note or building garden-history Q&A would expand the release scope. Archiving the existing experiments preserves the technical work while keeping the release focused on the three core areas.

## Consequences and release acceptance

- The landing page, navigation, and demo walkthrough present Gardens, Care and AI Garden Note, and Next Season. Visitors encounter the same scope in the app and its documentation.
- A visitor can open a garden, split a multi-garden note into drafts, review and save valid records, see the corresponding history and task changes, and use planting history to check a next-season plan.
- Verification covers the core workflow, existing saved data, and links formerly pointing to Plant Doctor or Plant Guide. The README explains the live demo, its limitations, and the archived experiments.
- The release gives up public plant-health assessment and source-cited plant Q&A. Archived implementations and evaluations remain available for technical review.

## Reconsideration

Revisit RAG after the release if gardeners repeatedly need to find or summarize relevant past care records in ways that structured filters cannot readily handle. Revisit a plant assistant if user demand justifies a defined workflow and the team can support its evaluation and maintenance. Revisit live allocation only under the quality and budget conditions in ADR-0057.
