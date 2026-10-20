import { describe, expect, it } from 'vitest';
import { durationLabel, estimateMinutes, formatMinutes, plannedMinutes, sessionMinutes, typicalMinutes } from '../../src/engine/duration';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import type { TemplateSlot, WorkoutSession, WorkoutTemplate } from '../../src/engine/model';

const slot = (p: Partial<TemplateSlot>): TemplateSlot => ({
  slotKey: 'x', order: 1, exerciseId: 'e', name: 'n', sets: 3, target: { kind: 'reps', min: 8, max: 12 }, perSide: null, rir: null, restSec: { min: 90, max: 90 }, notes: [], rule: { id: 'none' }, ...p,
});
const session = (p: Partial<WorkoutSession>): WorkoutSession => ({
  id: crypto.randomUUID(), date: '2026-03-01', templateCode: 'A', programVersionId: null, status: 'completed', startedAt: '2026-03-01T17:00:00Z', finishedAt: '2026-03-01T17:52:00Z',
  fatigue: null, discomfort: [], conditions: [], notes: [], flags: [], prescriptionSnapshot: null, ...p,
});

describe('workout duration', () => {
  it('estimates from sets, reps and rests, rounded to 5 minutes', () => {
    // 5 min warm-up + 3 × (25 s + 35 s) + 2 × 90 s rest = 11 min → 10
    expect(estimateMinutes({ slots: [slot({})] })).toBe(10);
    expect(estimateMinutes({ slots: [slot({}), slot({ order: 2 })] })).toBe(20);
    expect(estimateMinutes({ slots: [] })).toBe(0);
  });

  it('counts both sides, timed holds, cardio and supersets', () => {
    const one = estimateMinutes({ slots: [slot({ sets: 4, target: { kind: 'reps', min: 15, max: 15 } })] });
    expect(estimateMinutes({ slots: [slot({ sets: 4, target: { kind: 'reps', min: 15, max: 15 }, perSide: 'leg' })] })).toBeGreaterThan(one);
    expect(estimateMinutes({ slots: [slot({ sets: null, target: { kind: 'duration', minMin: 20, maxMin: 30 }, restSec: null })] })).toBe(30);
    const pair = [slot({ supersetGroup: 'g' }), slot({ order: 2, supersetGroup: 'g' })];
    const apart = [slot({}), slot({ order: 2 })];
    expect(estimateMinutes({ slots: pair })).toBeLessThan(estimateMinutes({ slots: apart }));
  });

  it('lands close to the times written in Program v2', () => {
    for (const t of PROGRAM_V2.templates.filter((x) => x.code !== 'E')) {
      expect(Math.abs(estimateMinutes(t) - t.estMinutes!), t.code).toBeLessThanOrEqual(5);
    }
    expect(plannedMinutes(PROGRAM_V2.templates[0]!)).toBe(PROGRAM_V2.templates[0]!.estMinutes);
  });

  it('measures finished sessions, preferring the time you entered, ignoring implausible ones', () => {
    expect(sessionMinutes(session({}))).toBe(52);
    expect(sessionMinutes(session({ durationMin: 61 }))).toBe(61);
    expect(sessionMinutes(session({ finishedAt: '2026-03-02T09:00:00Z' }))).toBeNull(); // forgot to finish
    expect(sessionMinutes(session({ status: 'in_progress' }))).toBeNull();
  });

  it('switches to your usual time after two sessions', () => {
    const t = { ...PROGRAM_V2.templates[0]!, code: 'A' } as WorkoutTemplate;
    expect(durationLabel(t, [session({})])).toBe(`~${t.estMinutes} min`);
    const three = [session({}), session({ date: '2026-03-03', durationMin: 70 }), session({ date: '2026-03-05', durationMin: 58 })];
    expect(typicalMinutes(three, 'A')).toBe(58);
    expect(durationLabel(t, three)).toBe('usually 58 min');
    expect(formatMinutes(75)).toBe('1 h 15 min');
  });
});
