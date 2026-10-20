import { describe, expect, it } from 'vitest';
import { evaluateSlot, DEFAULT_SETTINGS, type EvaluateInput, type SlotPerformance } from '../../src/engine/progression';
import { heavier, lighter, reduced } from '../../src/engine/progression/loads';
import { logSets, times, type CompactSet } from '../../src/engine/import/compact';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import { EXERCISES_BY_ID } from '../../src/engine/library/exercises';
import { EQUIPMENT } from '../../src/engine/library/equipment';
import { addDays } from '../../src/engine/dates';
import type { Discomfort, Prescription, WorkoutSession } from '../../src/engine/model';

// Anonymised numbers throughout; real data is checked in tests/private.

const slotOf = (key: string) => {
  for (const t of PROGRAM_V2.templates) {
    const s = t.slots.find((x) => x.slotKey === key);
    if (s) return { slot: s, template: t };
  }
  throw new Error(key);
};

interface PerfSpec {
  rows: CompactSet[];
  fatigue?: number;
  discomfort?: Discomfort[];
  daysAfter?: number;
}

function input(key: string, perfs: PerfSpec[], current: Partial<Prescription> | null = null): EvaluateInput {
  const { slot, template } = slotOf(key);
  const exercise = EXERCISES_BY_ID.get(slot.exerciseId)!;
  let date = '2026-03-02';
  const history: SlotPerformance[] = perfs.map((p, i) => {
    if (i > 0) date = addDays(date, p.daysAfter ?? 7);
    const session: WorkoutSession = {
      id: `s${i + 1}`, date, templateCode: template.code, programVersionId: PROGRAM_V2.id, status: 'completed',
      startedAt: null, finishedAt: null, fatigue: p.fatigue ?? null, discomfort: p.discomfort ?? [],
      conditions: [], notes: [], flags: [], prescriptionSnapshot: null,
    };
    return { session, sets: logSets(session.id, key, slot.exerciseId, p.rows) };
  });
  const rx: Prescription | null = current
    ? { id: 'rx', slotKey: key, effectiveFrom: '2026-01-01', text: '', status: 'active', quality: 'confirmed', source: 'engine', sourceRef: 'test', ...current }
    : null;
  return {
    slot, template, exercise, history, current: rx, settings: DEFAULT_SETTINGS,
    equipment: EQUIPMENT.find((e) => e.id === exercise.equipmentProfileId),
  };
}

const run = (...args: Parameters<typeof input>) => evaluateSlot(input(...args));

describe('loads', () => {
  const plates = EQUIPMENT.find((e) => e.id === 'barbell-plates')!;
  const assist = EQUIPMENT.find((e) => e.id === 'assisted-machine')!;
  const cable = EQUIPMENT.find((e) => e.id === 'cable-stack')!;

  it('steps plates and snaps assisted values to the nearest pin', () => {
    expect(heavier(plates, 40)).toBe(42.5);
    expect(heavier(plates, 40, 5)).toBe(45);
    expect(lighter(assist, 34)).toBe(29.5);
    expect(lighter(assist, 9)).toBe(6.8); // logged 9 ≈ 9.1 (pin + lever)
    expect(lighter(assist, 6.5)).toBe(2.3); // logged 6.5 ≈ 6.8
    expect(lighter(assist, 2.3)).toBe(0);
    expect(heavier(cable, 15)).toBeNull(); // pin step unknown
  });

  it('reduces to the heaviest load at least 5% lighter, always at least one step', () => {
    expect(reduced(plates, 40, 5)).toBe(37.5);
    expect(reduced(plates, 20, 5)).toBe(17.5);
    expect(reduced(assist, 20.4, 5)).toBe(15.9);
  });
});

