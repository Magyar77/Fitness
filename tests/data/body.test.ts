import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { FitnessDB, ensureSeeded } from '../../src/data/db';
import { addPhoto, deleteMeasurement, deletePhoto, listMeasurements, listPhotos, photoStats, saveMeasurement } from '../../src/data/body';
import { exportBackup, restoreBackup, type BackupFile } from '../../src/data/backup';
import { fromBase64, toBase64 } from '../../src/data/base64';

const TODAY = '2026-03-10';
let n = 0;
const opened: FitnessDB[] = [];
async function freshDb(name = `body-${++n}`) {
  const db = new FitnessDB(name);
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

const bytes = (...v: number[]) => new Uint8Array(v).buffer;
const photo = (date: string, pose: 'front' | 'side' | 'back' = 'front', data = bytes(1, 2, 3, 250)) => ({ date, pose, mime: 'image/jpeg', bytes: data, width: 800, height: 1000 });
const json = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

describe('schema 2 upgrade', () => {
  it('upgrades a schema 1 database in place, keeping everything', async () => {
    const name = `upgrade-${++n}`;
    const old = new Dexie(name);
    old.version(1).stores({ programs: 'id', templates: 'id, code', exercises: 'id', equipment: 'id', sessions: 'id, date, templateCode, status', sets: 'id, sessionId, slotKey, exerciseId', prescriptions: 'id, slotKey, linkGroup, effectiveFrom', decisions: 'id, slotKey, basisSessionId, status, createdAt', weekPlans: 'weekStart', bodyWeights: 'date', settings: 'key' });
    await old.table('bodyWeights').add({ date: '2026-03-01', kg: 90, source: 'manual' });
    old.close();

    const db = await freshDb(name);
    expect(db.verno).toBe(2);
    expect(await db.bodyWeights.get('2026-03-01')).toMatchObject({ kg: 90 });
    expect(await saveMeasurement(db, { date: '2026-03-01', values: { waist: 85 } }, TODAY)).toEqual([]);
  });
});

describe('measurements', () => {
  it('saves, adds to the same day, validates and deletes', async () => {
    const db = await freshDb();
    expect(await saveMeasurement(db, { date: '2026-03-01', values: { waist: 85 } }, TODAY)).toEqual([]);
    expect(await saveMeasurement(db, { date: '2026-03-01', values: { arm: 35 }, notes: 'after breakfast' }, TODAY)).toEqual([]);
    expect(await saveMeasurement(db, { date: '2026-03-20', values: { waist: 84 } }, TODAY)).toEqual(["The date can't be in the future."]);
    expect(await listMeasurements(db)).toEqual([{ date: '2026-03-01', values: { waist: 85, arm: 35 }, notes: 'after breakfast' }]);
    await deleteMeasurement(db, '2026-03-01');
    expect(await listMeasurements(db)).toEqual([]);
  });
});

describe('progress photos', () => {
  it('adds, lists newest first, counts and deletes', async () => {
    const db = await freshDb();
    await addPhoto(db, photo('2026-03-01', 'side'), TODAY);
    await addPhoto(db, photo('2026-03-01', 'front'), TODAY);
    await addPhoto(db, photo('2026-03-08'), TODAY);
    expect(await addPhoto(db, { ...photo('2026-03-08'), mime: 'application/pdf' }, TODAY)).toEqual({ ok: false, problems: ['That file is not a photo.'] });
    const list = await listPhotos(db);
    expect(list.map((p) => `${p.date}:${p.pose}`)).toEqual(['2026-03-08:front', '2026-03-01:front', '2026-03-01:side']);
    expect(new Uint8Array(list[0]!.bytes)).toEqual(new Uint8Array([1, 2, 3, 250]));
    expect(await photoStats(db)).toEqual({ count: 3, bytes: 12 });
    await deletePhoto(db, list[0]!.id);
    expect((await photoStats(db)).count).toBe(2);
  });

  it('base64 round-trips bytes', () => {
    const big = new Uint8Array(100_000).map((_, i) => i % 256).buffer;
    expect(new Uint8Array(fromBase64(toBase64(big)))).toEqual(new Uint8Array(big));
  });
});

describe('backups with measurements and photos', () => {
  it('round-trips photos and measurements through a JSON backup', async () => {
    const db = await freshDb();
    await saveMeasurement(db, { date: '2026-03-01', values: { waist: 85 } }, TODAY);
    await addPhoto(db, photo('2026-03-01'), TODAY);
    const file = json(await exportBackup(db, new Date('2026-03-10T10:00:00Z')));
    expect((file.tables.photos[0] as { data: string }).data).toBe(toBase64(bytes(1, 2, 3, 250)));

    const other = await freshDb();
    expect(await restoreBackup(other, file)).toEqual({ ok: true });
    expect(await listMeasurements(other)).toEqual([{ date: '2026-03-01', values: { waist: 85 } }]);
    expect(new Uint8Array((await listPhotos(other))[0]!.bytes)).toEqual(new Uint8Array([1, 2, 3, 250]));
    expect(await exportBackup(other, new Date('2026-03-10T10:00:00Z'))).toEqual(file);
  });

  it('a backup without photos leaves the photos on the phone alone', async () => {
    const db = await freshDb();
    await addPhoto(db, photo('2026-03-01'), TODAY);
    const noPhotos = json(await exportBackup(db, new Date(), { photos: false }));
    expect(noPhotos).toMatchObject({ photosOmitted: true, tables: { photos: [] } });
    expect(await restoreBackup(db, noPhotos)).toEqual({ ok: true });
    expect((await photoStats(db)).count).toBe(1);
  });

  it('still restores schema 1 backups, keeping photos', async () => {
    const db = await freshDb();
    await addPhoto(db, photo('2026-03-01'), TODAY);
    await saveMeasurement(db, { date: '2026-03-01', values: { waist: 85 } }, TODAY);
    const v1 = json(await exportBackup(db)) as BackupFile;
    v1.schemaVersion = 1;
    delete (v1.tables as Partial<BackupFile['tables']>).photos;
    delete (v1.tables as Partial<BackupFile['tables']>).measurements;
    expect(await restoreBackup(db, v1)).toEqual({ ok: true });
    expect((await photoStats(db)).count).toBe(1);
    expect(await listMeasurements(db)).toEqual([]); // a v1 backup is an older snapshot without measurements
  });

  it('rejects a damaged photo without changing anything', async () => {
    const db = await freshDb();
    await addPhoto(db, photo('2026-03-01'), TODAY);
    const file = json(await exportBackup(db));
    (file.tables.photos[0] as { data: string }).data = '%%% not base64 %%%';
    expect(await restoreBackup(db, file)).toEqual({ ok: false, problems: ['A photo in the backup is damaged. Nothing was changed.'] });
    expect((await photoStats(db)).count).toBe(1);
  });
});
