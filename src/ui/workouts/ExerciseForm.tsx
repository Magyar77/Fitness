import { useState } from 'react';
import { getDb } from '../../data/db';
import { saveExercise } from '../../data/custom';
import { EXERCISE_KINDS, type CustomExerciseInput, type ExerciseKind } from '../../engine/custom';
import type { Exercise, Region } from '../../engine/model';

interface Props {
  onSaved: (e: Exercise) => void;
  onCancel: () => void;
  initialName?: string;
}

export function ExerciseForm({ onSaved, onCancel, initialName = '' }: Props) {
  const [input, setInput] = useState<CustomExerciseInput>({ name: initialName, kind: 'dumbbell', region: null, pull: false, perSide: null, cues: '' });
  const [problems, setProblems] = useState<string[]>([]);
  const set = (p: Partial<CustomExerciseInput>) => setInput({ ...input, ...p });

  async function save() {
    const r = await saveExercise(getDb(), input);
    if (r.ok) onSaved(r.exercise);
    else setProblems(r.problems);
  }

  return (
    <div className="card form">
      <h2>New exercise</h2>
      <label className="field">
        <span>Name</span>
        <input type="text" value={input.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Hammer curl" />
      </label>
      <label className="field">
        <span>Type</span>
        <select value={input.kind} onChange={(e) => set({ kind: e.target.value as ExerciseKind })}>
          {EXERCISE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>
      </label>
      {input.kind !== 'cardio' && (
        <fieldset className="field">
          <legend>Main body region</legend>
          <div className="segmented">
            {(['upper', 'lower', 'core'] as Region[]).map((r) => (
              <button key={r} type="button" className={input.region === r ? '' : 'secondary'} aria-pressed={input.region === r} onClick={() => set({ region: r })}>
                {r[0]!.toUpperCase() + r.slice(1)}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <label className="field">
        <span>One side at a time?</span>
        <select value={input.perSide ?? ''} onChange={(e) => set({ perSide: (e.target.value || null) as CustomExerciseInput['perSide'] })}>
          <option value="">No, both sides together</option>
          <option value="leg">Yes, per leg</option>
          <option value="arm">Yes, per arm</option>
          <option value="side">Yes, per side</option>
        </select>
      </label>
      <label className="flag">
        <input type="checkbox" checked={input.pull} onChange={(e) => set({ pull: e.target.checked })} />
        Loaded pulling (rows, pulldowns, pull-ups): matters for the main pull-up day
      </label>
      <label className="field">
        <span>Technique cues (one per line, optional)</span>
        <textarea rows={2} value={input.cues} onChange={(e) => set({ cues: e.target.value })} />
      </label>
      {problems.length > 0 && <p className="notice error">{problems.join('\n')}</p>}
      <div className="buttons">
        <button type="button" onClick={() => void save()}>Save exercise</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
