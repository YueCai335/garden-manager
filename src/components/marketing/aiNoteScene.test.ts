import { expect, it } from "vitest";
import { careTypeName } from "@/lib/careLabels";
import { careEventTypes } from "@/lib/careTypes";
import {
  applyNoteAction,
  finalNoteState,
  initialNoteState,
  noteSamples,
  noteTimeline,
  recordTypeName,
  sampleDescription,
} from "./aiNoteScene";

function run(sample: (typeof noteSamples)[number]) {
  const states = [initialNoteState];
  for (const { action } of noteTimeline(sample)) states.push(applyNoteAction(states.at(-1)!, action));
  return states;
}

it.each(noteSamples.map((sample) => [sample.id, sample] as const))("plays %s from an empty note to every record saved", (_, sample) => {
  const states = run(sample);
  expect(states.at(-1)).toEqual(finalNoteState(sample));
  const timeline = noteTimeline(sample);
  // Times only move forward.
  expect(timeline.every((event, index) => index === 0 || event.at >= timeline[index - 1].at)).toBe(true);
  // Nothing types out: the first block splits off at once and every block within about a second.
  const finds = timeline.filter(({ action }) => action.type === "find");
  expect(finds[0].at).toBeLessThanOrEqual(400);
  expect(finds.at(-1)!.at).toBeLessThanOrEqual(1200);
  // Records split off in order and are saved only after the save bar appears.
  expect(finds.map(({ action }) => action.type === "find" && action.record)).toEqual(sample.records.map((_, record) => record));
  const firstSave = states.findIndex((state) => state.saved > 0);
  expect(states[firstSave - 1].review).toBe(true);
  // The step cards light 01, 02, 03 in turn, then all show as done.
  const actives = states.map((state) => state.active).filter((active, index, all) => index === 0 || active !== all[index - 1]);
  expect(actives).toEqual([0, 1, 2, null]);
});

it("gives every record exactly one phrase of its note, and at most three blocks for the three block colours", () => {
  for (const sample of noteSamples) {
    expect(sample.records.length, sample.id).toBeLessThanOrEqual(3);
    const phrases = sample.segments.flatMap((segment) => segment.record === undefined ? [] : [segment.record]);
    expect([...phrases].sort(), sample.id).toEqual(sample.records.map((_, record) => record));
  }
});

it("spans more than one garden in the first sample, as the note page does (ADR-0085)", () => {
  expect(new Set(noteSamples[0].records.map((record) => record.garden)).size).toBeGreaterThan(1);
  expect(noteSamples[0].records.some((record) => record.completes)).toBe(true);
});

it("names care types the way the note page does", () => {
  for (const type of careEventTypes) expect(recordTypeName[type]).toBe(careTypeName[type]);
  expect(sampleDescription(noteSamples[0])).toBe(
    "Sample note: “Watered the tomatoes in the backyard, fed raised bed A with fish emulsion, and sprayed soap on the aphids at the allotment.” "
    + "It splits into 3 reviewed records: Watering in Backyard, Fertilizing in Backyard, Pest treatment in Allotment.",
  );
});
