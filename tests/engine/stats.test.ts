import { describe, expect, it } from 'vitest';
import { adherence, coachingNotes, exerciseHistory, exerciseSeries, metricFor, pullUpStatus, recentProgress, weeklyAverages, weeklyChange } from '../../src/engine/stats';
import { logSets, times, type CompactSet } from '../../src/engine/import/compact';
import { EXERCISES_BY_ID } from '../../src/engine/library/exercises';
import type { Prescription, SetLog, WeekPlan, WorkoutSession } from '../../src/engine/model';

// Anonymised data.
const ex = (id: string) => EXERCISES_BY_ID.get(id)!;
const session = (id: string, date: string, over: Partial<WorkoutSession> = {}): WorkoutSession => ({
  id, date, templateCode: 'C', programVersionId: 'program-v2', status: 'completed', startedAt: null, finishedAt: null,
  fatigue: null, discomfort: [], conditions: [], notes: [], flags: [], prescriptionSnapshot: null, ...over,
});
const log = (sid: string, exerciseId: string, rows: CompactSet[], slot = 'C-01') => logSets(sid, slot, exerciseId, rows);

describe('exercise history and series', () => {
  const sessions = [session('s1', '2026-03-02'), session('s2', '2026-03-09'), session('s3', '2026-03-16', { status: 'in_progress' })];
  const sets: SetLog[] = [
    ...log('s1', 'lat-pulldown', [{ w: 40, r: 10 }, { w: 40, r: 10 }, { w: 37.5, r: 12 }]),
    ...log('s2', 'lat-pulldown', [{ w: 42.5, r: 8 }, { w: 42.5, r: 7, ok: false }]),
    ...log('s3', 'lat-pulldown', [{ w: 50, r: 8 }]),
  ];

  it('lists completed sessions only, oldest first, with a summary', () => {
    const h = exerciseHistory(sessions, sets, ex('lat-pulldown'));
    expect(h.map((x) => [x.date, x.summary])).toEqual([
      ['2026-03-02', '40 kg × 10, 40 kg × 10, 37.5 kg × 12'],
      ['2026-03-09', '42.5 kg × 8/7'],
    ]);
  });

  it('charts the heaviest load per session, ignoring broken-form sets', () => {
    const s = exerciseSeries(exerciseHistory(sessions, sets, ex('lat-pulldown')), ex('lat-pulldown'));
    expect(s).toMatchObject({ metric: 'load', unit: 'kg', lowerIsBetter: false });
    expect(s.points.map((p) => [p.value, p.label])).toEqual([[40, '40 kg × 10/10'], [42.5, '42.5 kg × 8']]);
    expect(s.best?.value).toBe(42.5);
  });

  it('treats less assistance as better and picks the right metric per type', () => {
    const asets = [...log('s1', 'assisted-pull-up', times(3, { a: 34, r: 8 })), ...log('s2', 'assisted-pull-up', times(3, { a: 29.5, r: 6 }))];
    const s = exerciseSeries(exerciseHistory(sessions, asets, ex('assisted-pull-up')), ex('assisted-pull-up'));
    expect(s.points.map((p) => p.value)).toEqual([34, 29.5]);
    expect(s.best?.value).toBe(29.5);
    expect([metricFor(ex('dead-hang')), metricFor(ex('dead-bug')), metricFor(ex('farmers-carry')), metricFor(ex('cycling'))]).toEqual(['time', 'reps', 'load', 'duration']);
  });
});

describe('body weight', () => {
  const entries = [
    { date: '2026-03-02', kg: 82.0, source: 'manual' as const },
    { date: '2026-03-04', kg: 81.4, source: 'manual' as const },
    { date: '2026-03-10', kg: 81.0, source: 'manual' as const },
  ];
  it('averages per Monday-based week and reports the change', () => {
    const w = weeklyAverages(entries);
    expect(w).toEqual([{ weekStart: '2026-03-02', average: 81.7, count: 2 }, { weekStart: '2026-03-09', average: 81, count: 1 }]);
    expect(weeklyChange(w)).toBe(-0.7);
    expect(weeklyChange(w.slice(0, 1))).toBeNull();
  });
});

describe('planned versus completed', () => {
  it('counts planned, done, skipped, missed and unplanned workouts', () => {
    const plan: WeekPlan = { weekStart: '2026-03-02', restDays: [], unavailableDays: [], status: 'saved', notes: [], entries: [
      { date: '2026-03-02', templateCode: 'C', origin: 'generated', state: 'done', sessionId: 's1' },
      { date: '2026-03-03', templateCode: 'A', origin: 'generated', state: 'planned' },
      { date: '2026-03-05', templateCode: 'B', origin: 'generated', state: 'planned' },
      { date: '2026-03-06', templateCode: 'E', origin: 'generated', state: 'skipped' },
    ] };
    const sessions = [session('s1', '2026-03-02'), session('x', '2026-03-04')];
    expect(adherence([plan], sessions, '2026-03-04')).toEqual([{ weekStart: '2026-03-02', planned: 3, done: 1, skipped: 1, missed: 1, extra: 1 }]);
  });
});