describe('R1 load double progression', () => {
  it('holds inside the range and aims one rep higher', () => {
    const d = run('A-03', [{ rows: times(4, { w: 40, r: 6, rir: 2 }) }]);
    expect(d).toMatchObject({ outcome: 'hold', apply: 'auto', next: { loadKg: 40, repTargets: [7, 7, 7, 7] } });
    expect(d.explanation).toBe('Reps 6/6/6/6 are inside 6–8. Keep 40 kg and aim for 7 reps per set.');
  });

  it('adds one step when every set reaches the top at the target RIR, auto-applied', () => {
    const d = run('A-03', [{ rows: times(4, { w: 40, r: 6, rir: 2 }) }, { rows: times(4, { w: 40, r: 8, rir: 2 }) }]);
    expect(d).toMatchObject({ outcome: 'increase', apply: 'auto', next: { loadKg: 42.5, repTargets: [6, 6, 6, 6], text: '42.5 kg, 4 × 6–8' } });
    expect(d.explanation).toBe('All 4 sets reached 8 reps (top of 6–8) at RIR 2/2/2/2, so the weight goes up to 42.5 kg and the target restarts at 6 reps.');
  });

  it('uses the slot step (squat +5 kg)', () => {
    expect(run('B-01', [{ rows: times(3, { w: 80, r: 8, rir: 2 }) }]).next?.loadKg).toBe(85);
  });

  it('tolerates one RIR below target, using the higher end of a reported range', () => {
    const rows: CompactSet[] = [{ w: 40, r: 8, rir: 2 }, { w: 40, r: 8, rir: [0, 2] }, { w: 40, r: 8, rir: [0, 2] }, { w: 40, r: 8, rir: [0, 1] }];
    expect(run('A-03', [{ rows }]).outcome).toBe('increase');
  });

  it('holds at the top when RIR is two or more below target', () => {
    const d = run('B-03', [{ rows: times(2, { w: 20, r: 10, rir: 0, side: 'each' }) }]);
    expect(d).toMatchObject({ outcome: 'hold', reasons: ['top_of_range', 'rir_too_low'], next: { loadKg: 20 } });
    expect(d.explanation).toBe('Reps were at the top, but RIR 0/0 is harder than the target of 2. Keep 20 kg and stop 1–2 reps earlier.');
  });

  it('needs approval when RIR is missing or data is unconfirmed', () => {
    expect(run('A-03', [{ rows: times(4, { w: 40, r: 8, rir: null }) }])).toMatchObject({ outcome: 'increase', apply: 'approval' });
    expect(run('A-03', [{ rows: times(4, { w: 40, r: 8, rir: 2, q: 'unconfirmed' }) }])).toMatchObject({ outcome: 'increase', apply: 'approval' });
  });

  it('repeats the weight after one miss and recommends a reduction after two', () => {
    const miss = times(4, { w: 40, r: 5, rir: 0 });
    expect(run('A-03', [{ rows: miss }])).toMatchObject({ outcome: 'hold', reasons: ['short_once'], next: { loadKg: 40, repTargets: [6, 6, 6, 6] } });
    const d = run('A-03', [{ rows: miss }, { rows: miss }]);
    expect(d).toMatchObject({ outcome: 'decrease', apply: 'approval', next: { loadKg: 37.5 } });
    expect(d.explanation).toBe('Fell short of 6 reps at 40 kg two sessions in a row. Recommend 37.5 kg (6% lighter).');
  });

  it('recommends a reduction when form breaks; those reps do not count', () => {
    const rows: CompactSet[] = [...times(3, { w: 40, r: 8, rir: 2 }), { w: 40, r: 8, rir: 2, ok: false }];
    expect(run('A-03', [{ rows }])).toMatchObject({ outcome: 'decrease', reasons: ['technique'], apply: 'approval' });
  });

  it('holds when not all prescribed sets were done at the final load', () => {
    const rows: CompactSet[] = [{ w: 12.5, r: 12, rir: null }, { w: 15, r: 12, rir: 1 }, { w: 15, r: 12, rir: 1 }];
    expect(run('A-07', [{ rows }])).toMatchObject({ outcome: 'hold', reasons: ['incomplete_sets'], next: { loadKg: 15 } });
  });

  it('does not count a drop segment toward the set', () => {
    const rows: CompactSet[] = [{ w: 15, r: 12, rir: 1 }, { w: 15, r: 12, rir: 1 }, { w: 15, r: 5, rir: 0, drops: [{ weightKg: 12.5, reps: 7 }] }];
    expect(run('A-07', [{ rows }])).toMatchObject({ outcome: 'hold', reasons: ['short_once'] });
  });

  it('proposes "next pin" when the cable step is unknown, still routine', () => {
    const d = run('C-06', [{ rows: times(2, { w: 20, r: 15, rir: 2 }) }]);
    expect(d).toMatchObject({ outcome: 'increase', apply: 'auto', reasons: ['top_of_range', 'step_unknown'], next: { loadKg: null, text: 'Next pin above 20 kg, 2 × 12–15' } });
  });
});

