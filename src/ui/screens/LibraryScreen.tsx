import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDb } from '../../data/db';
import { allExercises } from '../../data/custom';
import type { Exercise } from '../../engine/model';
import { ExerciseBrowser } from '../library/ExerciseBrowser';
import { ExerciseForm } from '../workouts/ExerciseForm';

export function LibraryScreen() {
  const db = getDb();
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [added, setAdded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    allExercises(db).then((list) => {
      if (alive) setExercises(list);
    });
    return () => {
      alive = false;
    };
  }, [db, version]);

  return (
    <section className="screen library">
      <Link to="/log" className="back">← Workouts</Link>
      <h1>Exercise library</h1>
      <p className="muted small">Gym, street workout and bodyweight exercises. Tap one for photos and how to do it.</p>
      {added && <p className="notice ok">Added "{added}" to the library.</p>}
      {creating ? (
        <ExerciseForm
          onSaved={(e) => {
            setCreating(false);
            setAdded(e.name);
            setVersion((v) => v + 1);
          }}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <button type="button" className="secondary wide" onClick={() => setCreating(true)}>+ Add your own exercise</button>
      )}
      {exercises ? <ExerciseBrowser exercises={exercises} /> : <p className="muted">Loading…</p>}
    </section>
  );
}
