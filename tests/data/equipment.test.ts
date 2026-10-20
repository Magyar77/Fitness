import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { FitnessDB, ensureSeeded } from '../../src/data/db';
import { getEquipment, saveEquipment, settingsFrom, validateEquipment } from '../../src/data/equipment';
import { backupDue, backupReminder, markBackedUp } from '../../src/data/backup';
import { assistedLadderFrom, EQUIPMENT } from '../../src/engine/library/equipment';
import { lighter } from '../../src/engine/progression';

let n = 0;
const opened: FitnessDB[] = [];
async function freshDb() {
  const db = new FitnessDB(`equipment-${++n}`);
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

describe('assisted-machine ladder', () => {
  it('combines pins with an optional lever', () => {
    expect(assistedLadderFrom([7, 14, 21], 2.3)).toEqual([0, 2.3, 7, 9.3, 14, 16.3, 21, 23.3]);
    expect(assistedLadderFrom([7, 14, 21], null)).toEqual([0, 7, 14, 21]);
  });
  it('reproduces the derived default exactly', () => {
    const s = settingsFrom(EQUIPMENT);
    expect(assistedLadderFrom(s.assistPins, s.assistLever)).toEqual(EQUIPMENT.find((e) => e.id === 'assisted-machine')!.loadsKg);
  });
});

describe('equipment settings', () => {
  it('validates values', () => {
    const s = settingsFrom(EQUIPMENT);
    expect(validateEquipment(s)).toEqual([]);
    expect(validateEquipment({ ...s, assistPins: [], cableStep: -1, dumbbellStep: 0 })).toEqual([
      'Enter at least one assisted-machine pin value.',
      'Dumbbell step must be between 0 and 20 kg.',
      'Cable step must be between 0 and 20 kg, or left empty if unknown.',
    ]);
  });

  it('saves overrides that progression then uses', async () => {
    const db = await freshDb();
    const s = settingsFrom(await getEquipment(db));
    expect(await saveEquipment(db, { ...s, assistPins: [34, 7, 14, 21, 27], assistLever: null, cableStep: 2.5 })).toEqual([]);
    const eq = await getEquipment(db);
    const assisted = eq.find((e) => e.id === 'assisted-machine')!;
    expect(assisted).toMatchObject({ pinsKg: [7, 14, 21, 27, 34], leverKg: null, quality: 'confirmed', loadsKg: [0, 7, 14, 21, 27, 34] });
    expect(lighter(assisted, 34)).toBe(27); // no lever: next step is the next pin
    expect(eq.find((e) => e.id === 'cable-stack')).toMatchObject({ stepKg: 2.5, quality: 'confirmed' });
    expect(settingsFrom(eq)).toMatchObject({ assistPins: [7, 14, 21, 27, 34], assistLever: null, cableStep: 2.5 });
  });
});

describe('backup reminder', () => {
  const now = new Date('2026-03-10T12:00:00Z');
  it('stays quiet without data and nags after a week', () => {
    expect(backupDue(null, 0, now).due).toBe(false);
    expect(backupDue(null, 3, now)).toEqual({ due: true, text: "You haven't saved a backup yet. Your data lives only on this phone." });
    expect(backupDue('2026-03-02T12:00:00Z', 3, now)).toMatchObject({ due: true, text: 'Last backup was 8 days ago. Save a fresh one to keep your history safe.' });
    expect(backupDue('2026-03-09T12:00:00Z', 3, now)).toEqual({ due: false, text: 'Last backup 1 day ago.' });
  });
  it('remembers the last backup', async () => {
    const db = await freshDb();
    await markBackedUp(db, now);
    expect(await backupReminder(db, now)).toEqual({ due: false, text: '' }); // no workouts yet
  });
});
