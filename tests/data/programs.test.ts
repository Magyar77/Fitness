import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { FitnessDB, ensureSeeded } from '../../src/data/db';
import { chooseProgram, createOwnProgram, moveProgramWorkout, programChoices, programHistory, removeProgramWorkout, saveProgramWorkout } from '../../src/data/programs';
import { draftOf } from '../../src/data/custom';
import { currentProgram, finishSession, findTemplate, startSession } from '../../src/data/workouts';
import { defaultSlot } from '../../src/engine/custom';
import { EXERCISES_BY_ID } from '../../src/engine/library/exercises';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import { settingsForProgram } from '../../src/engine/scheduling';

const ex = (id: string) => EXERCISES_BY_ID.get(id)!;
const TODAY = '2026-03-03';

let n = 0;
const opened: FitnessDB[] = [];
async function freshDb() {
  const db = new FitnessDB(`programs-${++n}`);
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

describe('choosing a program', () => {
  it('switches between ready-made programs, Program v2 and no program', async () => {
    const db = await freshDb();
    expect((await currentProgram(db)).id).toBe(PROGRAM_V2.id); // default for existing installs
    await chooseProgram(db, 'tpl-intermediate-4');
    expect((await currentProgram(db)).templates.map((t) => t.code)).toEqual(['A', 'B', 'C', 'D']);
    await chooseProgram(db, 'none');
    expect(await currentProgram(db)).toMatchObject({ id: 'none', templates: [] });
    await expect(chooseProgram(db, 'nope')).rejects.toThrow('Program not found.');
  });
});

describe('building your own program', () => {
  it('adds workouts as new versions, with starting weights as targets', async () => {
    const db = await freshDb();
    const own = await createOwnProgram(db, TODAY);
    expect(own).toMatchObject({ label: 'My program', templates: [], parentId: null, isOriginal: false });
    const r = await saveProgramWorkout(db, { name: 'Upper', demand: 'moderate', notes: '', slots: [{ ...defaultSlot(ex('barbell-bench-press')), targetKg: 60 }] }, TODAY);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.program.parentId).toBe(own.id);
    expect(r.workout).toMatchObject({ code: 'A', kind: 'program', name: 'Upper' });
    expect((await db.prescriptions.where('slotKey').equals(r.workout.slots[0]!.slotKey).toArray())[0]).toMatchObject({ loadKg: 60, source: 'user' });
    const r2 = await saveProgramWorkout(db, { name: 'Lower', demand: 'hard', notes: '', slots: [defaultSlot(ex('barbell-back-squat'))] }, TODAY);
    expect(r2.ok && r2.workout.code).toBe('B');
    expect((await currentProgram(db)).templates.map((t) => t.name)).toEqual(['Upper', 'Lower']);
    expect((await programHistory(db)).map((p) => p.templates.length)).toEqual([2, 1, 0]);
  });

  it('rejects duplicate names and empty workouts without changing the program', async () => {
    const db = await freshDb();
    await createOwnProgram(db, TODAY);
    await saveProgramWorkout(db, { name: 'Upper', demand: 'moderate', notes: '', slots: [defaultSlot(ex('push-up'))] }, TODAY);
    const before = (await currentProgram(db)).id;
    expect(await saveProgramWorkout(db, { name: 'upper', demand: 'moderate', notes: '', slots: [] }, TODAY)).toEqual({ ok: false, problems: ['A workout called "upper" already exists.', 'Add at least one exercise.'] });
    expect((await currentProgram(db)).id).toBe(before);
  });

  it('removes and reorders workouts; the schedule follows the new order', async () => {
    const db = await freshDb();
    await chooseProgram(db, 'tpl-beginner-3');
    await moveProgramWorkout(db, 'C', -1, TODAY);
    const moved = await currentProgram(db);
    expect(moved.canonicalOrder).toEqual(['A', 'C', 'B']);
    expect(settingsForProgram(moved).referenceOrder).toEqual(['A', 'C', 'B']);
    expect(moved.parentId).toBe('tpl-beginner-3');
    await removeProgramWorkout(db, 'B', TODAY);
    expect((await currentProgram(db)).templates.map((t) => t.code)).toEqual(['A', 'C']);
    expect((await db.programs.get('tpl-beginner-3'))!.templates).toHaveLength(3); // original untouched
  });
});

