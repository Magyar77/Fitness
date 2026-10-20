// Domain types shared by the engine, the data layer and the UI.
// Conventions: dates are local "YYYY-MM-DD"; loads are kg; `null` means "unknown"
// (recorded but not known), while an omitted field means "not applicable".

import type { IsoDate } from './dates';

export type DataQuality = 'confirmed' | 'unconfirmed' | 'approximate' | 'unknown' | 'inferred';

// ---------------------------------------------------------------------------
// Exercise library & equipment

export type LoadType =
  | 'plates' // barbell or plate-loaded machine, plates only (bar/sled not counted)
  | 'barbell_total' // total including the bar
  | 'dumbbell_per_hand'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'assisted_machine' // kg of assistance; less is harder
  | 'cardio';

export type Measure = 'reps' | 'time' | 'distance' | 'duration';

export interface Exercise {
  id: string;
  name: string;
  loadType: LoadType;
  measure: Measure;
  /** How the load is recorded, shown in the logger. */
  loadConvention: string;
  cues: string[];
  alternatives: string[];
  equipmentProfileId?: string;
  tags: string[];
  custom: boolean;
  /** Main body region (null for cardio); used to judge how demanding a custom workout is. */
  region: Region | null;
  /** Loaded pulling (rows, pulldowns, pull-ups): back fatigue relevant to the main pull-up day. */
  pull: boolean;
  /** Default per-side label for unilateral exercises. */
  perSide?: 'leg' | 'arm' | 'side';
}

export interface EquipmentProfile {
  id: string;
  name: string;
  /** `step`: load moves in fixed steps (null = step unknown, e.g. "next pin"). `ladder`: explicit list. */
  kind: 'step' | 'ladder';
  stepKg?: number | null;
  /** Ascending, kg. For assisted machines these are kg of assistance. */
  loadsKg?: number[];
  /** Assisted machines: the pin values and add-on lever the ladder was built from. */
  pinsKg?: number[];
  leverKg?: number | null;
  note: string;
  quality: DataQuality;
}

// ---------------------------------------------------------------------------
// Program (immutable once created)

export interface Range {
  min: number;
  max: number;
}

export type SlotTarget =
  | { kind: 'reps'; min: number; max: number }
  | { kind: 'max_time' } // "max" hold, e.g. dead hang
  | { kind: 'time'; minSec: number; maxSec: number }
  | { kind: 'distance'; minM: number; maxM: number }
  | { kind: 'duration'; minMin: number; maxMin: number }; // single continuous bout, no sets

export type ProgressionRule =
  | { id: 'load_double'; stepKg?: number }
  | { id: 'assisted_reps' }
  | { id: 'assisted_negative'; tempoSec: number }
  | { id: 'bodyweight_reps'; capReps: number; requirePause?: boolean }
  | { id: 'timed_hold'; stepSec: number }
  | { id: 'max_hang' }
  | { id: 'distance_load' }
  | { id: 'none' };

export interface TemplateSlot {
  /** Stable across program versions, e.g. "A-03". */
  slotKey: string;
  order: number;
  exerciseId: string;
  /** Display name as written in the program. */
  name: string;
  sets: number | null; // null for a single continuous bout (cardio)
  target: SlotTarget;
  perSide: 'leg' | 'arm' | 'side' | null;
  rir: Range | null; // null = "–"
  restSec: Range | null; // null = "–"
  notes: string[];
  supersetGroup?: string;
  /** Slots in the same link group share one progression state. */
  linkGroup?: string;
  rule: ProgressionRule;
}

export type Demand = 'hard' | 'moderate' | 'easy';
export type Region = 'upper' | 'lower' | 'core';
export type PullRole = 'main' | 'light' | 'none';

export interface WorkoutTemplate {
  id: string;
  kind: 'program' | 'custom';
  code: string; // "A".."E" for the program; unique id-like code for custom workouts
  name: string;
  focus: string;
  pullUpWork: string;
  estMinutes: number | null;
  demand: Demand;
  regions: Region[];
  pullRole: PullRole;
  /** Contains loaded pulling (rows, pulldowns): back fatigue that hurts next-day pull-ups. */
  pullVolume: boolean;
  gripLoad: boolean;
  /** Easy day: progress only if the same load still feels like the target RIR, smallest step. */
  easyDay: boolean;
  notes: string[];
  slots: TemplateSlot[];
  /** Custom workouts are archived instead of deleted, so past sessions still open. */
  archived?: boolean;
}

