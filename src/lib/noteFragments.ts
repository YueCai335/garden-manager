import type { CareDraftRow } from "./careNoteBatch";
import type { GardenWorkspace } from "./gardenWorkspace";

/**
 * The review's split view (ADR-0085): the note cut into the sentences that became records, and
 * the records grouped by garden. Both are plain functions so the screen only draws them.
 */

export type NoteSegment = { text: string; draftIds: string[]; kind?: "record" | "notice" };

/**
 * The note in order, with each quoted fragment marked. A fragment is found at its first unused
 * place; one that is missing or overlaps an earlier fragment stays plain text. Drafts that share a
 * quote ("watered Backyard and Front Yard") share one fragment.
 */
export function noteSegments(note: string, rows: Pick<CareDraftRow, "draftId" | "sourceText">[], notices: { sourceText: string }[]): NoteSegment[] {
  const quotes = new Map<string, { draftIds: string[]; kind: "record" | "notice" }>();
  for (const row of rows) {
    if (!row.sourceText) continue;
    const quote = quotes.get(row.sourceText) ?? { draftIds: [], kind: "record" as const };
    quote.draftIds.push(row.draftId);
    quotes.set(row.sourceText, quote);
  }
  for (const notice of notices) if (notice.sourceText && !quotes.has(notice.sourceText)) quotes.set(notice.sourceText, { draftIds: [], kind: "notice" });

  const spans: { start: number; end: number; draftIds: string[]; kind: "record" | "notice" }[] = [];
  for (const [text, quote] of quotes) {
    let from = 0;
    while (from <= note.length) {
      const start = note.indexOf(text, from);
      if (start < 0) break;
      const end = start + text.length;
      if (!spans.some((span) => start < span.end && end > span.start)) { spans.push({ start, end, ...quote }); break; }
      from = start + 1;
    }
  }
  spans.sort((a, b) => a.start - b.start);

  const segments: NoteSegment[] = [];
  let at = 0;
  for (const span of spans) {
    if (span.start > at) segments.push({ text: note.slice(at, span.start), draftIds: [] });
    segments.push({ text: note.slice(span.start, span.end), draftIds: span.draftIds, kind: span.kind });
    at = span.end;
  }
  if (at < note.length) segments.push({ text: note.slice(at), draftIds: [] });
  return segments;
}

export type NoteGroup = { key: string; name: string; gardenId?: string; rows: CareDraftRow[] };

/** Records by garden, in the workspace's garden order; then all gardens; then records with no garden yet. */
export function noteGroups(workspace: GardenWorkspace, rows: CareDraftRow[]): NoteGroup[] {
  const groups: NoteGroup[] = workspace.gardens.map((garden) => ({ key: garden.id, name: garden.name, gardenId: garden.id, rows: [] }));
  const all: NoteGroup = { key: "all-gardens", name: "All gardens", rows: [] };
  const unassigned: NoteGroup = { key: "unassigned", name: "Choose a garden", rows: [] };
  for (const row of rows) {
    const group = row.targetScope === "all-gardens" ? all : groups.find((item) => item.gardenId === row.gardenId) ?? unassigned;
    group.rows.push(row);
  }
  return [...groups, all, unassigned].filter((group) => group.rows.length);
}
