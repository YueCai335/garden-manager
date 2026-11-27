import type { CareEventType } from "@/lib/careTypes";

/**
 * The landing page's AI Note showcase (ADR-0088): three fixed sample notes, the reviewed
 * records each one becomes, and the timed sequence that splits a note into numbered blocks and
 * saves the records. The samples are pre-recorded and never call the note API, so the landing page
 * costs nothing per visit and always plays the same way.
 */

export type NoteRecord = {
  type: CareEventType;
  garden: string;
  /** Label and value pairs, in the order the review card shows them. */
  fields: [label: string, value: string][];
  /** The due task this record ticks off, as the note page words it. */
  completes?: { title: string; due: string };
};

export type NoteSample = {
  id: string;
  /** The sample's button: the note's opening words. */
  label: string;
  /** The note, split into plain text and phrases; a phrase names the record it becomes. */
  segments: { text: string; record?: number }[];
  records: NoteRecord[];
};

export const noteSamples: NoteSample[] = [
  {
    id: "two-gardens",
    label: "Watered the tomatoes…",
    segments: [
      { text: "Watered the tomatoes in the backyard", record: 0 },
      { text: ", " },
      { text: "fed raised bed A with fish emulsion", record: 1 },
      { text: ", and " },
      { text: "sprayed soap on the aphids at the allotment", record: 2 },
      { text: "." },
    ],
    records: [
      { type: "watering", garden: "Backyard", fields: [["Plant", "Tomato"]], completes: { title: "Water Backyard", due: "today" } },
      { type: "fertilizing", garden: "Backyard", fields: [["Area", "Raised bed A"], ["Product", "Fish emulsion"]] },
      { type: "pest-treatment", garden: "Allotment", fields: [["Problem", "Aphids"], ["Treatment", "Soap spray"]] },
    ],
  },
  {
    id: "balcony",
    label: "Pruned the basil…",
    segments: [
      { text: "Pruned the basil", record: 0 },
      { text: " and " },
      { text: "watered both pots on the balcony", record: 1 },
      { text: " before work." },
    ],
    records: [
      { type: "pruning", garden: "Balcony", fields: [["Plant", "Basil"]] },
      { type: "watering", garden: "Balcony", fields: [["Area", "Pot 1, Pot 2"]], completes: { title: "Water Balcony", due: "yesterday" } },
    ],
  },
  {
    id: "planting-day",
    label: "Planted 6 lettuce…",
    segments: [
      { text: "Planted 6 lettuce in bed 2 at the allotment", record: 0 },
      { text: " and " },
      { text: "gave the backyard peppers 2 L of tomato feed", record: 1 },
      { text: "." },
    ],
    records: [
      { type: "planting", garden: "Allotment", fields: [["Area", "Bed 2"], ["Plant", "Lettuce × 6"]] },
      { type: "fertilizing", garden: "Backyard", fields: [["Plant", "Pepper"], ["Product", "Tomato feed · 2 L"]] },
    ],
  },
];

export const noteText = (sample: NoteSample) => sample.segments.map((segment) => segment.text).join("");

export type NoteShowcaseState = {
  /** The "Read note" chip is working. */
  reading: boolean;
  /** How many records have split off the note so far. */
  found: number;
  /** The save bar is showing. */
  review: boolean;
  /** The save button is pressed down for a moment. */
  pressed: boolean;
  /** How many records show "Saved". */
  saved: number;
  /** The step card that is lit, or null when none is. */
  active: number | null;
  finished: boolean;
};

export type NoteShowcaseAction =
  | { type: "find"; record: number }
  | { type: "review" }
  | { type: "press" }
  | { type: "save"; record: number }
  | { type: "finish" };

/** The note is already written when the stage comes into view, so the split starts at once. */
export const initialNoteState: NoteShowcaseState = { reading: false, found: 0, review: false, pressed: false, saved: 0, active: 0, finished: false };

export function applyNoteAction(state: NoteShowcaseState, action: NoteShowcaseAction): NoteShowcaseState {
  switch (action.type) {
    case "find": return { ...state, reading: true, active: 1, found: Math.max(state.found, action.record + 1) };
    case "review": return { ...state, reading: false, review: true, active: 2 };
    case "press": return { ...state, pressed: true };
    case "save": return { ...state, pressed: false, saved: Math.max(state.saved, action.record + 1) };
    case "finish": return { ...state, pressed: false, active: null, finished: true };
  }
}

export type TimedNoteAction = { at: number; action: NoteShowcaseAction };

/** When the first record splits off, and the gap before each next one. */
const FIRST_SPLIT_MS = 300;
const SPLIT_GAP_MS = 400;

/** The full sequence for one sample: split record by record, review, then save. */
export function noteTimeline(sample: NoteSample): TimedNoteAction[] {
  const events: TimedNoteAction[] = [];
  let at = FIRST_SPLIT_MS;
  sample.records.forEach((_, record) => { events.push({ at, action: { type: "find", record } }); at += SPLIT_GAP_MS; });
  at += 200;
  events.push({ at, action: { type: "review" } });
  at += 1200;
  events.push({ at, action: { type: "press" } });
  sample.records.forEach((_, record) => events.push({ at: at + 200 + record * 140, action: { type: "save", record } }));
  events.push({ at: at + 300 + sample.records.length * 140, action: { type: "finish" } });
  return events;
}

/** Where every sequence ends: the whole note, every record split and saved. */
export function finalNoteState(sample: NoteSample): NoteShowcaseState {
  const count = sample.records.length;
  return { reading: false, found: count, review: true, pressed: false, saved: count, active: null, finished: true };
}

/** The care type names the note page uses (careTypeName in careLabels), kept here so the landing bundle stays small. */
export const recordTypeName: Record<CareEventType, string> = {
  watering: "Watering", fertilizing: "Fertilizing", planting: "Planting", pruning: "Pruning", "pest-treatment": "Pest treatment",
};

/** "Watering in Backyard, Pest treatment in Allotment…", for the stage's accessible name. */
export function sampleDescription(sample: NoteSample, typeName: Record<CareEventType, string> = recordTypeName) {
  const records = sample.records.map((record) => `${typeName[record.type]} in ${record.garden}`).join(", ");
  return `Sample note: “${noteText(sample)}” It splits into ${sample.records.length} reviewed records: ${records}.`;
}
