import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { FitnessDB, ensureSeeded } from '../../src/data/db';
import { allTemplates, archiveWorkout, customWorkouts, draftOf, duplicateWorkout, saveExercise, saveWorkout, scheduleWorkout } from '../../src/data/custom';
import { finishSession, findTemplate, startSession } from '../../src/data/workouts';
import { evaluateSession } from '../../src/data/recommendations';
import { saveWeek } from '../../src/data/weeks';
import { defaultSlot, type WorkoutDraft } from '../../src/engine/custom';
import { EXERCISES_BY_ID } from '../../src/engine/library/exercises';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';

const ex = (id: string) => EXERCISES_BY_ID.get(id)!;
const TODAY = '2026-03-03'; // Tuesday

let n = 0;
const opened: FitnessDB[] = [];
async function freshDb() {
  const db = new FitnessDB(`custom-${++n}`);
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

const draft = (over: Partial<WorkoutDraft> = {}): WorkoutDraft => ({
  name: 'Back pump',
  demand: 'moderate',
  notes: 'Saturday extra',
  slots: [{ ...defaultSlot(ex('lat-pulldown')), targetKg: 35 }, defaultSlot(ex('dead-hang'))],
  ...over,
});

async function save(db: FitnessDB, d = draft()) {
  const r = await saveWorkout(db, d, TODAY);
  if (!r.ok) throw new Error(r.problems.join(', '));
  return r.workout;
}

describe('custom workouts', () => {
  it('saves a workout and its starting weight as a target, leaving the program untouched', async () => {
    const db = await freshDb();
    const w = await save(db);
    expect(w).toMatchObject({ kind: 'custom', name: 'Back pump', pullVolume: true });
    const rx = await db.prescriptions.where('slotKey').equals(w.slots[0]!.slotKey).toArray();
    expect(rx).toMatchObject([{ loadKg: 35, effectiveFrom: TODAY, source: 'user', repTargets: [8, 8, 8] }]);
    expect(await db.programs.get(PROGRAM_V2.id)).toEqual(PROGRAM_V2);
    expect((await allTemplates(db)).map((t) => t.code)).toEqual(['A', 'B', 'C', 'E', 'D', w.code]);
  });

  it('rejects an invalid draft without saving', async () => {
    const db = await freshDb();
    const r = await saveWorkout(db, draft({ name: '' }), TODAY);
    expect(r).toEqual({ ok: false, problems: ['Give the workout a name.'] });
    expect(await db.templates.count()).toBe(0);
  });

  it('pre-fills the logger from the starting weight and progresses like any workout', async () => {
    const db = await freshDb();
    const w = await save(db);
    const id = await startSession(db, w, null, TODAY);
    const first = await db.sets.get(`${id}:${w.slots[0]!.slotKey}:1`);
    expect(first).toMatchObject({ weightKg: 35, reps: 8 });
    for (const i of [1, 2, 3]) {
      const s = (await db.sets.get(`${id}:${w.slots[0]!.slotKey}:${i}`))!;
      await db.sets.put({ ...s, reps: 12, rir: { min: 2, max: 2 }, completed: true });
    }
    await finishSession(db, id, { fatigue: 2, notes: [] });
    const [d] = await evaluateSession(db, id);
    expect(d).toMatchObject({ slotKey: w.slots[0]!.slotKey, outcome: 'increase', status: 'auto_applied' });
  });

  it('editing keeps history attached and records a changed starting weight once', async () => {
    const db = await freshDb();
    const w = await save(db);
    const d = await draftOf(db, w, TODAY);
    expect(d.slots[0]!.targetKg).toBe(35);
    const r = await saveWorkout(db, { ...d, slots: [d.slots[1]!, { ...d.slots[0]!, targetKg: 37.5 }] }, '2026-03-05', w);
    expect(r.ok).toBe(true);
    const saved = (await customWorkouts(db))[0]!;
    expect(saved.slots.map((s) => s.slotKey)).toEqual([w.slots[1]!.slotKey, w.slots[0]!.slotKey]);
    const history = await db.prescriptions.where('slotKey').equals(w.slots[0]!.slotKey).sortBy('effectiveFrom');
    expect(history.map((p) => [p.effectiveFrom, p.loadKg])).toEqual([[TODAY, 35], ['2026-03-05', 37.5]]);
    // Saving again without changing the weight adds nothing.
    await saveWorkout(db, await draftOf(db, saved, '2026-03-05'), '2026-03-05', saved);
    expect(await db.prescriptions.count()).toBe(2);
  });

  it('duplicates with new keys, a unique name and the current targets', async () => {
    const db = await freshDb();
    const w = await save(db);
    const copy = await duplicateWorkout(db, w.code, TODAY);
    const again = await duplicateWorkout(db, w.code, TODAY);
    expect([copy.name, again.name]).toEqual(['Back pump (copy)', 'Back pump (copy 2)']);
    expect(copy.code).not.toBe(w.code);
    expect(copy.slots.some((s) => w.slots.some((o) => o.slotKey === s.slotKey))).toBe(false);
    expect((await db.prescriptions.where('slotKey').equals(copy.slots[0]!.slotKey).toArray())[0]?.loadKg).toBe(35);
  });

  it('delete archives: hidden from lists and future plans, past sessions still open', async () => {
    const db = await freshDb();
    const w = await save(db);
    const past = await startSession(db, w, null, '2026-03-02');
    await finishSession(db, past, { fatigue: null, notes: [] });
    await saveWeek(db, { weekStart: '2026-03-02', restDays: ['2026-03-08'], unavailableDays: [], status: 'saved', notes: [], entries: [
      { date: '2026-03-02', templateCode: w.code, origin: 'manual', state: 'done', sessionId: past },
      { date: '2026-03-06', templateCode: w.code, origin: 'manual', state: 'planned' },
    ] });
    await archiveWorkout(db, w.code, TODAY);
    expect(await customWorkouts(db)).toEqual([]);
    expect((await customWorkouts(db, true))[0]!.archived).toBe(true);
    expect((await db.weekPlans.get('2026-03-02'))!.entries.map((e) => e.state)).toEqual(['done']);
    expect((await findTemplate(db, (await db.sessions.get(past))!))?.name).toBe('Back pump');
  });

  it('schedules on a day and explains conflicts with rest days and the main pull day', async () => {
    const db = await freshDb();
    const w = await save(db);
    await saveWeek(db, { weekStart: '2026-03-02', restDays: ['2026-03-08'], unavailableDays: [], status: 'saved', notes: [], entries: [
      { date: '2026-03-03', templateCode: 'C', origin: 'generated', state: 'planned' },
    ] });
    const warnings = await scheduleWorkout(db, w.code, '2026-03-02'); // Monday, day before C
    expect(warnings).toContainEqual(expect.objectContaining({ code: 'pull_before_main', message: 'Back pump the day before C (Pull + pull-ups, main day): back and grip fatigue will cost pull-up performance.' }));
    const onRest = await scheduleWorkout(db, w.code, '2026-03-08');
    expect(onRest).toContainEqual(expect.objectContaining({ severity: 'conflict', code: 'rest_day' }));
    expect((await db.weekPlans.get('2026-03-02'))!.entries.map((e) => e.templateCode)).toEqual([w.code, 'C', w.code]);
  });

  it('creates custom exercises and refuses to edit built-in ones', async () => {
    const db = await freshDb();
    const input = { name: 'Hammer curl', kind: 'dumbbell' as const, parts: ['arms' as const], pull: false, perSide: null, cues: '' };
    const r = await saveExercise(db, input);
    expect(r).toMatchObject({ ok: true, exercise: { name: 'Hammer curl', custom: true } });
    expect(await saveExercise(db, input)).toEqual({ ok: false, problems: ['An exercise called "Hammer curl" already exists.'] });
    expect(await saveExercise(db, { ...input, name: 'Bench' }, 'barbell-bench-press')).toEqual({ ok: false, problems: ['Built-in exercises cannot be edited.'] });
  });
});
