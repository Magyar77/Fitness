import { describe, expect, it } from 'vitest';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import { formatRest, formatRir, formatSetsReps } from '../../src/engine/format';
import { EXERCISES_BY_ID } from '../../src/engine/library/exercises';
import { EQUIPMENT } from '../../src/engine/library/equipment';

// Rows copied verbatim from the docx tables: [exercise, sets × reps, RIR, rest].
const DOC: Record<string, [string, string, string, string][]> = {
  A: [
    ['Dead hang', '2 × max', '–', '60 s'],
    ['Scapular pull-ups', '2 × 8', '2–3', '60 s'],
    ['Barbell bench press', '4 × 6–8', '2', '2–3 min'],
    ['Seated dumbbell shoulder press', '3 × 8–10', '2', '90 s'],
    ['Incline dumbbell press (30°)', '3 × 8–12', '1–2', '90 s'],
    ['Dumbbell lateral raises', '3 × 12–15', '1–2', '60 s'],
    ['Cable triceps pushdown', '3 × 10–12', '1', '60 s'],
  ],
  B: [
    ['Barbell back squat', '3 × 6–8', '2', '2–3 min'],
    ['Romanian deadlift', '3 × 8–10', '2', '2 min'],
    ['Dumbbell Bulgarian split squat', '2 × 8–10 / leg', '2', '90 s'],
    ['Leg curl (machine)', '2 × 10–12', '1', '60 s'],
    ['Hanging knee raises', '3 × 8–12', '1–2', '60 s'],
    ['Hollow body hold', '3 × 20–40 s', '–', '60 s'],
  ],
  C: [
    ['Scapular pull-ups', '2 × 8', '3', '60 s'],
    ['Assisted negative pull-ups (5 s lowering)', '4 × 3', '–', '2 min'],
    ['Assisted pull-ups (machine)', '3 × 6–8', '1–2', '2 min'],
    ['Lat pulldown', '3 × 8–12', '1–2', '90 s'],
    ['Single-arm dumbbell row', '3 × 10–12 / arm', '1–2', '60–90 s'],
    ['Cable face pulls', '2 × 12–15', '2', '60 s'],
    ['Barbell or EZ-bar curls', '3 × 8–12', '1', '60 s'],
    ['Dead hang', '2 × max', '–', '60 s'],
  ],
  E: [
    ['Leg press', '3 × 10–12', '3', '90 s'],
    ['Dumbbell walking lunges', '2 × 10 / leg', '3', '90 s'],
    ['45° back extension', '2 × 12', '3', '60 s'],
    ['Standing calf raises', '3 × 12–15', '2', '60 s'],
    ['Dead bug', '3 × 8 / side', '–', '45 s'],
    ['Side plank', '2 × 30 s / side', '–', '45 s'],
    ['Bike or incline walk, easy', '15–20 min', '–', '–'],
  ],
  D: [
    ['Dead hang', '2 × max', '–', '60 s'],
    ['Dumbbell bench press (flat)', '3 × 8–12', '1–2', '2 min'],
    ['Seated cable row', '3 × 10–12', '1–2', '90 s'],
    ['Assisted dips (machine)', '3 × 6–10', '2', '90 s'],
    ['Dumbbell lateral raises', '3 × 12–15', '1–2', '60 s'],
    // The docx superset row "Incline DB curl + overhead cable triceps extension (superset)" is two slots.
    ['Incline DB curl', '2 × 10–12 each', '1', '60 s'],
    ['Overhead cable triceps extension', '2 × 10–12 each', '1', '60 s'],
    ["Farmer's carry", '3 × 30–40 m', '–', '60–90 s'],
  ],
};

describe('Program v2 import', () => {
  it('has workouts A, B, C, E, D in the documented order', () => {
    expect(PROGRAM_V2.templates.map((t) => t.code)).toEqual(['A', 'B', 'C', 'E', 'D']);
    expect(PROGRAM_V2.canonicalOrder).toEqual(['A', 'B', 'C', 'E', 'D']);
    expect(PROGRAM_V2.isOriginal).toBe(true);
  });

  for (const [code, rows] of Object.entries(DOC)) {
    it(`workout ${code} matches the document row by row`, () => {
      const t = PROGRAM_V2.templates.find((x) => x.code === code)!;
      const actual = t.slots.map((s) => [s.name, formatSetsReps(s), formatRir(s.rir), formatRest(s.restSec)]);
      expect(actual).toEqual(rows);
    });
  }

  it('keeps documented durations and notes', () => {
    const t = Object.fromEntries(PROGRAM_V2.templates.map((x) => [x.code, x]));
    expect([t.A, t.B, t.C, t.E, t.D].map((x) => x!.estMinutes)).toEqual([55, 50, 60, 45, 55]);
    expect(t.E!.notes[0]).toBe('No pulling or pressing on this day, so arms and grip are fresh for Saturday.');
    expect(t.E!.easyDay).toBe(true);
    expect(t.C!.slots[1]!.notes).toContain('5 s lowering');
  });

  it('links lateral raises A↔D and groups the D superset', () => {
    const slots = PROGRAM_V2.templates.flatMap((t) => t.slots);
    expect(slots.filter((s) => s.linkGroup === 'lateral-raise').map((s) => s.slotKey)).toEqual(['A-06', 'D-05']);
    expect(slots.filter((s) => s.supersetGroup === 'D-06').map((s) => s.slotKey)).toEqual(['D-06a', 'D-06b']);
  });

  it('is internally consistent', () => {
    const slots = PROGRAM_V2.templates.flatMap((t) => t.slots);
    expect(new Set(slots.map((s) => s.slotKey)).size).toBe(slots.length);
    const profiles = new Set(EQUIPMENT.map((e) => e.id));
    for (const s of slots) {
      const ex = EXERCISES_BY_ID.get(s.exerciseId);
      expect(ex, s.slotKey).toBeDefined();
      if (ex!.equipmentProfileId) expect(profiles.has(ex!.equipmentProfileId), ex!.id).toBe(true);
    }
  });

  it('derives the assisted-machine ladder from a 15 lb stack and 5 lb lever', () => {
    const ladder = EQUIPMENT.find((e) => e.id === 'assisted-machine')!.loadsKg!;
    expect(ladder).toEqual([0, 2.3, 6.8, 9.1, 13.6, 15.9, 20.4, 22.7, 27.2, 29.5, 34, 36.3]);
  });
});
