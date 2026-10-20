import { useState } from 'react';
import { getDb } from '../../data/db';
import { applyUnitDefaults } from '../../data/equipment';
import { GOALS, type Goal } from '../../data/profile';
import { STANDARD_BAR_KG, STANDARD_BAR_LB_IN_KG, fromDisplay, toDisplay, type Unit } from '../../engine/units';
import { NumberField } from '../logger/NumberField';
import { useProfile } from '../profile';

/** Weight unit, barbell convention and goals. Saved as soon as something changes. */
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

  async function setBar(barKg: number | null) {
    await update({ ...profile, barKg });
    setNote(barKg === null
      ? 'Barbell weights now show plates only (bar not counted).'
      : `Barbell weights now include the bar. Your history is unchanged; it simply reads as totals.`);
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
      <fieldset className="field">
        <legend>Barbell weights</legend>
        <div className="segmented">
          <button type="button" className={profile.barKg !== null ? '' : 'secondary'} aria-pressed={profile.barKg !== null} onClick={() => void setBar(profile.barKg ?? (profile.unit === 'lb' ? STANDARD_BAR_LB_IN_KG : STANDARD_BAR_KG))}>Count the bar</button>
          <button type="button" className={profile.barKg === null ? '' : 'secondary'} aria-pressed={profile.barKg === null} onClick={() => void setBar(null)}>Plates only</button>
        </div>
        {profile.barKg !== null && (
          <div className="set-row">
            <NumberField key={profile.unit} label={`bar weight ${profile.unit}`} value={toDisplay(profile.barKg, profile.unit)} onCommit={(v) => { if (v !== null && v > 0 && v < 60) void update({ ...profile, barKg: fromDisplay(v, profile.unit) }); }} />
          </div>
        )}
        <span className="muted small">Leg press and EZ-bar curls are not affected.</span>
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
