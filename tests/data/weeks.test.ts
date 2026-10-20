import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { FitnessDB, ensureSeeded } from '../../src/data/db';
import { checkWeek, earliestFor, loadWeekContext, proposeWeek, saveWeek, unplaced } from '../../src/data/weeks';
import { finishSession, startSession } from '../../src/data/workouts';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import type { WorkoutTemplate } from '../../src/engine/model';

const T = (code: string) => PROGRAM_V2.templates.find((t) => t.code === code) as WorkoutTemplate;
const MON = '2026-03-02';
const day = (i: number) => {
  const d = new Date(`${MON}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + i);
  return d.toISOString().slice(0, 10);
};

let n = 0;
const opened: FitnessDB[] = [];
async function freshDb() {
  const db = new FitnessDB(`weeks-${++n}`);
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

async function done(db: FitnessDB, code: string, date: string) {
  const id = await startSession(db, T(code), PROGRAM_V2.id, date);
  await finishSession(db, id, { fatigue: null, notes: [] });
  return id;
}

describe('week planning data', () => {
  it('suggests Sunday rest for a first week and proposes C A B E D', async () => {
    const db = await freshDb();
    const ctx = await loadWeekContext(db, MON);
    expect(ctx.suggestedRest).toEqual([day(6)]);
    const p = proposeWeek(ctx, PROGRAM_V2.templates, [day(5), day(6)], [], MON);
    expect(p.entries.map((e) => e.templateCode).join('')).toBe('CABED');
  });

  it('carries last week\'s rest-day pattern forward', async () => {
    const db = await freshDb();
    await saveWeek(db, { weekStart: day(-7), restDays: [day(-2), day(-1)], unavailableDays: [], status: 'saved', entries: [], notes: [] });
    expect((await loadWeekContext(db, MON)).suggestedRest).toEqual([day(5), day(6)]);
  });

  it('treats completed workouts as fixed and only places the rest from today', async () => {
    const db = await freshDb();
    const c = await done(db, 'C', day(0));
    const ctx = await loadWeekContext(db, MON);
    expect(ctx.completed).toEqual([{ date: day(0), templateCode: 'C', origin: 'manual', state: 'done', sessionId: c }]);
    const p = proposeWeek(ctx, PROGRAM_V2.templates, [day(5), day(6)], [], day(2)); // today = Wednesday
    expect(p.entries.map((e) => `${e.date.slice(8)}${e.templateCode}`)).toEqual([`${day(0).slice(8)}C`, `${day(2).slice(8)}A`, `${day(3).slice(8)}B`, `${day(4).slice(8)}D`]);
    expect(p.omitted.map((o) => o.templateCode)).toEqual(['E']); // Tuesday is past: one day short
  });

  it('includes the end of last week for recovery', async () => {
    const db = await freshDb();
    await done(db, 'D', day(-1));
    const ctx = await loadWeekContext(db, MON);
    expect(ctx.previousTail.map((e) => e.templateCode)).toEqual(['D']);
    const p = proposeWeek(ctx, PROGRAM_V2.templates, [day(6)], [], MON);
    expect(p.entries[0]!.date).not.toBe(MON); // C not right after Sunday's D
  });

  it('places nothing new in a week that is already over', () => {
    expect(earliestFor(MON, day(9))).toBe(day(9));
  });

  it('checks manual edits and lists unplaced workouts', async () => {
    const db = await freshDb();
    const ctx = await loadWeekContext(db, MON);
    const entries = [{ date: day(6), templateCode: 'C', origin: 'manual' as const, state: 'planned' as const }];
    expect(checkWeek(ctx, PROGRAM_V2.templates, entries, [day(6)], []).map((w) => w.code)).toContain('rest_day');
    expect(unplaced(PROGRAM_V2.templates, entries).map((t) => t.code)).toEqual(['A', 'B', 'E', 'D']);
    expect(unplaced(PROGRAM_V2.templates, [{ ...entries[0]!, state: 'skipped' }])).toHaveLength(5);
  });

  it('saves sorted entries and rejects dates outside the week', async () => {
    const db = await freshDb();
    await saveWeek(db, { weekStart: MON, restDays: [], unavailableDays: [], status: 'draft', notes: [], entries: [
      { date: day(2), templateCode: 'A', origin: 'generated', state: 'planned' },
      { date: day(0), templateCode: 'C', origin: 'generated', state: 'planned' },
    ] });
    const saved = await db.weekPlans.get(MON);
    expect(saved).toMatchObject({ status: 'saved' });
    expect(saved!.entries.map((e) => e.templateCode)).toEqual(['C', 'A']);
    await expect(saveWeek(db, { weekStart: MON, restDays: [], unavailableDays: [], status: 'draft', notes: [], entries: [{ date: day(9), templateCode: 'A', origin: 'manual', state: 'planned' }] })).rejects.toThrow('outside this week');
  });
});
