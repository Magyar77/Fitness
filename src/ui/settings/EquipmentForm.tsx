import { useEffect, useState } from 'react';
import { getDb } from '../../data/db';
import { getEquipment, saveEquipment, settingsFrom, type EquipmentSettings } from '../../data/equipment';
import { assistedLadderFrom } from '../../engine/library/equipment';
import { NumberField } from '../logger/NumberField';

/** Your gym's increments: what "one step heavier" means for each kind of equipment. */
export function EquipmentForm() {
  const db = getDb();
  const [s, setS] = useState<EquipmentSettings | null>(null);
  const [pinsText, setPinsText] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    void getEquipment(db).then((eq) => {
      if (!alive) return;
      const loaded = settingsFrom(eq);
      setS(loaded);
      setPinsText(loaded.assistPins.join(', '));
    });
    return () => {
      alive = false;
    };
  }, [db]);

  if (!s) return <p className="muted">Loading…</p>;
  const pins = pinsText.split(/[,;\s]+/).filter(Boolean).map((p) => Number(p.replace(',', '.')));
  const ladder = pins.every((p) => Number.isFinite(p)) ? assistedLadderFrom(pins, s.assistLever) : [];

  async function save() {
    if (!pins.every((p) => Number.isFinite(p))) return setMessage({ kind: 'error', text: 'Pins must be numbers separated by commas, e.g. 6.8, 13.6, 20.4.' });
    const problems = await saveEquipment(db, { ...s!, assistPins: pins });
    setMessage(problems.length ? { kind: 'error', text: problems.join('\n') } : { kind: 'ok', text: 'Equipment saved. New recommendations use these steps.' });
  }

  return (
    <div className="form">
      <p className="muted small">What "one step" means at your gym. Changes apply to future recommendations only.</p>
      <label className="field">
        <span>Assisted machine pins (kg of help, comma-separated)</span>
        <input type="text" inputMode="decimal" value={pinsText} onChange={(e) => setPinsText(e.target.value)} />
      </label>
      <div className="set-row">
        <NumberField label="add-on lever kg (empty = none)" value={s.assistLever} onCommit={(v) => setS({ ...s, assistLever: v })} />
      </div>
      {ladder.length > 0 && <p className="muted small">Assistance steps: {ladder.join(' · ')} kg</p>}
      <div className="set-row">
        <NumberField label="barbell step kg" value={s.barbellStep} onCommit={(v) => setS({ ...s, barbellStep: v ?? 0 })} />
        <NumberField label="leg press step kg" value={s.legPressStep} onCommit={(v) => setS({ ...s, legPressStep: v ?? 0 })} />
        <NumberField label="dumbbell step kg" value={s.dumbbellStep} onCommit={(v) => setS({ ...s, dumbbellStep: v ?? 0 })} />
      </div>
      <div className="set-row">
        <NumberField label="cable step kg (empty = unknown)" value={s.cableStep} onCommit={(v) => setS({ ...s, cableStep: v })} />
        <NumberField label="machine step kg (empty = unknown)" value={s.machineStep} onCommit={(v) => setS({ ...s, machineStep: v })} />
      </div>
      {message && <p className={`notice ${message.kind}`}>{message.text}</p>}
      <button type="button" onClick={() => void save()}>Save equipment</button>
    </div>
  );
}
