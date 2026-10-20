import { useState } from 'react';
import { getDb } from '../../data/db';
import { deleteMeasurement, saveMeasurement } from '../../data/body';
import { formatMeasure, fromShown, measureChange, measuredKeys, measureSeries, measureUnit, MEASURES, toShown, type MeasureKey, type MeasurementEntry } from '../../engine/measurements';
import { LineChart } from '../charts/LineChart';
import { NumberField } from '../logger/NumberField';
import { niceDate, today } from '../dates';
import { useUnit } from '../profile';

const label = (k: MeasureKey) => MEASURES.find((m) => m.key === k)!.label;

export function MeasurementsSection({ entries, onChange }: { entries: MeasurementEntry[]; onChange: () => void }) {
  const db = getDb();
  const unit = useUnit();
  const keys = measuredKeys(entries);
  const [chosen, setChosen] = useState<MeasureKey | null>(null);
  const shown = chosen && keys.includes(chosen) ? chosen : keys[0] ?? null;
  const [date, setDate] = useState(today());
  const [values, setValues] = useState<Partial<Record<MeasureKey, number | null>>>({});
  const [notes, setNotes] = useState('');
  const [problems, setProblems] = useState<string[]>([]);
  const [formKey, setFormKey] = useState(0);
  const fmt = (k: MeasureKey, v: number) => formatMeasure(k, v, unit);

  async function save() {
    const stored = Object.fromEntries(
      Object.entries(values).filter(([, v]) => typeof v === 'number').map(([k, v]) => [k, fromShown(k as MeasureKey, v as number, unit)]),
    ) as MeasurementEntry['values'];
    const p = await saveMeasurement(db, { date, values: stored, notes }, today());
    setProblems(p);
    if (!p.length) {
      setValues({});
      setNotes('');
      setFormKey((k) => k + 1);
      onChange();
    }
  }

  return (
    <>
      {keys.length > 0 && (
        <div className="stats">
          {keys.slice(0, 4).map((k) => {
            const c = measureChange(entries, k)!;
            return (
              <button key={k} type="button" className={`stat ${shown === k ? 'chosen' : ''}`} onClick={() => setChosen(k)} aria-pressed={shown === k}>
                <span className="muted small">{label(k)}</span>
                <strong>{fmt(k, c.latest.value)}</strong>
                <span className="muted small">{c.change === 0 || c.first.date === c.latest.date ? niceDate(c.latest.date) : `${c.change > 0 ? '+' : '−'}${fmt(k, Math.abs(c.change))} since ${niceDate(c.first.date)}`}</span>
              </button>
            );
          })}
        </div>
      )}

      {shown && (
        <div className="card">
          {keys.length > 1 && (
            <div className="chip-row" role="group" aria-label="Measurement">
              {keys.map((k) => (
                <button key={k} type="button" className="secondary chip" aria-pressed={shown === k} onClick={() => setChosen(k)}>{label(k)}</button>
              ))}
            </div>
          )}
          <LineChart
            title={label(shown)}
            unit={measureUnit(shown, unit)}
            series={[{ name: label(shown), color: 'var(--series-1)', points: measureSeries(entries, shown).map((p) => ({ x: p.date, y: toShown(shown, p.value, unit), label: fmt(shown, p.value) })) }]}
          />
          {shown === 'waist' && <p className="muted small">Waist is the best tape measure for fat loss: if weight is flat but your waist is shrinking, it's working.</p>}
        </div>
      )}

      <div className="card form">
        <h2>Add measurements</h2>
        <p className="muted small">Fill in any you like. Measure in the morning, before eating, with the tape snug but not pressing.</p>
        <label className="field">
          <span>Date</span>
          <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <div className="measure-grid" key={formKey}>
          {MEASURES.map((m) => (
            <NumberField key={m.key} label={`${m.label} (${measureUnit(m.key, unit)})`} value={values[m.key] ?? null} onCommit={(v) => setValues({ ...values, [m.key]: v })} />
          ))}
        </div>
        <details>
          <summary>How to measure</summary>
          <ul>
            {MEASURES.map((m) => <li key={m.key}><strong>{m.label}:</strong> {m.how}</li>)}
          </ul>
        </details>
        <input className="note" type="text" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        {problems.length > 0 && <p className="notice error">{problems.join('\n')}</p>}
        <button type="button" onClick={() => void save()}>Save measurements</button>
      </div>

      {entries.length > 0 && (
        <div className="card">
          <h2>All measurements</h2>
          <ul className="history">
            {[...entries].reverse().map((e) => (
              <li key={e.date}>
                <div className="row">
                  <strong>{niceDate(e.date)}</strong>
                  <button type="button" className="link danger" onClick={() => { if (window.confirm(`Delete the measurements of ${niceDate(e.date)}?`)) void deleteMeasurement(db, e.date).then(onChange); }}>Delete</button>
                </div>
                <div className="small">
                  {MEASURES.filter((m) => typeof e.values[m.key] === 'number').map((m) => `${m.label} ${fmt(m.key, e.values[m.key]!)}`).join(' · ')}
                </div>
                {e.notes && <div className="muted small">{e.notes}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
