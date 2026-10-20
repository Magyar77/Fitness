import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDb } from '../../data/db';
import { BACKUP_FORMAT, importBundle, restoreBackup } from '../../data/backup';
import { applyUnitDefaults } from '../../data/equipment';
import { GOALS, type Goal } from '../../data/profile';
import { chooseProgram, createOwnProgram, readyMade } from '../../data/programs';
import type { DataBundle } from '../../engine/model';
import { STANDARD_BAR_KG, STANDARD_BAR_LB_IN_KG, type Unit } from '../../engine/units';
import { today } from '../dates';
import { useProfile } from '../profile';

type Step = 'start' | 'goals' | 'unit' | 'program';
type Choice = { kind: 'program'; id: string } | { kind: 'own' } | { kind: 'none' };

export function WelcomeScreen() {
  const db = getDb();
  const navigate = useNavigate();
  const { profile, update, reload } = useProfile();
  const [step, setStep] = useState<Step>('start');
  const [goals, setGoals] = useState<Goal[]>(profile.goals);
  const [unit, setUnit] = useState<Unit>(profile.unit);
  const [countBar, setCountBar] = useState(true);
  const [imported, setImported] = useState<{ programId: string | null; text: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setBusy(true);
    setMessage(null);
    try {
      const raw = JSON.parse(await f.text()) as { format?: string };
      if (raw.format === BACKUP_FORMAT) {
        const r = await restoreBackup(db, raw);
        if (!r.ok) return setMessage(`That backup can't be used:\n${r.problems.slice(0, 5).join('\n')}`);
        await reload(); // a backup from a set-up phone brings its own profile and opens the app
        setImported({ programId: null, text: `Restored ${f.name}.` });
        setStep('goals');
        return;
      }
      const r = await importBundle(db, raw);
      if (!r.ok) return setMessage(`That file can't be imported:\n${r.problems.slice(0, 5).join('\n')}`);
      const programId = (raw as DataBundle).sessions.find((s) => s.programVersionId)?.programVersionId ?? null;
      if (programId) await chooseProgram(db, programId);
      setImported({ programId, text: `Imported ${r.report.added.sessions ?? 0} workouts and ${r.report.added.bodyWeights ?? 0} body-weight entries.` });
      setStep('goals');
    } catch {
      setMessage(`${f.name} is not a valid data file. Nothing was changed.`);
    } finally {
      setBusy(false);
    }
  }

  async function finish(choice: Choice) {
    setBusy(true);
    try {
      if (choice.kind === 'program') await chooseProgram(db, choice.id);
      if (choice.kind === 'none') await chooseProgram(db, 'none');
      if (choice.kind === 'own') await createOwnProgram(db, today());
      if (unit === 'lb') await applyUnitDefaults(db, 'lb');
      await update({ onboarded: true, unit, goals, barKg: countBar ? (unit === 'lb' ? STANDARD_BAR_LB_IN_KG : STANDARD_BAR_KG) : null });
      navigate(choice.kind === 'own' ? '/log' : '/today', { replace: true });
    } finally {
      setBusy(false);
    }
  }

  const toggle = (g: Goal) => setGoals(goals.includes(g) ? goals.filter((x) => x !== g) : [...goals, g]);

  return (
    <section className="screen welcome">
      {step === 'start' && (
        <>
          <h1>Welcome</h1>
          <p className="lead">Plan your week, log every set, and get told when it's time to go heavier, with the reason spelled out.</p>
          <div className="card">
            <h2>New here?</h2>
            <p className="muted">Three quick questions: your goals, kg or lb, and how you want to train.</p>
            <button type="button" onClick={() => setStep('goals')}>Get started</button>
          </div>
          <div className="card">
            <h2>Moving from another phone?</h2>
            <p className="muted">Load a backup or a data file. Your history, targets and program come with it.</p>
            <button type="button" className="secondary" disabled={busy} onClick={() => file.current?.click()}>Load backup or data file…</button>
            <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e)} />
          </div>
          {message && <p className="notice error">{message}</p>}
          <p className="muted small">Your data stays on this phone. No account, no tracking.</p>
        </>
      )}

      {step === 'goals' && (
        <>
          {imported && <p className="notice ok">{imported.text}</p>}
          <h1>Your goals</h1>
          <p className="muted">Pick what matters to you, most important first. You can change this later under More.</p>
          <div className="card">
            {GOALS.map((g) => (
              <label key={g.id} className="flag goal">
                <input type="checkbox" checked={goals.includes(g.id)} onChange={() => toggle(g.id)} />
                <span>
                  {g.label}
                  {goals.includes(g.id) && <span className="badge">#{goals.indexOf(g.id) + 1}</span>}
                  {g.help && <span className="muted small"> · {g.help}</span>}
                </span>
              </label>
            ))}
          </div>
          <div className="buttons">
            <button type="button" onClick={() => setStep('unit')}>Next</button>
          </div>
        </>
      )}

      {step === 'unit' && (
        <>
          <h1>kg or lb?</h1>
          <p className="muted">How you read the plates at your gym. Switch any time under More.</p>
          <div className="card">
            <div className="segmented">
              {(['kg', 'lb'] as Unit[]).map((u) => (
                <button key={u} type="button" className={unit === u ? '' : 'secondary'} aria-pressed={unit === u} onClick={() => setUnit(u)}>{u}</button>
              ))}
            </div>
          </div>
          <div className="card">
            <h2>Barbell weights</h2>
            <p className="muted small">When you load a barbell, do you count the bar? (Most people do: 2 × 20 kg plates on a 20 kg bar = 60 kg.)</p>
            <div className="segmented">
              <button type="button" className={countBar ? '' : 'secondary'} aria-pressed={countBar} onClick={() => setCountBar(true)}>Count the bar</button>
              <button type="button" className={countBar ? 'secondary' : ''} aria-pressed={!countBar} onClick={() => setCountBar(false)}>Plates only</button>
            </div>
          </div>
          <div className="buttons">
            <button type="button" onClick={() => (imported?.programId ? void finish({ kind: 'program', id: imported.programId }) : setStep('program'))}>
              {imported?.programId ? 'Finish' : 'Next'}
            </button>
            <button type="button" className="link" onClick={() => setStep('goals')}>Back</button>
          </div>
        </>
      )}

      {step === 'program' && (
        <>
          <h1>How do you want to train?</h1>
          <p className="muted">Pick a ready-made program (you can edit it later), build your own, or just log workouts.</p>
          {readyMade().map((p) => (
            <div className="card" key={p.id}>
              <h2>{p.label}</h2>
              <p className="muted">{p.about?.description}</p>
              <p className="small">{p.templates.map((t) => t.name).join(' · ')}</p>
              <button type="button" disabled={busy} onClick={() => void finish({ kind: 'program', id: p.id })}>Use this program</button>
            </div>
          ))}
          <div className="card">
            <h2>Build my own program</h2>
            <p className="muted">Create your weekly workouts yourself; the app schedules them and progresses them the same way.</p>
            <button type="button" className="secondary" disabled={busy} onClick={() => void finish({ kind: 'own' })}>Build my own</button>
          </div>
          <div className="card">
            <h2>Just log my workouts</h2>
            <p className="muted">No program: create workouts whenever you like and track them.</p>
            <button type="button" className="secondary" disabled={busy} onClick={() => void finish({ kind: 'none' })}>Just log</button>
          </div>
          <button type="button" className="link" onClick={() => setStep('unit')}>Back</button>
        </>
      )}
    </section>
  );
}
