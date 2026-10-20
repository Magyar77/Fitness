import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { FitnessDB, ensureSeeded } from '../../src/data/db';
import { deleteBodyWeight, loadProgress, saveBodyWeight, validateBodyWeight } from '../../src/data/progress';

let n = 0;
const opened: FitnessDB[] = [];
async function freshDb() {
  const db = new FitnessDB(`progress-${++n}`);
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

describe('body weight entry', () => {
  it('validates date and weight', () => {
    expect(validateBodyWeight('2026-03-05', 80, '2026-03-04')).toEqual(["The date can't be in the future."]);
    expect(validateBodyWeight('2026-03-04', null, '2026-03-04')).toEqual(['Enter your weight (30–300 kg / 66–660 lb).']);
    expect(validateBodyWeight('', 500, '2026-03-04')).toEqual(['Choose a date.', 'Enter your weight (30–300 kg / 66–660 lb).']);
  });

  it('keeps one entry per day, rounds to 0.01 kg and deletes', async () => {
    const db = await freshDb();
    expect(await saveBodyWeight(db, { date: '2026-03-02', kg: 80.444, conditions: ' morning ' }, '2026-03-04')).toEqual([]);
    await saveBodyWeight(db, { date: '2026-03-02', kg: 80.2 }, '2026-03-04');
    await saveBodyWeight(db, { date: '2026-03-01', kg: 80.9 }, '2026-03-04');
    const data = await loadProgress(db);
    expect(data.bodyWeights).toEqual([
      { date: '2026-03-01', kg: 80.9, source: 'manual' },
      { date: '2026-03-02', kg: 80.2, source: 'manual' },
    ]);
    await deleteBodyWeight(db, '2026-03-01');
    expect((await loadProgress(db)).bodyWeights.map((b) => b.date)).toEqual(['2026-03-02']);
  });

  it('names slots and link groups for progress items', async () => {
    const db = await freshDb();
    const { nameOf } = await loadProgress(db);
    expect([nameOf('A-03'), nameOf('lateral-raise'), nameOf('unknown')]).toEqual(['Barbell bench press', 'Dumbbell lateral raises', 'unknown']);
  });
});
