import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { FitnessDB, ensureSeeded } from '../../src/data/db';
import { getProfile, saveProfile } from '../../src/data/profile';
import { applyUnitDefaults, getEquipment, markEquipmentCustomized, saveEquipment, settingsFrom } from '../../src/data/equipment';
import { finishSession, startSession } from '../../src/data/workouts';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import { toDisplay } from '../../src/engine/units';
import { coachingNotes, pullUpStatus } from '../../src/engine/stats';

let n = 0;
const opened: FitnessDB[] = [];
async function freshDb() {
  const db = new FitnessDB(`profile-${++n}`);
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

describe('profile', () => {
  it('starts new devices with setup pending, kg, no goals', async () => {
    expect(await getProfile(await freshDb())).toEqual({ onboarded: false, unit: 'kg', goals: [], barKg: 20 });
  });

  it('keeps devices that already have workouts set up as before', async () => {
    const db = await freshDb();
    const id = await startSession(db, PROGRAM_V2.templates[0]!, PROGRAM_V2.id, '2026-03-03');
    await finishSession(db, id, { fatigue: null, notes: [] });
    expect(await getProfile(db)).toEqual({ onboarded: true, unit: 'kg', goals: ['first-pull-up', 'lose-fat', 'build-muscle'], barKg: null });
  });

  it('saves and reads back', async () => {
    const db = await freshDb();
    await saveProfile(db, { onboarded: true, unit: 'lb', goals: ['get-stronger'], barKg: 20.4117 });
    expect(await getProfile(db)).toEqual({ onboarded: true, unit: 'lb', goals: ['get-stronger'], barKg: 20.4117 });
    // A profile saved before the bar setting existed keeps "plates only".
    await db.settings.put({ key: 'profile', value: { onboarded: true, unit: 'kg', goals: [] } });
    expect((await getProfile(db)).barKg).toBeNull();
  });
});

describe('unit defaults for equipment', () => {
  it('switches to 5 lb / 10 lb steps and back to kg', async () => {
    const db = await freshDb();
    expect(await applyUnitDefaults(db, 'lb')).toBe(true);
    const lb = settingsFrom(await getEquipment(db));
    expect([lb.barbellStep, lb.dumbbellStep, lb.legPressStep].map((v) => toDisplay(v, 'lb'))).toEqual([5, 5, 10]);
    await applyUnitDefaults(db, 'kg');
    expect(settingsFrom(await getEquipment(db))).toMatchObject({ barbellStep: 2.5, dumbbellStep: 2.5, legPressStep: 5 });
  });

  it('never overwrites steps the person set themselves', async () => {
    const db = await freshDb();
    await saveEquipment(db, { ...settingsFrom(await getEquipment(db)), dumbbellStep: 1 });
    await markEquipmentCustomized(db);
    expect(await applyUnitDefaults(db, 'lb')).toBe(false);
    expect(settingsFrom(await getEquipment(db)).dumbbellStep).toBe(1);
  });
});

describe('goal-dependent coaching notes', () => {
  it('drops pull-up and weigh-in notes when those are not goals', () => {
    const base = { today: '2026-03-11', lastSession: null, pending: 0, bodyWeights: [] };
    const withGoals = coachingNotes({ ...base, pullUp: pullUpStatus([], []) });
    const without = coachingNotes({ ...base, pullUp: null, trackBodyWeight: false });
    expect(withGoals.some((n) => n.startsWith('Pull-up path'))).toBe(true);
    expect(withGoals.some((n) => n.startsWith('No body weight'))).toBe(true);
    expect(without).toEqual([]);
  });
});
