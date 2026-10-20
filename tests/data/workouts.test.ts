import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { FitnessDB, ensureSeeded } from '../../src/data/db';
import { addSet, discardSession, finishSession, inProgressSession, lastForExercise, lastPerformance, removeSet, saveSet, startSession, swapExercise } from '../../src/data/workouts';
import { evaluateSession } from '../../src/data/recommendations';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import type { Prescription, WorkoutTemplate } from '../../src/engine/model';

const A = PROGRAM_V2.templates.find((t) => t.code === 'A') as WorkoutTemplate;
const D = PROGRAM_V2.templates.find((t) => t.code === 'D') as WorkoutTemplate;
const rx = (p: Partial<Prescription>): Prescription => ({ id: crypto.randomUUID(), effectiveFrom: '2026-03-01', text: 't', status: 'active', quality: 'confirmed', source: 'engine', sourceRef: 'test', ...p });

let n = 0;
const opened: FitnessDB[] = [];
async function freshDb() {
  const db = new FitnessDB(`workouts-${++n}`);
  opened.push(db);
  await ensureSeeded(db);
  return db;
}
afterEach(async () => {
  for (const db of opened.splice(0)) {
    db.close();
    await db.delete();
  }
});

describe('workout sessions', () => {
  it('starts with frozen targets and one pre-filled, uncompleted row per prescribed set', async () => {
    const db = await freshDb();
    await db.prescriptions.add(rx({ slotKey: 'A-03', loadKg: 42.5, repTargets: [6, 6, 6, 6], text: '42.5 kg, 4 × 6–8' }));
    const id = await startSession(db, A, PROGRAM_V2.id, '2026-03-03');
    const session = (await db.sessions.get(id))!;
    expect(session.status).toBe('in_progress');
    expect(session.prescriptionSnapshot?.find((e) => e.slotKey === 'A-03')?.text).toBe('42.5 kg, 4 × 6–8');
    expect(session.prescriptionSnapshot?.find((e) => e.slotKey === 'A-04')?.text).toBe('3 × 8–10 · RIR 2 · rest 90 s');
    const sets = await db.sets.where('sessionId').equals(id).toArray();
    expect(sets).toHaveLength(A.slots.reduce((sum, s) => sum + (s.sets ?? 1), 0));
    expect(sets.every((s) => !s.completed)).toBe(true);
    expect(sets.filter((s) => s.slotKey === 'A-03').map((s) => [s.weightKg, s.reps])).toEqual(Array(4).fill([42.5, 6]));
  });

  it('resumes the same session instead of starting a second one', async () => {
    const db = await freshDb();
    const id = await startSession(db, A, PROGRAM_V2.id, '2026-03-03');
    expect(await startSession(db, A, PROGRAM_V2.id, '2026-03-03')).toBe(id);
    expect((await inProgressSession(db))?.id).toBe(id);
    expect(await db.sessions.count()).toBe(1);
  });

  it('autosaves each set and survives closing and reopening the database', async () => {
    const db = await freshDb();
    const id = await startSession(db, A, PROGRAM_V2.id, '2026-03-03');
    const first = (await db.sets.where('sessionId').equals(id).toArray()).find((s) => s.slotKey === 'A-03' && s.setIndex === 1)!;
    await saveSet(db, { ...first, weightKg: 40, reps: 8, rir: { min: 2, max: 2 }, completed: true });
    db.close();
    const reopened = new FitnessDB(db.name);
    opened.push(reopened);
    expect((await inProgressSession(reopened))?.id).toBe(id);
    expect(await reopened.sets.get(first.id)).toMatchObject({ weightKg: 40, reps: 8, completed: true });
  });

  it('adds and removes extra sets', async () => {
    const db = await freshDb();
    const id = await startSession(db, A, PROGRAM_V2.id, '2026-03-03');
    const extra = await addSet(db, id, 'A-07');
    expect(extra).toMatchObject({ setIndex: 4, completed: false });
    expect(extra).not.toHaveProperty('notes');
    await removeSet(db, extra.id);
    expect((await db.sets.where('sessionId').equals(id).toArray()).filter((s) => s.slotKey === 'A-07')).toHaveLength(3);
  });

  it('finishing marks the week-plan entry done; history is untouched by later target changes', async () => {
    const db = await freshDb();
    await db.weekPlans.put({ weekStart: '2026-03-02', restDays: [], unavailableDays: [], status: 'saved', notes: [], entries: [{ date: '2026-03-03', templateCode: 'A', origin: 'generated', state: 'planned' }] });
    const id = await startSession(db, A, PROGRAM_V2.id, '2026-03-03');
    await finishSession(db, id, { fatigue: 3, notes: ['good'] }, new Date('2026-03-03T09:00:00Z'));
    expect(await db.sessions.get(id)).toMatchObject({ status: 'completed', fatigue: 3, finishedAt: '2026-03-03T09:00:00.000Z' });
    expect((await db.weekPlans.get('2026-03-02'))!.entries[0]).toMatchObject({ state: 'done', sessionId: id });

    const before = JSON.stringify([await db.sessions.get(id), await db.sets.where('sessionId').equals(id).sortBy('id')]);
    await db.prescriptions.add(rx({ slotKey: 'A-03', effectiveFrom: '2026-03-04', loadKg: 45, text: '45 kg' }));
    const after = JSON.stringify([await db.sessions.get(id), await db.sets.where('sessionId').equals(id).sortBy('id')]);
    expect(after).toBe(before);
  });

  it('records an unplanned workout in the week plan', async () => {
    const db = await freshDb();
    await db.weekPlans.put({ weekStart: '2026-03-02', restDays: [], unavailableDays: [], status: 'saved', notes: [], entries: [] });
    const id = await startSession(db, A, PROGRAM_V2.id, '2026-03-04');
    await finishSession(db, id, { fatigue: null, notes: [] });
    expect((await db.weekPlans.get('2026-03-02'))!.entries).toEqual([{ date: '2026-03-04', templateCode: 'A', origin: 'manual', state: 'done', sessionId: id }]);
  });

  it('shows last time from the linked slot in another workout (lateral raises A↔D)', async () => {
    const db = await freshDb();
    const d = await startSession(db, D, PROGRAM_V2.id, '2026-03-07');
    for (const s of (await db.sets.where('sessionId').equals(d).toArray()).filter((x) => x.slotKey === 'D-05')) {
      await saveSet(db, { ...s, weightKg: 10, reps: 15, completed: true });
    }
    await finishSession(db, d, { fatigue: null, notes: [] });
    const lateral = A.slots.find((s) => s.slotKey === 'A-06')!;
    const last = await lastPerformance(db, A, lateral, null);
    expect(last?.session.id).toBe(d);
    // The next A pre-fills from D's load.
    const a = await startSession(db, A, PROGRAM_V2.id, '2026-03-10');
    expect((await db.sets.get(`${a}:A-06:1`))?.weightKg).toBe(10);
  });

  it('discards an in-progress workout but never a completed one', async () => {
    const db = await freshDb();
    const id = await startSession(db, A, PROGRAM_V2.id, '2026-03-03');
    await discardSession(db, id);
    expect(await db.sessions.count()).toBe(0);
    expect(await db.sets.count()).toBe(0);
    const done = await startSession(db, A, PROGRAM_V2.id, '2026-03-03');
    await finishSession(db, done, { fatigue: null, notes: [] });
    await discardSession(db, done);
    expect(await db.sessions.count()).toBe(1);
  });

  it('swaps an exercise for one workout without touching the progression of that slot', async () => {
    const db = await freshDb();
    await db.prescriptions.add(rx({ slotKey: 'A-03', loadKg: 42.5, repTargets: [6, 6, 6, 6], text: '42.5 kg, 4 × 6–8' }));
    const id = await startSession(db, A, PROGRAM_V2.id, '2026-03-03');
    const slotSets = async () => (await db.sets.where('sessionId').equals(id).toArray()).filter((x) => x.slotKey === 'A-03').sort((a, b) => a.setIndex - b.setIndex);

    await swapExercise(db, id, 'A-03', 'db-bench-press');
    expect((await db.sessions.get(id))!.swaps).toEqual({ 'A-03': 'db-bench-press' });
    expect((await slotSets()).map((x) => [x.exerciseId, x.weightKg, x.reps])).toEqual(Array(4).fill(['db-bench-press', null, 6]));

    // Swapping back restores the planned weights.
    await swapExercise(db, id, 'A-03', null);
    expect((await db.sessions.get(id))!.swaps).toEqual({});
    expect((await slotSets()).map((x) => [x.exerciseId, x.weightKg])).toEqual(Array(4).fill(['barbell-bench-press', 42.5]));

    await swapExercise(db, id, 'A-03', 'db-bench-press');
    for (const x of await slotSets()) await saveSet(db, { ...x, weightKg: 22.5, reps: 8, rir: { min: 2, max: 2 }, completed: true });
    await expect(swapExercise(db, id, 'A-03', null)).rejects.toThrow(/Untick/);
    await finishSession(db, id, { fatigue: 2, notes: [] });
    const decisions = await evaluateSession(db, id);
    expect(decisions.some((d) => d.slotKey === 'A-03')).toBe(false);
    expect(await lastPerformance(db, A, A.slots.find((x) => x.slotKey === 'A-03')!, null)).toBeNull();
    expect((await lastForExercise(db, 'db-bench-press', 'other'))!.sets.map((x) => x.weightKg)).toEqual([22.5, 22.5, 22.5, 22.5]);

    // Next time, the dumbbell weight is remembered when swapping again.
    const next = await startSession(db, A, PROGRAM_V2.id, '2026-03-06');
    await swapExercise(db, next, 'A-03', 'db-bench-press');
    expect((await db.sets.where('sessionId').equals(next).toArray()).filter((x) => x.slotKey === 'A-03').every((x) => x.weightKg === 22.5)).toBe(true);
  });

  it('stores the workout time you enter when finishing', async () => {
    const db = await freshDb();
    const id = await startSession(db, A, PROGRAM_V2.id, '2026-03-03', new Date('2026-03-03T17:00:00Z'));
    await finishSession(db, id, { fatigue: 3, notes: [], durationMin: 57.4 }, new Date('2026-03-04T08:00:00Z'));
    expect((await db.sessions.get(id))!.durationMin).toBe(57);
    const other = await startSession(db, D, PROGRAM_V2.id, '2026-03-05');
    await finishSession(db, other, { fatigue: 3, notes: [], durationMin: null });
    expect((await db.sessions.get(other))!.durationMin).toBeUndefined();
  });
});