export interface PullUpMilestone {
  id: string;
  name: string;
  target: string;
  reached: boolean;
}

export interface ProgramVersion {
  id: string;
  label: string;
  parentId: string | null;
  createdAt: IsoDate;
  source: 'import' | 'user_edit';
  isOriginal: boolean;
  changeNote: string;
  /** Canonical weekly order, e.g. ["A","B","C","E","D"]. */
  canonicalOrder: string[];
  notes: string[];
  pullUpMilestones: PullUpMilestone[];
  templates: WorkoutTemplate[];
}

// ---------------------------------------------------------------------------
// Adaptive layer (append-only)

export interface Prescription {
  id: string;
  /** Either a slot or a link group (shared by several slots). */
  slotKey?: string;
  linkGroup?: string;
  effectiveFrom: IsoDate;
  loadKg?: number | null; // null = known to change but value not fixed ("next pin")
  assistKg?: number | null;
  repTargets?: number[];
  timeSec?: number;
  distanceM?: number;
  rir?: Range;
  requirePause?: boolean;
  /** Human-readable target as shown to the user. */
  text: string;
  /** `revoked`: undone by the user; kept for history, never current. */
  status: 'active' | 'pending' | 'revoked';
  quality: DataQuality;
  source: 'import' | 'engine' | 'user';
  /** Where an imported target came from, e.g. "docx Next targets". */
  sourceRef: string;
  decisionId?: string;
  notes?: string[];
}

// ---------------------------------------------------------------------------
// History (never rewritten by progression)

export interface RirValue {
  min: number;
  max: number;
}

export type Side = 'both' | 'each' | 'left' | 'right';

export interface DropSegment {
  weightKg: number;
  reps: number;
}

export interface SetLog {
  id: string;
  sessionId: string;
  /** null for an exercise outside the template (e.g. extra cycling). */
  slotKey: string | null;
  exerciseId: string;
  setIndex: number;
  side: Side;
  weightKg?: number | null;
  assistKg?: number | null;
  reps?: number | null;
  durationSec?: number | null;
  distanceM?: number | null;
  rir?: RirValue | null;
  completed: boolean;
  techniqueOk: boolean | null;
  tempoMet?: boolean | null;
  pauseHeld?: boolean | null;
  isWarmup: boolean;
  drops?: DropSegment[];
  notes?: string;
  quality: DataQuality;
  editedAt?: string;
}

export interface Discomfort {
  slotKey: string | null;
  severity: 'mild' | 'sharp';
  note: string;
}

export type SessionFlag = 'imported' | 'partial' | 'legacyProgram';

export interface SnapshotEntry {
  slotKey: string;
  text: string;
}

export interface WorkoutSession {
  id: string;
  date: IsoDate;
  templateCode: string | null;
  programVersionId: string | null;
  status: 'in_progress' | 'completed' | 'abandoned';
  startedAt: string | null;
  finishedAt: string | null;
  fatigue: number | null; // 1..5
  discomfort: Discomfort[];
  conditions: string[];
  notes: string[];
  flags: SessionFlag[];
  /** Frozen copy of the targets that applied when the session started. */
  prescriptionSnapshot: SnapshotEntry[] | null;
}

export interface WeekPlanEntry {
  date: IsoDate;
  templateCode: string;
  origin: 'generated' | 'manual' | 'import';
  state: 'planned' | 'done' | 'skipped';
  sessionId?: string;
}

export interface WeekPlan {
  weekStart: IsoDate;
  restDays: IsoDate[];
  unavailableDays: IsoDate[];
  status: 'draft' | 'saved';
  entries: WeekPlanEntry[];
  notes: string[];
}

export interface BodyWeightEntry {
  date: IsoDate;
  kg: number;
  conditions?: string;
  source: 'import' | 'manual';
}

/** A set of records to merge into the database (personal seed, backup subset). */
export interface DataBundle {
  format: 'personal-fitness-bundle';
  version: 1;
  description: string;
  sessions: WorkoutSession[];
  sets: SetLog[];
  prescriptions: Prescription[];
  weekPlans: WeekPlan[];
  bodyWeights: BodyWeightEntry[];
}
