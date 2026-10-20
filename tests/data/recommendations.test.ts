import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { FitnessDB, ensureSeeded } from '../../src/data/db';
import { finishSession, saveSet, startSession } from '../../src/data/workouts';
import { acceptDecision, evaluateSession, overrideDecision, pendingDecisions, rejectDecision, undoDecision } from '../../src/data/recommendations';
import { activePrescription } from '../../src/engine/progression';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import type { Prescription, RirValue, WorkoutTemplate } from '../../src/engine/model';

const T = (code: string) => PROGRAM_V2.templates.find((t) => t.code === code) as WorkoutTemplate;
const slot = (key: string) => PROGRAM_V2.templates.flatMap((t) => t.slots).find((s) => s.slotKey === key)!;
const rx = (p: Partial<Prescription>): Prescription => ({ id: crypto.randomUUID(), effectiveFrom: '2026-03-01', text: 't', status: 'active', quality: 'confirmed', source: 'engine', sourceRef: 'test', ...p });

let n = 0;
const opened: FitnessDB[] = [];
async function freshDb() {
  const db = new FitnessDB(`recs-${++n}`);
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

interface Row { w?: number; a?: number; r: number; rir?: RirValue | null }

/** Logs one workout: given slots get the rows, everything else stays uncompleted. */
async function workout(db: FitnessDB, code: string, date: string, rows: Record<string, Row[]>, fatigue: number | null = 2) {
  const id = await startSession(db, T(code), PROGRAM_V2.id, date);
  for (const [key, list] of Object.entries(rows)) {
    for (const [i, r] of list.entries()) {
      const set = (await db.sets.get(`${id}:${key}:${i + 1}`))!;
      await saveSet(db, { ...set, weightKg: r.w ?? set.weightKg, assistKg: r.a ?? set.assistKg, reps: r.r, rir: r.rir === undefined ? { min: 2, max: 2 } : r.rir, completed: true });
    }
  }
  await finishSession(db, id, { fatigue, notes: [] });
  return id;
}

const top = (w: number) => Array(4).fill({ w, r: 8 });

describe('recommendations after a workout', () => {
  it('auto-applies a routine increase from the next day, with a plain-English reason', async () => {
    const db = await freshDb();
    const id = await workout(db, 'A', '2026-03-03', { 'A-03': top(40) });
    const [d] = await evaluateSession(db, id, new Date('2026-03-03T10:00:00Z'));
    expect(d).toMatchObject({ slotKey: 'A-03', outcome: 'increase', status: 'auto_applied' });
    expect(d!.explanation).toContain('the weight goes up to 42.5 kg');
    const p = await db.prescriptions.get(d!.prescriptionId!);
    expect(p).toMatchObject({ slotKey: 'A-03', effectiveFrom: '2026-03-04', loadKg: 42.5, repTargets: [6, 6, 6, 6], source: 'engine', decisionId: d!.id });
    // The next A pre-fills the new load.
    const next = await startSession(db, T('A'), PROGRAM_V2.id, '2026-03-10');
    expect((await db.sets.get(`${next}:A-03:1`))?.weightKg).toBe(42.5);
  });

  it('is idempotent and only evaluates exercises that were performed', async () => {
    const db = await freshDb();
    const id = await workout(db, 'A', '2026-03-03', { 'A-03': top(40) });
    const first = await evaluateSession(db, id);
    const second = await evaluateSession(db, id);
    expect(second.map((d) => d.id)).toEqual(first.map((d) => d.id));
    expect(first.map((d) => d.slotKey)).toEqual(['A-03']);
    expect(await db.prescriptions.count()).toBe(1);
  });

  it('keeps a pending recommendation until accepted or rejected', async () => {
    const db = await freshDb();
    const id = await workout(db, 'A', '2026-03-03', { 'A-03': Array(4).fill({ w: 40, r: 8, rir: null }) });
    const [d] = await evaluateSession(db, id);
    expect(d).toMatchObject({ outcome: 'increase', apply: 'approval', status: 'pending' });
    expect(d!.prescriptionId).toBeUndefined();
    expect((await pendingDecisions(db)).map((x) => x.id)).toEqual([d!.id]);

    await acceptDecision(db, d!.id);
    const accepted = await db.decisions.get(d!.id);
    expect(accepted).toMatchObject({ status: 'accepted' });
    expect(await db.prescriptions.get(accepted!.prescriptionId!)).toMatchObject({ loadKg: 42.5 });
    expect(await pendingDecisions(db)).toEqual([]);
  });

  it('rejecting leaves the current target in place', async () => {
    const db = await freshDb();
    await db.prescriptions.add(rx({ slotKey: 'A-03', loadKg: 40, repTargets: [8, 8, 8, 8], text: '40 kg' }));
    const id = await workout(db, 'A', '2026-03-03', { 'A-03': Array(4).fill({ w: 40, r: 8, rir: null }) });
    const [d] = await evaluateSession(db, id);
    await rejectDecision(db, d!.id);
    expect((await db.decisions.get(d!.id))?.status).toBe('rejected');
    expect(activePrescription(await db.prescriptions.toArray(), slot('A-03'), '2026-03-10')?.loadKg).toBe(40);
  });

  it('override replaces an applied change with your own target', async () => {
    const db = await freshDb();
    const id = await workout(db, 'A', '2026-03-03', { 'A-03': top(40) });
    const [d] = await evaluateSession(db, id);
    await overrideDecision(db, d!.id, { loadKg: 40, repTargets: [8, 8, 8, 8], text: '40 kg, 4 × 8 (your override)' });
    const all = await db.prescriptions.toArray();
    expect(all.find((p) => p.id === d!.prescriptionId)).toMatchObject({ loadKg: 42.5, status: 'revoked' }); // kept, not deleted
    expect((await db.decisions.get(d!.id))?.prescriptionId).not.toBe(d!.prescriptionId); // now points at the override
    const current = activePrescription(all, slot('A-03'), '2026-03-10');
    expect(current).toMatchObject({ loadKg: 40, source: 'user', text: '40 kg, 4 × 8 (your override)' });
    expect((await db.decisions.get(d!.id))?.status).toBe('overridden');
  });

  it('undo revokes the change and the previous target is current again', async () => {
    const db = await freshDb();
    await db.prescriptions.add(rx({ slotKey: 'A-03', loadKg: 40, text: '40 kg' }));
    const id = await workout(db, 'A', '2026-03-03', { 'A-03': top(40) });
    const [d] = await evaluateSession(db, id);
    expect(activePrescription(await db.prescriptions.toArray(), slot('A-03'), '2026-03-10')?.loadKg).toBe(42.5);
    await undoDecision(db, d!.id);
    expect((await db.decisions.get(d!.id))?.status).toBe('undone');
    expect(activePrescription(await db.prescriptions.toArray(), slot('A-03'), '2026-03-10')?.loadKg).toBe(40);
    expect(await db.prescriptions.count()).toBe(2); // nothing deleted
  });

  it('high fatigue holds without creating a new target', async () => {
    const db = await freshDb();
    await db.prescriptions.add(rx({ slotKey: 'A-03', loadKg: 40, repTargets: [8, 8, 8, 8], text: '40 kg' }));
    const id = await workout(db, 'A', '2026-03-03', { 'A-03': top(40) }, 5);
    const [d] = await evaluateSession(db, id);
    expect(d).toMatchObject({ outcome: 'hold', status: 'auto_applied', next: null });
    expect(d!.prescriptionId).toBeUndefined();
    expect(await db.prescriptions.count()).toBe(1);
  });

  it('writes linked-slot decisions to the link group (lateral raises A↔D)', async () => {
    const db = await freshDb();
    const id = await workout(db, 'D', '2026-03-07', { 'D-05': Array(3).fill({ w: 7.5, r: 15, rir: { min: 1, max: 1 } }) });
    const [d] = await evaluateSession(db, id);
    expect(d).toMatchObject({ slotKey: 'D-05', linkGroup: 'lateral-raise', outcome: 'increase' });
    const p = await db.prescriptions.get(d!.prescriptionId!);
    expect(p).toMatchObject({ linkGroup: 'lateral-raise', loadKg: 10 });
    expect(p).not.toHaveProperty('slotKey');
    expect(activePrescription(await db.prescriptions.toArray(), slot('A-06'), '2026-03-10')?.loadKg).toBe(10);
  });

  it('never changes the completed workout itself', async () => {
    const db = await freshDb();
    const id = await workout(db, 'A', '2026-03-03', { 'A-03': top(40) });
    const snap = async () => JSON.stringify([await db.sessions.get(id), await db.sets.where('sessionId').equals(id).sortBy('id')]);
    const before = await snap();
    const [d] = await evaluateSession(db, id);
    await overrideDecision(db, d!.id, { loadKg: 45, text: '45 kg' });
    await undoDecision(db, d!.id);
    expect(await snap()).toBe(before);
  });

  it('ignores sessions that are not completed', async () => {
    const db = await freshDb();
    const id = await startSession(db, T('A'), PROGRAM_V2.id, '2026-03-03');
    expect(await evaluateSession(db, id)).toEqual([]);
  });
});
