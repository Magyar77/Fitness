import type { Exercise } from '../../engine/model';
import { EQUIPMENT_KINDS, EXERCISE_TYPES, MUSCLE_LABEL, typeOf } from '../../engine/library/groups';

const IMAGE_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises/';

/** Photo URL for a library image path (free-exercise-db, public domain). */
export const imageUrl = (path: string) => IMAGE_BASE + path.split('/').map(encodeURIComponent).join('/');

const LEVEL: Record<NonNullable<Exercise['level']>, string> = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Advanced' };

export function muscleSummary(e: Exercise): string {
  return (e.muscles ?? []).map((m) => MUSCLE_LABEL[m]).join(', ');
}

/** Photos, muscles and how-to for one exercise. */
export function ExerciseDetail({ exercise: e }: { exercise: Exercise }) {
  const equipment = EQUIPMENT_KINDS.find((k) => k.id === e.equipmentKind)?.label;
  const type = EXERCISE_TYPES.find((t) => t.id === typeOf(e))?.label;
  const facts = [type, equipment, e.level && LEVEL[e.level], e.perSide && `per ${e.perSide}`].filter(Boolean);
  const steps = e.instructions ?? [];
  return (
    <div className="exercise-detail">
      {(e.images?.length ?? 0) > 0 && (
        <div className="photos">
          {e.images!.slice(0, 2).map((p, i) => (
            <img key={p} src={imageUrl(p)} alt={`${e.name}, ${i === 0 ? 'start' : 'end'} position`} loading="lazy" decoding="async" />
          ))}
        </div>
      )}
      {facts.length > 0 && <p className="muted small">{facts.join(' · ')}</p>}
      {(e.muscles?.length ?? 0) > 0 && (
        <p className="small">
          <strong>Works:</strong> {muscleSummary(e)}
          {(e.secondaryMuscles?.length ?? 0) > 0 && <span className="muted">; also {e.secondaryMuscles!.map((m) => MUSCLE_LABEL[m]).join(', ')}</span>}
        </p>
      )}
      <p className="muted small">Record: {e.loadConvention}</p>
      {e.cues.length > 0 && (
        <ul className="cues">
          {e.cues.map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
      {steps.length > 0 && (
        <details>
          <summary>How to do it</summary>
          <ol className="steps">
            {steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </details>
      )}
    </div>
  );
}
