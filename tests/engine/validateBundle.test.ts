import { describe, expect, it } from 'vitest';
import { validateBundle } from '../../src/engine/import/validateBundle';
import { logSets, times } from '../../src/engine/import/compact';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import { EXERCISES_BY_ID } from '../../src/engine/library/exercises';
import type { DataBundle } from '../../src/engine/model';

// Anonymised fixture: one A session.
function fixture(): DataBundle {
  return {
    format: 'personal-fitness-bundle',
    version: 1,
    description: 'fixture',
    sessions: [
      {
        id: 's1', date: '2026-01-06', templateCode: 'A', programVersionId: PROGRAM_V2.id, status: 'completed',
        startedAt: null, finishedAt: null, fatigue: 2, discomfort: [], conditions: [], notes: [], flags: [], prescriptionSnapshot: null,
      },
    ],
    sets: [
      ...logSets('s1', 'A-03', 'barbell-bench-press', times(4, { w: 40, r: 8, rir: 2 })),
      ...logSets('s1', null, 'cycling', [{ t: 600 }]),
    ],
    prescriptions: [
      { id: 'p1', slotKey: 'A-03', effectiveFrom: '2026-01-07', loadKg: 42.5, repTargets: [6, 6, 6, 6], text: '42.5 kg', status: 'active', quality: 'confirmed', source: 'engine', sourceRef: 'test' },
      { id: 'p2', linkGroup: 'lateral-raise', effectiveFrom: '2026-01-07', loadKg: 8, text: '8 kg', status: 'active', quality: 'confirmed', source: 'engine', sourceRef: 'test' },
    ],
    weekPlans: [
      { weekStart: '2026-01-05', restDays: ['2026-01-11'], unavailableDays: [], status: 'saved', notes: [],
        entries: [{ date: '2026-01-06', templateCode: 'A', origin: 'generated', state: 'done', sessionId: 's1' }] },
    ],
    bodyWeights: [{ date: '2026-01-06', kg: 80, source: 'manual' }],
  };
}

const check = (b: DataBundle) => validateBundle(b, [PROGRAM_V2], EXERCISES_BY_ID);

describe('validateBundle', () => {
  it('accepts a consistent bundle', () => {
    expect(check(fixture())).toEqual([]);
  });

  it('expands compact sets with stable ids and defaults', () => {
    const [first] = fixture().sets;
    expect(first).toMatchObject({ id: 's1:A-03:1', setIndex: 1, weightKg: 40, reps: 8, rir: { min: 2, max: 2 }, quality: 'confirmed', techniqueOk: true });
  });

  it('rejects a set whose slot belongs to another workout or exercise', () => {
    const b = fixture();
    b.sets.push(...logSets('s1', 'B-01', 'barbell-back-squat', [{ w: 60, r: 8 }]));
    b.sets.push(...logSets('s1', 'A-04', 'barbell-bench-press', [{ w: 10, r: 8 }]));
    const problems = check(b);
    expect(problems.some((p) => p.includes('not in workout A'))).toBe(true);
    expect(problems.some((p) => p.includes('≠ slot exercise'))).toBe(true);
  });

  it('rejects unknown references, rest-day workouts and implausible values', () => {
    const b = fixture();
    b.sets.push(...logSets('nope', 'A-03', 'barbell-bench-press', [{ w: 40, r: 8 }]));
    b.prescriptions.push({ ...b.prescriptions[0]!, id: 'p3', slotKey: 'Z-99' });
    b.weekPlans[0]!.entries.push({ date: '2026-01-11', templateCode: 'B', origin: 'manual', state: 'planned' });
    b.bodyWeights.push({ date: '2026-02-30', kg: 5, source: 'manual' });
    const problems = check(b);
    expect(problems).toEqual(
      expect.arrayContaining([
        expect.stringContaining('unknown session nope'),
        expect.stringContaining('unknown slot Z-99'),
        expect.stringContaining('workout on rest day 2026-01-11'),
        expect.stringContaining('invalid date'),
        expect.stringContaining('implausible 5 kg'),
      ]),
    );
  });

  it('rejects an unsupported format without further checks', () => {
    const b = { ...fixture(), version: 2 } as unknown as DataBundle;
    expect(check(b)).toEqual(['Unsupported bundle format: personal-fitness-bundle v2']);
  });
});
