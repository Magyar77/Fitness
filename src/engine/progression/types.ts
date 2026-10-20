import type { IsoDate } from '../dates';
import type {
  EquipmentProfile,
  Exercise,
  Prescription,
  SetLog,
  TemplateSlot,
  WorkoutSession,
  WorkoutTemplate,
} from '../model';

/** Bump when rule behaviour changes, so stored explanations stay attributable. */
export const RULESET_VERSION = '1.0.0';

export interface ProgressionSettings {
  /** Session fatigue (1–5) at or above which nothing gets harder. */
  fatigueThreshold: number;
  /** Days since the slot was last trained after which the next session only holds. */
  gapDays: number;
  /** After repeated misses, recommend the heaviest load at least this % lighter (docx: 5–10%). */
  decreasePct: number;
  /** How many RIR below the target still counts as "at target" (decision 20 Oct: 1). */
  rirTolerance: number;
}

export const DEFAULT_SETTINGS: ProgressionSettings = {
  fatigueThreshold: 4,
  gapDays: 14,
  decreasePct: 5,
  rirTolerance: 1,
};

/** One past performance of the slot (or of any slot in its link group). */
export interface SlotPerformance {
  session: WorkoutSession;
  sets: SetLog[];
}

export interface EvaluateInput {
  slot: TemplateSlot;
  template: WorkoutTemplate;
  exercise: Exercise;
  equipment: EquipmentProfile | undefined;
  /** The target that applied to the latest performance, if any. */
  current: Prescription | null;
  /** Chronological; the last entry is the session being evaluated. */
  history: SlotPerformance[];
  settings: ProgressionSettings;
}

export type Outcome = 'increase' | 'hold' | 'decrease' | 'blocked' | 'milestone' | 'none';

export type Reason =
  | 'top_of_range'
  | 'within_range'
  | 'short_once'
  | 'short_twice'
  | 'technique'
  | 'rir_too_low'
  | 'rir_missing'
  | 'incomplete_sets'
  | 'decline'
  | 'decline_twice'
  | 'fatigue'
  | 'discomfort_mild'
  | 'discomfort_sharp'
  | 'gap'
  | 'data_quality'
  | 'no_data'
  | 'tempo_missed'
  | 'tempo_unknown'
  | 'pause_missing'
  | 'pause_unknown'
  | 'at_cap'
  | 'easy_day'
  | 'step_unknown'
  | 'bodyweight_reached'
  | 'not_progressive';

/** The new target a decision proposes. Missing fields mean "unchanged / not applicable". */
export interface TargetDraft {
  loadKg?: number | null;
  assistKg?: number | null;
  repTargets?: number[];
  timeSec?: number;
  distanceM?: number;
  requirePause?: boolean;
  text: string;
}

export interface Decision {
  slotKey: string;
  linkGroup?: string;
  outcome: Outcome;
  reasons: Reason[];
  explanation: string;
  /** null = keep the current target. */
  next: TargetDraft | null;
  apply: 'auto' | 'approval';
  basisSessionId: string | null;
  basisDate: IsoDate | null;
  rulesetVersion: string;
}
