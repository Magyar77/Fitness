import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { FitnessDB, ensureSeeded } from '../../src/data/db';
import { allExercises } from '../../src/data/custom';
import { importLog, previewLog, type NameChoice } from '../../src/data/importLog';
import { loadProgress } from '../../src/data/progress';
import { parseLog } from '../../src/engine/import/csvLog';
import { exerciseHistory } from '../../src/engine/stats';

let n = 0;
const opened: FitnessDB[] = [];
async function freshDb() {
  const db = new FitnessDB(`import-${++n}`);
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

const CSV = [
  'Date,Workout Name,Exercise Name,Set Order,Weight,Reps,Seconds',
  '2026-01-05 18:00:00,Upper,Bench Press (Barbell),1,60,8,',
  '2026-01-05 18:00:00,Upper,Bench Press (Barbell),2,60,7,',
  '2026-01-05 18:00:00,Upper,Zercher Carry Thing,1,40,,30',
  '2026-01-08 18:00:00,Upper,Bench Press (Barbell),1,62.5,8,',
  '2026-01-08 18:00:00,Lower,Squat (Barbell),1,100,5,',
].join('\n');

const choicesOf = (preview: ReturnType<typeof previewLog>) => new Map<string, NameChoice>(preview.names.map((r) => [r.name, r.choice]));

describe('importing a workout log', () => {
  it('previews sessions, sets, dates and exercise matches', async () => {
    const db = await freshDb();
    const preview = previewLog(parseLog(CSV), await allExercises(db));
    expect(preview).toMatchObject({ sessions: 3, sets: 5, from: '2026-01-05', to: '2026-01-08' });
    const byName = new Map(preview.names.map((r) => [r.name, r]));
    expect(byName.get('Bench Press (Barbell)')!.choice).toEqual({ kind: 'existing', exerciseId: 'barbell-bench-press' });
    expect(byName.get('Zercher Carry Thing')!.choice).toEqual({ kind: 'new', as: 'timed' });
    expect(preview.names[0]!.match).toBeNull(); // unmatched names first, so they get checked
  });

  it('adds history without touching targets, and a second import adds nothing', async () => {
    const db = await freshDb();
    const log = parseLog(CSV);
    const preview = previewLog(log, await allExercises(db));
    const rxBefore = await db.prescriptions.count();
    const r = await importLog(db, log, { choices: choicesOf(preview), barIncluded: true, barKg: 20 });
    expect(r).toMatchObject({ sessions: 3, sets: 5, newExercises: ['Zercher Carry Thing'], alreadyThere: 0 });
    expect(await db.prescriptions.count()).toBe(rxBefore);

    const bench = (await db.sets.where('exerciseId').equals('barbell-bench-press').toArray()).sort((a, b) => a.id.localeCompare(b.id));
    expect(bench.map((s) => s.weightKg)).toEqual([40, 40, 42.5]); // plates only: the 20 kg bar is taken off
    expect(bench.every((s) => s.slotKey === null && s.completed && s.quality === 'confirmed')).toBe(true);
    const sessions = await db.sessions.toArray();
    expect(sessions.every((s) => s.flags.includes('imported') && s.status === 'completed' && s.templateCode === null)).toBe(true);

    const data = await loadProgress(db);
    expect(exerciseHistory(data.sessions, data.sets, data.exercises.get('barbell-bench-press')!).length).toBe(2);

    const again = await importLog(db, log, { choices: choicesOf(preview), barIncluded: true, barKg: 20 });
    expect(again).toMatchObject({ sessions: 0, sets: 0, alreadyThere: 3, newExercises: [] });
    expect(await db.sets.count()).toBe(5);
  });

  it('respects skip and a manual exercise choice; body weights never overwrite', async () => {
    const db = await freshDb();
    await db.bodyWeights.put({ date: '2026-01-05', kg: 90, source: 'manual' });
    const log = parseLog(`${CSV}\n2026-01-05,,Body weight,,85,,\n2026-01-06,,Body weight,,84.5,,`);
    const choices = choicesOf(previewLog(log, await allExercises(db)));
    choices.set('Zercher Carry Thing', { kind: 'skip' });
    choices.set('Squat (Barbell)', { kind: 'existing', exerciseId: 'goblet-squat' });
    const r = await importLog(db, log, { choices, barIncluded: false, barKg: 20 });
    expect(r).toMatchObject({ sets: 4, bodyWeights: 1, newExercises: [] });
    expect((await db.sets.where('exerciseId').equals('goblet-squat').toArray())[0]!.weightKg).toBe(100);
    expect((await db.bodyWeights.get('2026-01-05'))!.kg).toBe(90);
    expect((await db.bodyWeights.get('2026-01-06'))).toMatchObject({ kg: 84.5, source: 'import' });
  });
});
