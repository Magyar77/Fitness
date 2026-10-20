import { useEffect, useState } from 'react';
import { getDb } from '../../data/db';
import { getEquipment, markEquipmentCustomized, saveEquipment, settingsFrom, type EquipmentSettings } from '../../data/equipment';
import { assistedLadderFrom } from '../../engine/library/equipment';
import { NumberField } from '../logger/NumberField';
import { useUnit } from '../profile';
import { fromDisplay, toDisplay } from '../../engine/units';

/** Your gym's increments: what "one step heavier" means for each kind of equipment. */
export function EquipmentForm() {
  const db = getDb();
  const unit = useUnit();
  const [s, setS] = useState<EquipmentSettings | null>(null);
  const [pinsText, setPinsText] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void getEquipment(db).then((eq) => {
      if (!alive) return;
      const loaded = settingsFrom(eq);
      setS(loaded);
      setPinsText(loaded.assistPins.map((p) => toDisplay(p, unit)).join(', '));
    });
    return () => {
      alive = false;
    };
  }, [db, unit]);

  if (!s) return <p className="muted">Loading…</p>;
  const pins = pinsText.split(/[,;\s]+/).filter(Boolean).map((p) => fromDisplay(Number(p.replace(',', '.')), unit));
  // Show and edit in the profile unit; settings are kept in kg.
  const view = (kg: number | null) => (kg === null ? null : toDisplay(kg, unit));
  const keep = (v: number | null) => (v === null ? null : fromDisplay(v, unit));
  const ladder = pins.every((p) => Number.isFinite(p)) ? assistedLadderFrom(pins, s.assistLever) : [];

  async function save() {
    if (!pins.every((p) => Number.isFinite(p))) return setMessage({ kind: 'error', text: 'Pins must be numbers separated by commas, e.g. 6.8, 13.6, 20.4.' });
    const problems = await saveEquipment(db, { ...s!, assistPins: pins });
    if (!problems.length) await markEquipmentCustomized(db);
    setMessage(problems.length ? { kind: 'error', text: problems.join('\n') } : { kind: 'ok', text: 'Equipment saved. New recommendations use these steps.' });
  }

  return (
    <div className="form">
      <p className="muted small">What "one step" means at your gym. Changes apply to future recommendations only.</p>
      <label className="field">
        <span>Assisted machine pins ({unit} of help, comma-separated)</span>
        <input type="text" inputMode="decimal" value={pinsText} onChange={(e) => setPinsText(e.target.value)} />
      </label>
      <div className="set-row">
        <NumberField label={`add-on lever ${unit} (empty = none)`} value={view(s.assistLever)} onCommit={(v) => setS({ ...s, assistLever: keep(v) })} />
      </div>
      {ladder.length > 0 && <p className="muted small">Assistance steps: {ladder.map((v) => toDisplay(v, unit)).join(' · ')} {unit}</p>}
      <div className="set-row">
        <NumberField label={`barbell step ${unit}`} value={view(s.barbellStep)} onCommit={(v) => setS({ ...s, barbellStep: keep(v) ?? 0 })} />
        <NumberField label={`leg press step ${unit}`} value={view(s.legPressStep)} onCommit={(v) => setS({ ...s, legPressStep: keep(v) ?? 0 })} />
        <NumberField label={`dumbbell step ${unit}`} value={view(s.dumbbellStep)} onCommit={(v) => setS({ ...s, dumbbellStep: keep(v) ?? 0 })} />
      </div>
      <div className="set-row">
        <NumberField label={`cable step ${unit} (empty = unknown)`} value={view(s.cableStep)} onCommit={(v) => setS({ ...s, cableStep: keep(v) })} />
        <NumberField label={`machine step ${unit} (empty = unknown)`} value={view(s.machineStep)} onCommit={(v) => setS({ ...s, machineStep: keep(v) })} />
      </div>
      {message && <p className={`notice ${message.kind}`}>{message.text}</p>}
      <button type="button" onClick={() => void save()}>Save equipment</button>
    </div>
  );
}
