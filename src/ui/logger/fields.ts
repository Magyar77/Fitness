import type { Exercise, TemplateSlot } from '../../engine/model';

export interface Fields {
  weight: boolean;
  assist: boolean;
  reps: boolean;
  seconds: boolean;
  minutes: boolean;
  distance: boolean;
  rir: boolean;
  /** Tempo check for negatives ("every rep 5 s"), in seconds. */
  tempo: number | null;
  /** Quality check for pause milestones ("1 s pause held"). */
  pause: boolean;
}

const WEIGHTED = new Set(['plates', 'barbell_total', 'dumbbell_per_hand', 'machine', 'cable']);

export function fieldsFor(slot: TemplateSlot, exercise: Exercise, targetText = ''): Fields {
  return {
    weight: WEIGHTED.has(exercise.loadType),
    assist: exercise.loadType === 'assisted_machine',
    reps: exercise.measure === 'reps',
    seconds: exercise.measure === 'time',
    minutes: exercise.measure === 'duration',
    distance: exercise.measure === 'distance',
    rir: slot.rir !== null,
    tempo: slot.rule.id === 'assisted_negative' ? slot.rule.tempoSec : null,
    pause: (slot.rule.id === 'bodyweight_reps' && !!slot.rule.requirePause) || /pause/i.test(targetText),
  };
}

export function perSideLabel(slot: TemplateSlot): string {
  return slot.perSide ? `per ${slot.perSide}` : '';
}
