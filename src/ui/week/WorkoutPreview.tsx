import type { IsoDate } from '../../engine/dates';
import { summarizeSets, targetText } from '../../engine/logging';
import type { Exercise, Prescription, SetLog, WorkoutTemplate } from '../../engine/model';
import { activePrescription } from '../../engine/progression';

interface Props {
  template: WorkoutTemplate;
  date: IsoDate;
  prescriptions: Prescription[];
  exercises: ReadonlyMap<string, Exercise>;
  /** Sets of the completed session, when the workout is done. */
  doneSets: SetLog[] | null;
}

/** The exercises of one workout: the targets for that day, or what was actually done. */
export function WorkoutPreview({ template, date, prescriptions, exercises, doneSets }: Props) {
  return (
    <ol className="preview">
      {template.slots.map((slot) => {
        const e = exercises.get(slot.exerciseId);
        const sets = doneSets?.filter((s) => s.slotKey === slot.slotKey) ?? null;
        const detail =
          sets && e
            ? sets.some((s) => s.completed)
              ? summarizeSets(sets, e)
              : 'skipped'
            : targetText(slot, activePrescription(prescriptions, slot, date));
        return (
          <li key={slot.slotKey}>
            <span className="preview-name">
              {slot.name}
              {slot.supersetGroup && <span className="badge">superset</span>}
            </span>
            <span className={`small ${sets ? '' : 'muted'}`}>{detail}</span>
          </li>
        );
      })}
    </ol>
  );
}
