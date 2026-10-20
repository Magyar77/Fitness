import { useEffect, useMemo, useRef, useState } from 'react';
import { getDb } from '../../data/db';
import { addPhoto, deletePhoto, listPhotos } from '../../data/body';
import type { PhotoPose, ProgressPhoto } from '../../engine/model';
import { niceDate, today } from '../dates';
import { compressPhoto } from './compress';

const POSES: { id: PhotoPose; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'side', label: 'Side' },
  { id: 'back', label: 'Back' },
];
const poseLabel = (p: PhotoPose) => POSES.find((x) => x.id === p)?.label ?? 'Other';

/** Object URLs for photos, revoked when the list changes or the view closes. */
function useUrls(photos: ProgressPhoto[]): Map<string, string> {
  const urls = useMemo(() => new Map(photos.map((p) => [p.id, URL.createObjectURL(new Blob([p.bytes], { type: p.mime }))])), [photos]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  return urls;
}

export function PhotosSection() {
  const db = getDb();
  const [photos, setPhotos] = useState<ProgressPhoto[] | null>(null);
  const [version, setVersion] = useState(0);
  const [date, setDate] = useState(today());
  const [pose, setPose] = useState<PhotoPose>('front');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<ProgressPhoto | null>(null);
  const [compare, setCompare] = useState<{ pose: PhotoPose; before: string; after: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    void listPhotos(db).then((p) => alive && setPhotos(p));
    return () => {
      alive = false;
    };
  }, [db, version]);

  const urls = useUrls(photos ?? []);
  if (!photos) return <p className="muted">Loading…</p>;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const small = await compressPhoto(file);
      const r = await addPhoto(db, { ...small, date, pose }, today());
      if (!r.ok) setProblem(r.problems.join('\n'));
      else setVersion((v) => v + 1);
    } catch {
      setProblem('That photo could not be read. Try a JPEG or PNG.');
    } finally {
      setBusy(false);
    }
  }

  async function remove(p: ProgressPhoto) {
    if (!window.confirm(`Delete this ${poseLabel(p.pose).toLowerCase()} photo from ${niceDate(p.date)}? This can't be undone.`)) return;
    await deletePhoto(db, p.id);
    setOpen(null);
    setVersion((v) => v + 1);
  }

  const dates = [...new Set(photos.map((p) => p.date))];
  const posesWithTwo = POSES.filter((x) => new Set(photos.filter((p) => p.pose === x.id).map((p) => p.date)).size >= 2);
  const startCompare = (pp: PhotoPose) => {
    const ds = [...new Set(photos.filter((p) => p.pose === pp).map((p) => p.date))].sort();
    setCompare({ pose: pp, before: ds[0]!, after: ds.at(-1)! });
  };
  const pick = (pp: PhotoPose, d: string) => photos.find((p) => p.pose === pp && p.date === d);

  return (
    <>
      <div className="card form">
        <h2>Add a progress photo</h2>
        <p className="muted small">Same spot, same light, same time of day, every 2–4 weeks. Photos stay on this phone; they go into your backup file unless you turn that off under More.</p>
        <div className="set-row">
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        <div className="segmented">
          {POSES.map((x) => (
            <button key={x.id} type="button" className={pose === x.id ? '' : 'secondary'} aria-pressed={pose === x.id} onClick={() => setPose(x.id)}>{x.label}</button>
          ))}
        </div>
        <button type="button" className="wide add-photo" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Saving…' : 'Take or choose a photo'}</button>
        <input ref={input} type="file" accept="image/*" hidden onChange={(e) => void onFile(e)} />
        {problem && <p className="notice error">{problem}</p>}
      </div>

      {posesWithTwo.length > 0 && (
        <div className="card">
          <h2>Compare</h2>
          {!compare ? (
            <div className="buttons">
              {posesWithTwo.map((x) => <button key={x.id} type="button" className="secondary" onClick={() => startCompare(x.id)}>{x.label}</button>)}
            </div>
          ) : (
            <>
              <div className="compare">
                {(['before', 'after'] as const).map((side) => {
                  const ds = [...new Set(photos.filter((p) => p.pose === compare.pose).map((p) => p.date))].sort();
                  const p = pick(compare.pose, compare[side]);
                  return (
                    <figure key={side}>
                      {p && <img src={urls.get(p.id)} alt={`${poseLabel(p.pose)}, ${niceDate(p.date)}`} />}
                      <select aria-label={side === 'before' ? 'Before' : 'After'} value={compare[side]} onChange={(e) => setCompare({ ...compare, [side]: e.target.value })}>
                        {ds.map((d) => <option key={d} value={d}>{niceDate(d)}</option>)}
                      </select>
                    </figure>
                  );
                })}
              </div>
              <button type="button" className="link" onClick={() => setCompare(null)}>Close</button>
            </>
          )}
        </div>
      )}

      {open && (
        <div className="card photo-view">
          <img src={urls.get(open.id)} alt={`${poseLabel(open.pose)}, ${niceDate(open.date)}`} />
          <div className="row">
            <span>{niceDate(open.date)} · {poseLabel(open.pose)}</span>
            <span className="buttons">
              <button type="button" className="link danger" onClick={() => void remove(open)}>Delete</button>
              <button type="button" className="link" onClick={() => setOpen(null)}>Close</button>
            </span>
          </div>
        </div>
      )}

      {dates.length === 0 ? (
        <div className="card"><p className="muted">No photos yet. They are the clearest way to see change that the scale misses.</p></div>
      ) : (
        dates.map((d) => (
          <div key={d} className="card">
            <h2>{niceDate(d)}</h2>
            <div className="thumbs">
              {photos.filter((p) => p.date === d).map((p) => (
                <button key={p.id} type="button" className="thumb" onClick={() => setOpen(p)} aria-label={`Open ${poseLabel(p.pose)} photo from ${niceDate(d)}`}>
                  <img src={urls.get(p.id)} alt="" loading="lazy" />
                  <span>{poseLabel(p.pose)}</span>
                </button>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}