describe('R6 easy day', () => {
  it('takes the smallest step only when it still feels like the target RIR', () => {
    expect(run('E-01', [{ rows: times(3, { w: 60, r: 12, rir: 3 }) }]).next).toMatchObject({ loadKg: 65 });
    const d = run('E-01', [{ rows: times(3, { w: 60, r: 12, rir: 2 }) }]);
    expect(d).toMatchObject({ outcome: 'hold', reasons: ['top_of_range', 'rir_too_low'] });
    expect(d.explanation).toContain('easy day');
  });
});

describe('guards', () => {
  const top = times(4, { w: 40, r: 8, rir: 2 });

  it('G1: high fatigue blocks an increase', () => {
    const d = run('A-03', [{ rows: top, fatigue: 5 }]);
    expect(d).toMatchObject({ outcome: 'hold', apply: 'auto', next: null });
    expect(d.reasons).toContain('fatigue');
    expect(d.explanation).toContain('session fatigue was 5/5, so the target stays the same this time.');
  });

  it('G2: mild discomfort holds, sharp pain blocks for review', () => {
    expect(run('A-03', [{ rows: top, discomfort: [{ slotKey: 'A-03', severity: 'mild', note: '' }] }]).outcome).toBe('hold');
    const d = run('A-03', [{ rows: top, discomfort: [{ slotKey: 'A-03', severity: 'sharp', note: 'front of shoulder' }] }]);
    expect(d).toMatchObject({ outcome: 'blocked', apply: 'approval', next: null });
    expect(d.explanation).toContain('front of shoulder');
    // Discomfort on another exercise doesn't affect this one.
    expect(run('A-03', [{ rows: top, discomfort: [{ slotKey: 'A-05', severity: 'sharp', note: '' }] }]).outcome).toBe('increase');
  });

  it('G3: a drop in total reps blocks increases; two drops in a row recommend a reduction', () => {
    const r = (n: number) => times(3, { w: 20, r: n, rir: 1 });
    expect(run('C-07', [{ rows: r(10) }, { rows: r(9) }])).toMatchObject({ outcome: 'hold' });
    expect(run('C-07', [{ rows: r(10) }, { rows: r(9) }]).reasons).toContain('decline');
    expect(run('C-07', [{ rows: r(11) }, { rows: r(10) }, { rows: r(9) }])).toMatchObject({ outcome: 'decrease', reasons: ['decline_twice'], apply: 'approval' });
  });

  it('G4: a long gap holds for one session', () => {
    const d = run('A-03', [{ rows: times(4, { w: 40, r: 7, rir: 2 }) }, { rows: top, daysAfter: 21 }]);
    expect(d.outcome).toBe('hold');
    expect(d.reasons).toContain('gap');
  });
});

describe('R2 assisted reps (less assistance = harder)', () => {
  it('moves one pin down the ladder at the top of the range', () => {
    const d = run('C-03', [{ rows: times(3, { a: 34, r: 8, rir: 0 }) }]);
    expect(d).toMatchObject({ outcome: 'increase', apply: 'auto', next: { assistKg: 29.5, repTargets: [6, 6, 6], text: '29.5 kg assist, 3 × 6–8' } });
    expect(d.explanation).toContain('assistance drops from 34 kg to 29.5 kg');
  });

  it('adds assistance after two misses', () => {
    const miss = times(3, { a: 20.4, r: 4, rir: 0 });
    expect(run('C-03', [{ rows: miss }, { rows: miss }]).next).toMatchObject({ assistKg: 22.7 });
  });

  it('turns the last step into an approval milestone: unassisted', () => {
    expect(run('C-03', [{ rows: times(3, { a: 2.3, r: 8, rir: 1 }) }])).toMatchObject({ outcome: 'milestone', apply: 'approval', next: { assistKg: 0 } });
  });
});

describe('R3 assisted negatives', () => {
  const ok = times(4, { a: 13.6, r: 3, tempo: true });
  it('reduces assistance when every rep had the full tempo', () => {
    expect(run('C-02', [{ rows: ok }])).toMatchObject({ outcome: 'increase', apply: 'auto', next: { assistKg: 9.1 } });
  });
  it('needs approval when tempo was not recorded', () => {
    expect(run('C-02', [{ rows: times(4, { a: 13.6, r: 3, tempo: null }) }])).toMatchObject({ outcome: 'increase', apply: 'approval' });
  });
  it('holds after a fast rep, and adds assistance after two such sessions', () => {
    const fast = times(4, { a: 6.8, r: 3, tempo: false });
    expect(run('C-02', [{ rows: fast }])).toMatchObject({ outcome: 'hold', reasons: ['tempo_missed'] });
    expect(run('C-02', [{ rows: fast }, { rows: fast }])).toMatchObject({ outcome: 'decrease', next: { assistKg: 9.1 } });
  });
  it('makes unassisted negatives an approval milestone', () => {
    expect(run('C-02', [{ rows: times(4, { a: 2.3, r: 3, tempo: true }) }])).toMatchObject({ outcome: 'milestone', apply: 'approval' });
  });
});

