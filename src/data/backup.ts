// Full backup / restore (replace everything) and bundle import (merge, never overwrite).

import type { Table } from 'dexie';
import { EXERCISES_BY_ID } from '../engine/library/exercises';
import { validateBundle } from '../engine/import/validateBundle';
import { PROGRAM_V2 } from '../engine/program/programV2';
import type { DataBundle, Exercise, ProgramVersion } from '../engine/model';
import { SCHEMA_VERSION, TABLES, type FitnessDB, type TableName } from './db';

export const BACKUP_FORMAT = 'personal-fitness-backup';

export type BackupTables = Record<TableName, unknown[]>;

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  schemaVersion: number;
  exportedAt: string;
  tables: BackupTables;
}

const TABLE_NAMES = Object.keys(TABLES) as TableName[];

function tableOf(db: FitnessDB, name: TableName): Table<unknown, unknown> {
  return db[name] as unknown as Table<unknown, unknown>;
}

export async function exportBackup(db: FitnessDB, now: Date = new Date()): Promise<BackupFile> {
  const tables = {} as BackupTables;
  await db.transaction('r', TABLE_NAMES.map((n) => tableOf(db, n)), async () => {
    for (const name of TABLE_NAMES) tables[name] = await tableOf(db, name).toArray();
  });
  return { format: BACKUP_FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: now.toISOString(), tables };
}

/** Brings an older backup up to the current schema. Throws for unknown or newer versions. */
export function upgradeBackup(file: BackupFile): BackupFile {
  if (file.schemaVersion > SCHEMA_VERSION) {
    throw new Error(`This backup was made by a newer version of the app (schema ${file.schemaVersion}). Update the app first.`);
  }
  if (file.schemaVersion < 1) throw new Error(`Unknown backup schema ${file.schemaVersion}.`);
  // Version 1 is current. Future: if (file.schemaVersion === 1) file = v1toV2(file); …
  return file;
}

/** Structural and referential checks. Returns problems; empty = safe to restore. */
export function checkBackup(raw: unknown): { file: BackupFile | null; problems: string[] } {
  const problems: string[] = [];
  if (!raw || typeof raw !== 'object') return { file: null, problems: ['Not a backup file.'] };
  const f = raw as Partial<BackupFile>;
  if (f.format !== BACKUP_FORMAT) return { file: null, problems: ['Not a Personal Fitness backup file.'] };
  if (typeof f.schemaVersion !== 'number') return { file: null, problems: ['Backup has no schema version.'] };

  let file: BackupFile;
  try {
    file = upgradeBackup(f as BackupFile);
  } catch (e) {
    return { file: null, problems: [(e as Error).message] };
  }

  if (!file.tables || typeof file.tables !== 'object') return { file: null, problems: ['Backup has no tables.'] };
  for (const name of TABLE_NAMES) {
    const rows = file.tables[name];
    if (!Array.isArray(rows)) {
      problems.push(`Missing table "${name}".`);
      continue;
    }
    const key = TABLES[name];
    const seen = new Set<unknown>();
    rows.forEach((row, i) => {
      const id = row && typeof row === 'object' ? (row as Record<string, unknown>)[key] : undefined;
      if (typeof id !== 'string' || !id) problems.push(`${name}[${i}] has no ${key}.`);
      else if (seen.has(id)) problems.push(`${name}: duplicate ${key} "${id}".`);
      seen.add(id);
    });
  }
  if (problems.length) return { file: null, problems };

  const t = file.tables;
  problems.push(...referenceProblems(t.programs as ProgramVersion[], t.exercises as Exercise[], {
    format: 'personal-fitness-bundle',
    version: 1,
    description: 'backup',
    sessions: t.sessions as DataBundle['sessions'],
    sets: t.sets as DataBundle['sets'],
    prescriptions: t.prescriptions as DataBundle['prescriptions'],
    weekPlans: t.weekPlans as DataBundle['weekPlans'],
    bodyWeights: t.bodyWeights as DataBundle['bodyWeights'],
  }));
  return problems.length ? { file: null, problems } : { file, problems: [] };
}

function referenceProblems(programs: ProgramVersion[], customExercises: Exercise[], bundle: DataBundle): string[] {
  const allPrograms = programs.some((p) => p.id === PROGRAM_V2.id) ? programs : [PROGRAM_V2, ...programs];
  const exercises = new Map(EXERCISES_BY_ID);
  for (const e of customExercises) exercises.set(e.id, e);
  return validateBundle(bundle, allPrograms, exercises);
}

/**
 * Replaces all data with the backup in one transaction: either everything is restored
 * or nothing changes. Invalid files are rejected before anything is touched.
 */
export async function restoreBackup(db: FitnessDB, raw: unknown): Promise<{ ok: true } | { ok: false; problems: string[] }> {
  const { file, problems } = checkBackup(raw);
  if (!file) return { ok: false, problems };
  await db.transaction('rw', TABLE_NAMES.map((n) => tableOf(db, n)), async () => {
    for (const name of TABLE_NAMES) {
      const table = tableOf(db, name);
      await table.clear();
      await table.bulkAdd(file.tables[name]);
    }
  });
  return { ok: true };
}

export interface ImportReport {
  added: Record<string, number>;
  skipped: Record<string, number>;
}

/**
 * Merges a DataBundle (e.g. the personal seed). Records whose key already exists are
 * skipped, never overwritten, so importing the same file twice is harmless.
 */
export async function importBundle(db: FitnessDB, raw: unknown): Promise<{ ok: true; report: ImportReport } | { ok: false; problems: string[] }> {
  if (!raw || typeof raw !== 'object' || (raw as DataBundle).format !== 'personal-fitness-bundle') {
    return { ok: false, problems: ['Not a Personal Fitness data bundle.'] };
  }
  const bundle = raw as DataBundle;
  for (const k of ['sessions', 'sets', 'prescriptions', 'weekPlans', 'bodyWeights'] as const) {
    if (!Array.isArray(bundle[k])) return { ok: false, problems: [`Bundle is missing "${k}".`] };
  }
  const programs = await db.programs.toArray();
  const custom = await db.exercises.toArray();
  const problems = referenceProblems(programs, custom, bundle);
  if (problems.length) return { ok: false, problems };

  const parts: [TableName, unknown[]][] = [
    ['sessions', bundle.sessions],
    ['sets', bundle.sets],
    ['prescriptions', bundle.prescriptions],
    ['weekPlans', bundle.weekPlans],
    ['bodyWeights', bundle.bodyWeights],
  ];
  const report: ImportReport = { added: {}, skipped: {} };
  await db.transaction('rw', parts.map(([n]) => tableOf(db, n)), async () => {
    for (const [name, rows] of parts) {
      const table = tableOf(db, name);
      const key = TABLES[name];
      const keys = rows.map((r) => (r as Record<string, unknown>)[key] as string);
      const existing = await table.bulkGet(keys);
      const fresh = rows.filter((_, i) => existing[i] === undefined);
      await table.bulkAdd(fresh);
      report.added[name] = fresh.length;
      report.skipped[name] = rows.length - fresh.length;
    }
  });
  return { ok: true, report };
}
