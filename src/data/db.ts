import Dexie, { type EntityTable } from 'dexie';
import type {
  BodyWeightEntry,
  EquipmentProfile,
  Exercise,
  ProgressPhoto,
  Prescription,
  ProgramVersion,
  SetLog,
  WeekPlan,
  WorkoutSession,
  WorkoutTemplate,
} from '../engine/model';
import type { DecisionRecord } from '../engine/progression';
import { PROGRAM_V2 } from '../engine/program/programV2';
import { READY_MADE } from '../engine/program/templates';
import type { MeasurementEntry } from '../engine/measurements';

export interface SettingRow {
  key: string;
  value: unknown;
}

export const DB_NAME = 'personal-fitness';
export const SCHEMA_VERSION = 2;

/** Every table, in backup order. Primary key in brackets. */
export const TABLES = {
  programs: 'id', // immutable program versions
  templates: 'id', // custom workouts
  exercises: 'id', // custom exercises (the built-in library lives in code)
  equipment: 'id', // user overrides of equipment profiles
  sessions: 'id',
  sets: 'id',
  prescriptions: 'id',
  decisions: 'id',
  weekPlans: 'weekStart',
  bodyWeights: 'date',
  settings: 'key',
  measurements: 'date', // since schema 2
  photos: 'id', // since schema 2
} as const;

export type TableName = keyof typeof TABLES;

export class FitnessDB extends Dexie {
  programs!: EntityTable<ProgramVersion, 'id'>;
  templates!: EntityTable<WorkoutTemplate, 'id'>;
  exercises!: EntityTable<Exercise, 'id'>;
  equipment!: EntityTable<EquipmentProfile, 'id'>;
  sessions!: EntityTable<WorkoutSession, 'id'>;
  sets!: EntityTable<SetLog, 'id'>;
  prescriptions!: EntityTable<Prescription, 'id'>;
  decisions!: EntityTable<DecisionRecord, 'id'>;
  weekPlans!: EntityTable<WeekPlan, 'weekStart'>;
  bodyWeights!: EntityTable<BodyWeightEntry, 'date'>;
  settings!: EntityTable<SettingRow, 'key'>;
  measurements!: EntityTable<MeasurementEntry, 'date'>;
  photos!: EntityTable<ProgressPhoto, 'id'>;

  constructor(name = DB_NAME) {
    super(name);
    this.version(1).stores({
      programs: 'id',
      templates: 'id, code',
      exercises: 'id',
      equipment: 'id',
      sessions: 'id, date, templateCode, status',
      sets: 'id, sessionId, slotKey, exerciseId',
      prescriptions: 'id, slotKey, linkGroup, effectiveFrom',
      decisions: 'id, slotKey, basisSessionId, status, createdAt',
      weekPlans: 'weekStart',
      bodyWeights: 'date',
      settings: 'key',
    });
    // Schema 2: body measurements and progress photos (new tables only, nothing to migrate).
    this.version(2).stores({ measurements: 'date', photos: 'id, date' });
    // Future schema changes: add this.version(3).stores({...}).upgrade(tx => ...) here,
    // and a matching step in upgradeBackup() so old backup files keep restoring.
  }
}

/** Adds built-in program versions that are missing. Existing versions are never overwritten. */
export async function ensureSeeded(db: FitnessDB): Promise<void> {
  await db.transaction('rw', db.programs, async () => {
    for (const p of [PROGRAM_V2, ...READY_MADE]) {
      if (!(await db.programs.get(p.id))) await db.programs.add(p);
    }
  });
}

let instance: FitnessDB | null = null;

export function getDb(): FitnessDB {
  instance ??= new FitnessDB();
  return instance;
}
