import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { FitnessDB, ensureSeeded, SCHEMA_VERSION } from '../../src/data/db';
import { checkBackup, exportBackup, importBundle, restoreBackup, type BackupFile } from '../../src/data/backup';
import { bodyWeightCsv, setsCsv, toCsv } from '../../src/data/csv';
import { logSets, times } from '../../src/engine/import/compact';
import { PROGRAM_V2 } from '../../src/engine/program/programV2';
import type { DataBundle } from '../../src/engine/model';

// Anonymised fixture data.
function bundle(): DataBundle {
  return {
    format: 'personal-fitness-bundle',
    version: 1,
    description: 'fixture',
    sessions: [
      {
        id: 's1', date: '2026-03-03', templateCode: 'A', programVersionId: PROGRAM_V2.id, status: 'completed',
        startedAt: null, finishedAt: null, fatigue: 2, discomfort: [], conditions: [], notes: ['felt good, "strong"'], flags: [], prescriptionSnapshot: null,
      },
    ],
    sets: [
      ...logSets('s1', 'A-03', 'barbell-bench-press', times(4, { w: 40, r: 8, rir: [1, 2] })),
      ...logSets('s1', 'A-07', 'cable-triceps-pushdown', [{ w: 15, r: 5, rir: 0, drops: [{ weightKg: 12.5, reps: 7 }], note: 'drop, then done' }]),
    ],
    prescriptions: [
      { id: 'p1', slotKey: 'A-03', effectiveFrom: '2026-03-04', loadKg: 42.5, repTargets: [6, 6, 6, 6], text: '42.5 kg', status: 'active', quality: 'confirmed', source: 'engine', sourceRef: 'test' },
    ],
    weekPlans: [
      { weekStart: '2026-03-02', restDays: ['2026-03-08'], unavailableDays: [], status: 'saved', notes: [], entries: [{ date: '2026-03-03', templateCode: 'A', origin: 'generated', state: 'done', sessionId: 's1' }] },
    ],
    bodyWeights: [
      { date: '2026-03-02', kg: 80.4, source: 'manual' },
      { date: '2026-03-05', kg: 80.1, source: 'manual' },
    ],
  };
}

