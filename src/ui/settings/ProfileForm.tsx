import { useState } from 'react';
import { getDb } from '../../data/db';
import { applyUnitDefaults } from '../../data/equipment';
import { GOALS, type Goal } from '../../data/profile';
import type { Unit } from '../../engine/units';
import { useProfile } from '../profile';

/** Weight unit and goals. Saved as soon as something changes. */
export function ProfileForm() {
  const { profile, update } = useProfile();
  const [note, setNote] = useState<string | null>(null);

  async function setUnit(unit: Unit) {
    if (unit === profile.unit) return;
    const switched = await applyUnitDefaults(getDb(), unit);
    await update({ ...profile, unit });
    setNote(switched
      ? `Weights now show in ${unit}, and equipment steps use ${unit === 'lb' ? '5 lb plates and dumbbells' : 'the standard kg steps'}.`
      : `Weights now show in ${unit}. Your own equipment steps were kept: check them under Equipment.`);
  }

  async function toggleGoal(goal: Goal) {
    const goals = profile.goals.includes(goal) ? profile.goals.filter((g) => g !== goal) : [...profile.goals, goal];
    await update({ ...profile, goals });
  }

  return (
    <div className="form">
      <fieldset className="field">
        <legend>Weight unit</legend>
        <div className="segmented">
          {(['kg', 'lb'] as Unit[]).map((u) => (
            <button key={u} type="button" className={profile.unit === u ? '' : 'secondary'} aria-pressed={profile.unit === u} onClick={() => void setUnit(u)}>
              {u}
            </button>
          ))}
        </div>
        <span className="muted small">Everything is stored precisely, so switching back and forth changes nothing in your history.</span>
      </fieldset>
      {note && <p className="notice ok small">{note}</p>}
      <fieldset className="field">
        <legend>Your goals</legend>
        {GOALS.map((g) => (
          <label key={g.id} className="flag goal">
            <input type="checkbox" checked={profile.goals.includes(g.id)} onChange={() => void toggleGoal(g.id)} />
            <span>
              {g.label}
              {g.help && <span className="muted small"> · {g.help}</span>}
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
