import { describe, expect, it } from 'vitest';
import { currentBests, e1rmSeries, estimate1rm, improvement, recordTimeline, recordsInSession } from '../../src/engine/records';
import { exerciseHistory } from '../../src/engine/stats';
import { EXERCISES_BY_ID } from '../../src/engine/library/exercises';
import type { SetLog, WorkoutSession } from '../../src/engine/model';

const ex = (id: string) => EXERCISES_BY_ID.get(id)!;
const session = (id: string, date: string): WorkoutSession => ({
  id, date, templateCode: 'X', programVersionId: null, status: 'completed', startedAt: null, finishedAt: null,
  fatigue: null, discomfort: [], conditions: [], notes: [], flags: [], prescriptionSnapshot: null,
});
let n = 0;
const set = (sessionId: string, exerciseId: string, p: Partial<SetLog>): SetLog => ({
  id: `s${++n}`, sessionId, slotKey: null, exerciseId, setIndex: n, side: 'both', completed: true, techniqueOk: true, isWarmup: false, quality: 'confirmed', ...p,
});

const sessions = [session('a', '2026-01-01'), session('b', '2026-01-05'), session('c', '2026-01-09')];
const sets = [
  set('a', 'db-bench-press', { weightKg: 20, reps: 10 }),
  set('a', 'db-bench-press', { weightKg: 20, reps: 9 }),
  set('b', 'db-bench-press', { weightKg: 22.5, reps: 6 }), // heavier, but lower estimate
  set('b', 'db-bench-press', { weightKg: 40, reps: 1, isWarmup: true }), // warm-ups never count
  set('c', 'db-bench-press', { weightKg: 22.5, reps: 9 }),
  set('c', 'db-bench-press', { weightKg: 25, reps: 3, techniqueOk: false }), // bad form never counts
  set('a', 'pull-up', { reps: 3 }),
  set('c', 'pull-up', { reps: 5 }),
  set('a', 'assisted-pull-up', { assistKg: 34, reps: 6 }),
  set('b', 'assisted-pull-up', { assistKg: 27, reps: 5 }),
  set('a', 'plank', { durationSec: 40 }),
  set('b', 'plank', { durationSec: 38 }),
];
const hist = (id: string) => exerciseHistory(sessions, sets, ex(id));

describe('personal records', () => {
  it('estimates a one-rep max only from 1–12 reps', () => {
    expect(estimate1rm(100, 1)).toBe(100);
    expect(estimate1rm(100, 5)).toBe(116.7);
    expect(estimate1rm(100, 15)).toBeNull();
    expect(estimate1rm(0, 5)).toBeNull();
  });

  it('finds records in order; the first session is the starting point, not a record', () => {
    const t = recordTimeline(hist('db-bench-press'), ex('db-bench-press'));
    expect(t.map((r) => [r.date, r.kind, r.value, r.previous])).toEqual([
      ['2026-01-05', 'weight', 22.5, 20],
      ['2026-01-05', 'e1rm', 27, 26.7],
      ['2026-01-09', 'e1rm', 29.3, 27],
    ]);
    expect(t[2]!.label).toBe('29.3 kg (from 22.5 kg × 9)');
  });

  it('tracks reps, holds and assistance (less is better)', () => {
    expect(recordTimeline(hist('pull-up'), ex('pull-up')).map((r) => [r.kind, r.value])).toEqual([['reps', 5]]);
    expect(recordTimeline(hist('assisted-pull-up'), ex('assisted-pull-up')).map((r) => [r.kind, r.value])).toEqual([['assist', 27]]);
    expect(recordTimeline(hist('plank'), ex('plank'))).toEqual([]);
    expect(currentBests(hist('plank'), ex('plank')).map((r) => [r.kind, r.value, r.date])).toEqual([['time', 40, '2026-01-01']]);
  });

  it('lists the records of one session and how much they improved', () => {
    const map = new Map(['db-bench-press', 'pull-up', 'assisted-pull-up', 'plank'].map((id) => [id, { exercise: ex(id), history: hist(id) }]));
    const c = recordsInSession('c', map);
    expect(c.map((r) => `${r.exerciseId}:${r.kind}`)).toEqual(['db-bench-press:e1rm', 'pull-up:reps']);
    expect(c.map((r) => improvement(r, 'kg'))).toEqual(['+2.3 kg', '+2 reps']);
    expect(improvement(recordsInSession('b', map).find((r) => r.kind === 'assist')!, 'kg')).toBe('−7 kg assist');
  });

  it('counts the bar when the person counts it, and shows lb', () => {
    const e = ex('barbell-bench-press');
    const h = exerciseHistory([session('a', '2026-01-01'), session('b', '2026-01-02')], [set('a', e.id, { weightKg: 40, reps: 5 }), set('b', e.id, { weightKg: 45, reps: 5 })], e);
    expect(recordTimeline(h, e, 'kg', 20).find((r) => r.kind === 'weight')!.label).toBe('65 kg × 5');
    expect(e1rmSeries(h, e, 'lb', 20).points.map((p) => p.value)).toEqual([154.3, 167.1]);
  });
});
