import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getDb } from '../../data/db';
import { backupReminder, checkBackup, importBundle, newerThanBackup, restoreBackup } from '../../data/backup';
import { photosInBackup, saveBackup, setPhotosInBackup } from '../backupActions';
import { photoStats } from '../../data/body';
import { measurementsCsv } from '../../data/csv';
import { EquipmentForm } from '../settings/EquipmentForm';
import { WorkoutAlertsForm } from '../settings/WorkoutAlertsForm';
import { InstallCard } from '../InstallCard';
import { ProfileForm } from '../settings/ProfileForm';
import { bodyWeightCsv, setsCsv } from '../../data/csv';
import { requestPersistence, storageStatus, type StorageStatus } from '../../data/storage';
import { downloadText } from '../download';
import { today } from '../dates';

interface Counts {
  sessions: number;
  sets: number;
  prescriptions: number;
  bodyWeights: number;
  weekPlans: number;
}

type Message = { kind: 'ok' | 'error'; text: string } | null;

function count(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function mb(bytes: number | null): string {
  return bytes === null ? '?' : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MoreScreen() {
  const db = getDb();
  const [status, setStatus] = useState<StorageStatus | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0); // bump to reload counts after a change
  const [reminder, setReminder] = useState<{ due: boolean; text: string } | null>(null);
  const [photos, setPhotos] = useState<{ count: number; bytes: number }>({ count: 0, bytes: 0 });
  const [withPhotos, setWithPhotos] = useState(photosInBackup);
  const restoreInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      storageStatus(),
      db.sessions.count(),
      db.sets.count(),
      db.prescriptions.count(),
      db.bodyWeights.count(),
      db.weekPlans.count(),
      backupReminder(db),
      photoStats(db),
    ]).then(([s, sessions, sets, prescriptions, bodyWeights, weekPlans, r, ph]) => {
      if (!alive) return;
      setReminder(r);
      setPhotos(ph);
      setStatus(s);
      setCounts({ sessions, sets, prescriptions, bodyWeights, weekPlans });
    });
    return () => {
      alive = false;
    };
  }, [db, version]);

  async function run(task: () => Promise<Message>) {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await task());
    } catch (e) {
      setMessage({ kind: 'error', text: `Something went wrong: ${(e as Error).message}` });
    } finally {
      setBusy(false);
      setVersion((v) => v + 1);
    }
  }

  const exportJson = (how: 'share' | 'download') => run(async () => ({ kind: 'ok', text: (await saveBackup(db, how, { photos: withPhotos })).text }));

  const exportCsv = () =>
    run(async () => {
      const [sessions, sets, weights, custom, measurements] = await Promise.all([db.sessions.toArray(), db.sets.toArray(), db.bodyWeights.toArray(), db.exercises.toArray(), db.measurements.toArray()]);
      downloadText(`fitness-sets-${today()}.csv`, setsCsv(sessions, sets, new Map(custom.map((e) => [e.id, e.name]))), 'text/csv');
      downloadText(`fitness-bodyweight-${today()}.csv`, bodyWeightCsv(weights), 'text/csv');
      if (measurements.length) downloadText(`fitness-measurements-${today()}.csv`, measurementsCsv(measurements), 'text/csv');
      return { kind: 'ok', text: measurements.length ? 'Three CSV files saved: sets, body weight and measurements.' : 'Two CSV files saved: sets and body weight.' };
    });

  async function onFile(e: React.ChangeEvent<HTMLInputElement>, mode: 'restore' | 'import') {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    await run(async () => {
      let raw: unknown;
      try {
        raw = JSON.parse(await file.text());
      } catch {
        return { kind: 'error', text: `${file.name} is not a valid JSON file. Nothing was changed.` };
      }
      if (mode === 'restore') {
        const { file: backup, problems } = checkBackup(raw);
        if (!backup) return { kind: 'error', text: `Backup rejected, nothing was changed:\n${problems.slice(0, 8).join('\n')}` };
        const sessions = backup.tables.sessions.length;
        const newer = await newerThanBackup(db, backup);
        const lose = newer ? `\n\nCareful: this phone has ${count(newer, 'workout')} newer than this backup. They would be lost. Save a backup first if unsure.` : '';
        if (!window.confirm(`Replace ALL data on this device with this backup (${count(sessions, 'workout')}, exported ${backup.exportedAt.slice(0, 10)})?${lose}`)) {
          return { kind: 'ok', text: 'Restore cancelled. Nothing was changed.' };
        }
        const r = await restoreBackup(db, raw);
        return r.ok
          ? { kind: 'ok', text: `Restored from ${file.name}.` }
          : { kind: 'error', text: `Backup rejected, nothing was changed:\n${r.problems.slice(0, 8).join('\n')}` };
      }
      const r = await importBundle(db, raw);
      if (!r.ok) return { kind: 'error', text: `Import rejected, nothing was changed:\n${r.problems.slice(0, 8).join('\n')}` };
      const { added, skipped } = r.report;
      const total = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
      return {
        kind: 'ok',
        text: `Imported ${count(added.sessions ?? 0, 'workout')}, ${count(added.sets ?? 0, 'set')}, ${count(added.prescriptions ?? 0, 'target')}, ${count(added.bodyWeights ?? 0, 'body weight')}.${total(skipped) ? ` ${count(total(skipped), 'record')} already here ${total(skipped) === 1 ? 'was' : 'were'} left unchanged.` : ''}`,
      };
    });
  }

  const persist = () =>
    run(async () => {
      const granted = await requestPersistence();
      return granted
        ? { kind: 'ok', text: 'Storage is now persistent.' }
        : { kind: 'error', text: 'The browser declined for now. Installing the app to the home screen usually allows it. Keep regular backups either way.' };
    });

  return (
    <section className="screen">
      <h1>More</h1>

      {message && <p className={`notice ${message.kind}`} role="status">{message.text}</p>}

      <div className="card">
        <h2>You</h2>
        <ProfileForm />
      </div>

      <div className="card">
        <h2>Install on this phone</h2>
        <InstallCard />
      </div>

      <div className="card">
        <h2>Data on this device</h2>
        {counts ? (
          <p className="muted">
            {count(counts.sessions, 'workout')} · {count(counts.sets, 'set')} · {count(counts.prescriptions, 'target')} · {count(counts.bodyWeights, 'body weight')} · {count(counts.weekPlans, 'week plan')}
          </p>
        ) : (
          <p className="muted">Loading…</p>
        )}
        {status && (
          <p className="muted">
            Storage: {status.supported ? (status.persisted ? 'persistent ✓' : 'not persistent: the browser may clear it if space runs low') : 'status unavailable'}
            {status.usageBytes !== null && ` · ${mb(status.usageBytes)} used`}
          </p>
        )}
        {status?.supported && !status.persisted && (
          <button type="button" onClick={persist} disabled={busy}>
            Make storage persistent
          </button>
        )}
      </div>

      <div className="card">
        <h2>Backup</h2>
        <p className="muted">Your data lives only on this phone. Save a backup regularly: the share menu lets you put it straight into Google Drive, Files or iCloud, or email it to yourself.</p>
        {reminder?.text && <p className={reminder.due ? 'notice warn small' : 'muted small'}>{reminder.text}</p>}
        <div className="buttons">
          <button type="button" onClick={() => exportJson('share')} disabled={busy}>Save backup…</button>
          <button type="button" className="link" onClick={() => exportJson('download')} disabled={busy}>Download instead</button>
          <button type="button" className="secondary" onClick={() => restoreInput.current?.click()} disabled={busy}>Restore backup…</button>
        </div>
        <input ref={restoreInput} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e, 'restore')} />
        {photos.count > 0 && (
          <label className="flag goal">
            <input type="checkbox" checked={withPhotos} onChange={(e) => { setWithPhotos(e.target.checked); setPhotosInBackup(e.target.checked); }} />
            <span>
              Include progress photos <span className="muted small">({photos.count} photo{photos.count === 1 ? '' : 's'}, about {Math.max(0.1, Math.round((photos.bytes * 1.37) / 104857.6) / 10)} MB in the file). Without them, restoring keeps the photos already on the phone.</span>
            </span>
          </label>
        )}
      </div>

      <div className="card">
        <h2>Bring in your training history</h2>
        <p className="muted">From Strong, Hevy, a spreadsheet, or anything else via an AI chat. Existing records are never overwritten.</p>
        <div className="buttons">
          <Link to="/import" className="button-link primary">Import workouts</Link>
          <button type="button" className="secondary" onClick={() => importInput.current?.click()} disabled={busy}>Personal Fitness data file…</button>
        </div>
        <input ref={importInput} type="file" accept="application/json,.json" hidden onChange={(e) => void onFile(e, 'import')} />
      </div>

      <div className="card">
        <h2>During workouts</h2>
        <WorkoutAlertsForm />
      </div>

      <div className="card">
        <h2>Equipment</h2>
        <EquipmentForm />
      </div>

      <div className="card">
        <h2>Export for spreadsheets</h2>
        <button type="button" className="secondary" onClick={exportCsv} disabled={busy}>Export CSV</button>
      </div>
    </section>
  );
}