let n = 0;
const opened: FitnessDB[] = [];
async function freshDb(): Promise<FitnessDB> {
  const db = new FitnessDB(`test-${++n}`);
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

describe('database', () => {
  it('opens schema v1 and seeds Program v2 once, never overwriting it', async () => {
    const db = await freshDb();
    expect(db.verno).toBe(SCHEMA_VERSION);
    expect((await db.programs.toArray()).map((p) => p.id).sort()).toEqual([PROGRAM_V2.id, 'tpl-beginner-3', 'tpl-expert-5', 'tpl-intermediate-4']);
    await db.programs.update(PROGRAM_V2.id, { changeNote: 'kept' });
    await ensureSeeded(db);
    expect((await db.programs.get(PROGRAM_V2.id))?.changeNote).toBe('kept');
  });
});

describe('bundle import (merge)', () => {
  it('adds new records and skips existing ones, so importing twice is harmless', async () => {
    const db = await freshDb();
    const first = await importBundle(db, bundle());
    expect(first).toMatchObject({ ok: true, report: { added: { sessions: 1, sets: 5, prescriptions: 1, weekPlans: 1, bodyWeights: 2 } } });
    const second = await importBundle(db, bundle());
    expect(second).toMatchObject({ ok: true, report: { added: { sessions: 0, sets: 0 }, skipped: { sessions: 1, sets: 5, bodyWeights: 2 } } });
    expect(await db.sets.count()).toBe(5);
  });

  it('never overwrites an existing record', async () => {
    const db = await freshDb();
    await importBundle(db, bundle());
    const changed = bundle();
    changed.bodyWeights[0]!.kg = 99;
    await importBundle(db, changed);
    expect((await db.bodyWeights.get('2026-03-02'))?.kg).toBe(80.4);
  });

  it('rejects an invalid bundle without writing anything', async () => {
    const db = await freshDb();
    const bad = bundle();
    bad.sets.push(...logSets('s1', 'Z-99', 'barbell-bench-press', [{ w: 1, r: 1 }]));
    const r = await importBundle(db, bad);
    expect(r.ok).toBe(false);
    expect(await db.sessions.count()).toBe(0);
    expect(await importBundle(db, { hello: 'world' })).toEqual({ ok: false, problems: ['Not a Personal Fitness data bundle.'] });
  });
});

describe('backup and restore', () => {
  it('round-trips: export → wipe → restore → identical export', async () => {
    const db = await freshDb();
    await importBundle(db, bundle());
    await db.settings.put({ key: 'autoApply', value: 'routine' });
    const before = await exportBackup(db, new Date('2026-03-06T10:00:00Z'));
    const json = JSON.parse(JSON.stringify(before)) as BackupFile;

    const other = await freshDb();
    expect(await restoreBackup(other, json)).toEqual({ ok: true });
    const after = await exportBackup(other, new Date('2026-03-06T10:00:00Z'));
    expect(after).toEqual(before);
    expect(Object.values(after.tables).every(Array.isArray)).toBe(true);
    expect(after.tables.sets).toHaveLength(5);
  });

  it('replaces existing data on restore', async () => {
    const db = await freshDb();
    await importBundle(db, bundle());
    const empty = await exportBackup(await freshDb());
    await restoreBackup(db, JSON.parse(JSON.stringify(empty)));
    expect(await db.sessions.count()).toBe(0);
    expect(await db.programs.count()).toBe(4);
  });

  it('rejects corrupted or incomplete files and leaves current data untouched', async () => {
    const db = await freshDb();
    await importBundle(db, bundle());
    const good = JSON.parse(JSON.stringify(await exportBackup(db))) as BackupFile;

    const missingTable = structuredClone(good);
    delete (missingTable.tables as Partial<BackupFile['tables']>).sets;
    const dangling = structuredClone(good);
    (dangling.tables.sets[0] as { sessionId: string }).sessionId = 'ghost';
    const duplicate = structuredClone(good);
    duplicate.tables.bodyWeights.push(duplicate.tables.bodyWeights[0]);

    for (const [file, message] of [
      [null, 'Not a backup file.'],
      [{ format: 'something-else' }, 'Not a Personal Fitness backup file.'],
      [{ ...good, schemaVersion: SCHEMA_VERSION + 1 }, 'newer version of the app'],
      [missingTable, 'Missing table "sets".'],
      [dangling, 'unknown session ghost'],
      [duplicate, 'duplicate date'],
    ] as const) {
      const r = await restoreBackup(db, file);
      expect(r.ok).toBe(false);
      expect(r.ok ? '' : r.problems.join('\n')).toContain(message);
    }
    expect(await db.sets.count()).toBe(5);
    expect(await db.sessions.count()).toBe(1);
  });

  it('is all-or-nothing when a write fails mid-restore', async () => {
    const db = await freshDb();
    await importBundle(db, bundle());
    const good = JSON.parse(JSON.stringify(await exportBackup(db))) as BackupFile;
    // A valid file whose write fails after other tables were already cleared.
    expect(checkBackup(good).file).not.toBeNull();
    const original = db.sets.bulkAdd.bind(db.sets);
    db.sets.bulkAdd = (() => Promise.reject(new Error('disk full'))) as unknown as typeof db.sets.bulkAdd;
    await expect(restoreBackup(db, good)).rejects.toThrow('disk full');
    db.sets.bulkAdd = original;
    expect(await db.sessions.count()).toBe(1); // cleared tables were rolled back
    expect(await db.sets.count()).toBe(5);
  });
});

describe('CSV export', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['line\nbreak', null]])).toBe('a,b\r\n"x,y","say ""hi"""\r\n"line\nbreak",\r\n');
  });

  it('exports sets with exercise names, RIR ranges and drop segments', () => {
    const b = bundle();
    const lines = setsCsv(b.sessions, b.sets).trim().split('\r\n');
    expect(lines[0]).toBe('date,workout,slot,exercise,set,side,weight_kg,assist_kg,reps,duration_s,distance_m,rir_min,rir_max,completed,technique_ok,tempo_met,pause_held,warmup,drops,quality,notes');
    expect(lines).toHaveLength(6);
    expect(lines[1]).toBe('2026-03-03,A,A-03,Barbell bench press,1,both,40,,8,,,1,2,true,true,,,false,,confirmed,');
    expect(lines[5]).toBe('2026-03-03,A,A-07,Cable triceps pushdown,1,both,15,,5,,,0,0,true,true,,,false,12.5x7,confirmed,"drop, then done"');
  });

  it('exports body weight sorted by date', () => {
    expect(bodyWeightCsv([...bundle().bodyWeights].reverse())).toBe('date,kg,conditions,source\r\n2026-03-02,80.4,,manual\r\n2026-03-05,80.1,,manual\r\n');
  });
});