describe('editing Program v2', () => {
  it('keeps special rules, links and names, leaves v2 untouched, and old sessions still open', async () => {
    const db = await freshDb();
    const A = PROGRAM_V2.templates.find((t) => t.code === 'A')!;
    const past = await startSession(db, A, PROGRAM_V2.id, '2026-03-02');
    await finishSession(db, past, { fatigue: null, notes: [] });

    const draft = await draftOf(db, A, TODAY);
    draft.slots.push(defaultSlot(ex('push-up'))); // add one exercise at the end
    const r = await saveProgramWorkout(db, draft, TODAY, 'A');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const edited = r.workout;
    expect(edited.slots.slice(0, 7).map((s) => s.slotKey)).toEqual(A.slots.map((s) => s.slotKey));
    expect(edited.slots.find((s) => s.slotKey === 'A-02')!.rule).toEqual({ id: 'bodyweight_reps', capReps: 10, requirePause: true });
    expect(edited.slots.find((s) => s.slotKey === 'A-03')!.rule).toEqual({ id: 'load_double', stepKg: 2.5 });
    expect(edited.slots.find((s) => s.slotKey === 'A-06')!.linkGroup).toBe('lateral-raise');
    expect(edited.slots.find((s) => s.slotKey === 'A-05')!.name).toBe('Incline dumbbell press (30°)');
    expect(r.program).toMatchObject({ label: 'Program v2 (edited)', parentId: PROGRAM_V2.id });
    expect(settingsForProgram(r.program).referenceOrder).toEqual(['C', 'A', 'B', 'E', 'D']); // coach's rule kept
    expect(await db.programs.get(PROGRAM_V2.id)).toEqual(PROGRAM_V2);
    expect((await findTemplate(db, (await db.sessions.get(past))!))!.slots).toHaveLength(7);

    // C's negatives keep their tempo rule when C is edited too.
    const C = r.program.templates.find((t) => t.code === 'C')!;
    const r2 = await saveProgramWorkout(db, await draftOf(db, C, TODAY), TODAY, 'C');
    expect(r2.ok && r2.workout.slots.find((s) => s.slotKey === 'C-02')!.rule).toEqual({ id: 'assisted_negative', tempoSec: 5 });
    expect(r2.ok && r2.workout.pullRole).toBe('main');
  });
});

describe('switching programs', () => {
  it('clears planned days from today on, keeps completed ones', async () => {
    const db = await freshDb();
    const C = PROGRAM_V2.templates.find((t) => t.code === 'C')!;
    const done = await startSession(db, C, PROGRAM_V2.id, '2026-03-02');
    await finishSession(db, done, { fatigue: null, notes: [] });
    await db.weekPlans.put({ weekStart: '2026-03-02', restDays: [], unavailableDays: [], status: 'saved', notes: [], entries: [
      { date: '2026-03-02', templateCode: 'C', origin: 'generated', state: 'done', sessionId: done },
      { date: '2026-03-03', templateCode: 'A', origin: 'generated', state: 'planned' },
      { date: '2026-03-05', templateCode: 'B', origin: 'generated', state: 'planned' },
    ] });
    await chooseProgram(db, 'tpl-beginner-3', '2026-03-03');
    expect((await db.weekPlans.get('2026-03-02'))!.entries.map((e) => `${e.templateCode}:${e.state}`)).toEqual(['C:done']);
  });

  it('offers ready-made programs, and Program v2 or your own versions only where they are yours', async () => {
    const fresh = await freshDb();
    await chooseProgram(fresh, 'tpl-beginner-3');
    expect((await programChoices(fresh)).map((p) => p.id)).toEqual(['tpl-beginner-3', 'tpl-intermediate-4', 'tpl-expert-5']);

    const mine = await freshDb(); // a device with Program v2 history and an edited copy
    const A = PROGRAM_V2.templates.find((t) => t.code === 'A')!;
    const s = await startSession(mine, A, PROGRAM_V2.id, '2026-03-02');
    await finishSession(mine, s, { fatigue: null, notes: [] });
    await saveProgramWorkout(mine, await draftOf(mine, A, TODAY), TODAY, 'A');
    await saveProgramWorkout(mine, await draftOf(mine, A, TODAY), TODAY, 'A');
    const ids = (await programChoices(mine)).map((p) => p.id);
    expect(ids.slice(0, 4)).toEqual(['tpl-beginner-3', 'tpl-intermediate-4', 'tpl-expert-5', 'program-v2']);
    expect(ids).toHaveLength(5); // one entry for the edited lineage: its newest version
    expect(ids[4]).toBe((await currentProgram(mine)).id);
  });
});