describe('R4 timed holds and dead hangs', () => {
  it('raises the hold target by 5 s within the range', () => {
    expect(run('B-06', [{ rows: times(3, { t: 25 }) }], { timeSec: 25 })).toMatchObject({ outcome: 'increase', next: { timeSec: 30 } });
    expect(run('B-06', [{ rows: [{ t: 30 }, { t: 30 }, { t: 22 }] }], { timeSec: 25 })).toMatchObject({ outcome: 'hold', next: { timeSec: 25 } });
  });
  it('suggests a milestone at the top of the range', () => {
    expect(run('E-06', [{ rows: times(2, { t: 30, side: 'each' }) }])).toMatchObject({ outcome: 'milestone', apply: 'approval', next: null });
  });
  it('dead hang: beat the best hold; keep the target when it was not reached', () => {
    expect(run('A-01', [{ rows: [{ t: 50 }, { t: 41 }] }], { timeSec: 45 })).toMatchObject({ outcome: 'increase', next: { timeSec: 50, text: 'Beat 50 s' } });
    expect(run('C-08', [{ rows: [{ t: 28 }, { t: 28 }] }], { timeSec: 32 })).toMatchObject({ outcome: 'hold', next: { timeSec: 32 } });
  });
});

describe('R5 bodyweight reps', () => {
  it('requires the pause, recorded, in two sessions in a row before adding a rep', () => {
    const noPause = times(2, { r: 8, pause: false });
    const unknown = times(2, { r: 8, pause: null });
    const paused = times(2, { r: 8, pause: true });
    expect(run('A-02', [{ rows: noPause }])).toMatchObject({ outcome: 'hold', reasons: ['pause_missing'] });
    expect(run('A-02', [{ rows: unknown }])).toMatchObject({ outcome: 'hold', reasons: ['pause_unknown'] });
    expect(run('A-02', [{ rows: noPause }, { rows: paused }])).toMatchObject({ outcome: 'hold', reasons: ['top_of_range'] });
    expect(run('A-02', [{ rows: paused }, { rows: paused }])).toMatchObject({ outcome: 'increase', next: { repTargets: [9, 9], requirePause: true } });
  });
  it('offers a harder variation as a milestone at the cap', () => {
    expect(run('B-05', [{ rows: times(3, { r: 12, rir: 1 }) }])).toMatchObject({ outcome: 'milestone', apply: 'approval' });
  });
  it('holds below the target', () => {
    expect(run('E-05', [{ rows: times(3, { r: 7, side: 'each' }) }])).toMatchObject({ outcome: 'hold', next: { repTargets: [8, 8, 8] } });
  });
});

describe('R7 carries and R8 cardio', () => {
  it('adds weight when every carry reaches the top distance, resetting the distance', () => {
    expect(run('D-07', [{ rows: times(3, { w: 24, d: 45 }) }])).toMatchObject({ outcome: 'increase', next: { loadKg: 26.5, distanceM: 30 } });
    expect(run('D-07', [{ rows: times(3, { w: 24, d: 35 }) }])).toMatchObject({ outcome: 'hold' });
  });
  it('never progresses cardio', () => {
    expect(run('E-07', [{ rows: [{ t: 1200 }] }])).toMatchObject({ outcome: 'none', reasons: ['not_progressive'] });
  });
});

describe('robustness', () => {
  it('returns "none" without data', () => {
    expect(run('A-03', [])).toMatchObject({ outcome: 'none', basisSessionId: null });
    expect(run('C-03', [{ rows: [{ a: 30, r: null, q: 'unknown' }] }])).toMatchObject({ outcome: 'none', reasons: ['no_data'] });
  });
  it('is deterministic', () => {
    const make = () => run('A-03', [{ rows: times(4, { w: 40, r: 6, rir: 2 }) }, { rows: times(4, { w: 40, r: 8, rir: 2 }) }]);
    expect(make()).toEqual(make());
  });
  it('carries the ruleset version and basis session', () => {
    expect(run('A-03', [{ rows: times(4, { w: 40, r: 6, rir: 2 }) }])).toMatchObject({ rulesetVersion: '1.0.0', basisSessionId: 's1', basisDate: '2026-03-02' });
  });
});