describe('pull-up path', () => {
  it('reports each milestone from the latest logged data', () => {
    const sessions = [session('s1', '2026-03-02'), session('s2', '2026-03-09')];
    const sets = [
      ...log('s1', 'dead-hang', [{ t: 50 }, { t: 30 }]),
      ...log('s2', 'dead-hang', [{ t: 40 }]),
      ...log('s2', 'scapular-pull-up', times(2, { r: 8, pause: true })),
      ...log('s2', 'assisted-negative-pull-up', times(4, { a: 6.8, r: 3, tempo: true })),
      ...log('s2', 'assisted-pull-up', times(3, { a: 29.5, r: 8 })),
    ];
    const p = pullUpStatus(sessions, sets);
    expect(p.milestones.map((m) => [m.id, m.met, m.current])).toEqual([
      ['dead-hang', true, 'best 50 s'],
      ['scapular', false, '8/8, pause held'],
      ['negatives', false, '4 × 3 at 6.8 kg assist, full 5 s'],
      ['assisted', false, '8/8/8 at 29.5 kg assist'],
    ]);
    expect(p.readyToTest).toBe(false);
    expect(p.strictPullUps).toBeNull();
  });

  it('is ready to test when all four are met', () => {
    const sessions = [session('s1', '2026-05-04')];
    const sets = [
      ...log('s1', 'dead-hang', [{ t: 60 }]),
      ...log('s1', 'scapular-pull-up', times(2, { r: 10, pause: true })),
      ...log('s1', 'assisted-negative-pull-up', times(4, { a: 0, r: 3, tempo: true })),
      ...log('s1', 'assisted-pull-up', times(3, { a: 20.4, r: 8 })),
      ...log('s1', 'pull-up', [{ r: 1 }]),
    ];
    const p = pullUpStatus(sessions, sets);
    expect(p.readyToTest).toBe(true);
    expect(p.strictPullUps).toEqual({ date: '2026-05-04', reps: 1 });
  });
});

describe('recent progress and coaching notes', () => {
  const rx = (p: Partial<Prescription>): Prescription => ({ id: Math.random().toString(), effectiveFrom: '2026-03-01', text: '', status: 'active', quality: 'confirmed', source: 'engine', sourceRef: 't', ...p });

  it('lists targets that got harder, newest first', () => {
    const list = [
      rx({ slotKey: 'A-03', loadKg: 40, text: '40 kg' }),
      rx({ slotKey: 'A-03', loadKg: 42.5, effectiveFrom: '2026-03-04', text: '42.5 kg, 4 × 6–8' }),
      rx({ slotKey: 'C-03', assistKg: 34, text: '34' }),
      rx({ slotKey: 'C-03', assistKg: 29.5, effectiveFrom: '2026-03-06', text: '29.5 kg assist' }),
      rx({ slotKey: 'A-04', loadKg: 15, text: '15' }),
      rx({ slotKey: 'A-04', loadKg: 15, effectiveFrom: '2026-03-04', text: '15 aim 10' }),
      rx({ slotKey: 'A-05', loadKg: 12.5, text: 'x' }),
      rx({ slotKey: 'A-05', loadKg: 15, effectiveFrom: '2026-03-05', text: 'revoked', status: 'revoked' }),
    ];
    expect(recentProgress(list, (k) => k)).toEqual([
      { date: '2026-03-06', name: 'C-03', text: '29.5 kg assist' },
      { date: '2026-03-04', name: 'A-03', text: '42.5 kg, 4 × 6–8' },
    ]);
  });

  it('gives deterministic, prioritised notes', () => {
    const last = { session: session('s1', '2026-03-09', { fatigue: 4 }), sets: log('s1', 'barbell-bench-press', times(3, { w: 40, r: 8, rir: 0 })) };
    const notes = coachingNotes({
      today: '2026-03-11',
      lastSession: last,
      pending: 2,
      bodyWeights: [{ date: '2026-03-02', kg: 82, source: 'manual' }],
      pullUp: pullUpStatus([], []),
    });
    expect(notes).toEqual([
      '2 recommendations need your OK before the targets change.',
      '3 sets ended at RIR 0 last workout. Finish 1–2 reps earlier to keep progressing longer.',
      'Last workout felt very hard. Targets were held; prioritise sleep and food before the next one.',
      'No body weight logged this week. Weigh 2–3 mornings (after the toilet, before food) for a reliable weekly average.',
      'Pull-up path: next milestone is dead hang, 45–60 s (now: no record yet).',
    ]);
  });
});

describe('best point tie-break', () => {
  it('prefers more reps at the same assistance, then the more recent session', () => {
    const sessions = [session('a', '2026-03-02'), session('b', '2026-03-09'), session('c', '2026-03-16')];
    const sets = [
      ...log('a', 'assisted-pull-up', times(3, { a: 34, r: 6 })),
      ...log('b', 'assisted-pull-up', times(3, { a: 34, r: 8 })),
      ...log('c', 'assisted-pull-up', times(3, { a: 34, r: 8 })),
    ];
    const s = exerciseSeries(exerciseHistory(sessions, sets, ex('assisted-pull-up')), ex('assisted-pull-up'));
    expect(s.best).toMatchObject({ date: '2026-03-16', label: '34 kg assist × 8/8/8' });
  });
});
