import { useState } from 'react';
import type { Exercise, TemplateSlot } from '../../engine/model';
import type { DecisionRecord, TargetDraft } from '../../engine/progression';
import { NumberField } from './NumberField';
import { useUnit } from '../profile';
import { formatLoad, fromDisplay, toDisplay } from '../../engine/units';

const OUTCOME: Record<DecisionRecord['outcome'], { icon: string; label: string; cls: string }> = {
  increase: { icon: '↑', label: 'Progress', cls: 'up' },
  hold: { icon: '=', label: 'Keep', cls: 'hold' },
  decrease: { icon: '↓', label: 'Lighter', cls: 'down' },
  milestone: { icon: '★', label: 'Milestone', cls: 'milestone' },
  blocked: { icon: '!', label: 'Review', cls: 'blocked' },
  none: { icon: '·', label: 'No change', cls: 'hold' },
};

function statusText(d: DecisionRecord): string {
  switch (d.status) {
    case 'auto_applied':
      return d.prescriptionId ? 'Applied automatically' : 'No change needed';
    case 'pending':
      return 'Needs your OK';
    case 'accepted':
      return 'Accepted';
    case 'rejected':
      return 'Rejected: target unchanged';
    case 'overridden':
      return 'Your override';
    case 'undone':
      return 'Undone: previous target restored';
  }
}

interface Props {
  decision: DecisionRecord;
  slot: TemplateSlot | undefined;
  exercise: Exercise | undefined;
  onAccept: () => void;
  onReject: () => void;
  onOverride: (draft: TargetDraft) => void;
  onUndo: () => void;
}

export function DecisionCard({ decision: d, slot, exercise, onAccept, onReject, onOverride, onUndo }: Props) {
  const [editing, setEditing] = useState(false);
  const o = OUTCOME[d.outcome];
  const shown = d.status === 'overridden' && d.override ? d.override : d.next;
  const canUndo = (d.status === 'auto_applied' && !!d.prescriptionId) || d.status === 'accepted' || d.status === 'overridden';

  return (
    <div className={`decision ${o.cls} ${d.status === 'pending' ? 'pending' : ''}`}>
      <div className="decision-head">
        <span className={`outcome ${o.cls}`} aria-label={o.label}>{o.icon}</span>
        <strong>{slot?.name ?? d.slotKey}</strong>
        <span className="status">{statusText(d)}</span>
      </div>
      <p>{d.explanation}</p>
      {shown && (d.status === 'undone' || d.status === 'rejected' ? (
        <p className="muted small">Proposed, not applied: {shown.text}</p>
      ) : (
        <p className="next">{d.status === 'pending' ? 'Proposed' : 'Next time'}: <strong>{shown.text}</strong></p>
      ))}

      {editing ? (
        <OverrideForm decision={d} slot={slot} exercise={exercise} onCancel={() => setEditing(false)} onSave={(draft) => { onOverride(draft); setEditing(false); }} />
      ) : (
        <div className="buttons">
          {d.status === 'pending' && d.next && <button type="button" onClick={onAccept}>Accept</button>}
          {d.status === 'pending' && <button type="button" className="secondary" onClick={onReject}>{d.next ? 'Reject' : 'Noted'}</button>}
          {d.status !== 'rejected' && d.status !== 'undone' && <button type="button" className="link" onClick={() => setEditing(true)}>Set my own target</button>}
          {canUndo && <button type="button" className="link" onClick={onUndo}>Undo</button>}
        </div>
      )}
    </div>
  );
}

function OverrideForm({ decision: d, slot, exercise, onSave, onCancel }: { decision: DecisionRecord; slot: TemplateSlot | undefined; exercise: Exercise | undefined; onSave: (t: TargetDraft) => void; onCancel: () => void }) {
  const unit = useUnit();
  const base: Partial<TargetDraft> = d.next ?? {};
  const assisted = exercise?.loadType === 'assisted_machine';
  const weighted = !!exercise && !assisted && !['bodyweight', 'cardio'].includes(exercise.loadType);
  const timed = exercise?.measure === 'time';
  const distance = exercise?.measure === 'distance';
  const reps = exercise?.measure === 'reps';
  const sets = slot?.sets ?? 1;

  const startKg = assisted ? base.assistKg : base.loadKg;
  const [load, setLoad] = useState<number | null>(typeof startKg === 'number' ? toDisplay(startKg, unit) : null);
  const [repCount, setRepCount] = useState<number | null>(base.repTargets?.[0] ?? null);
  const [seconds, setSeconds] = useState<number | null>(base.timeSec ?? null);
  const [metres, setMetres] = useState<number | null>(base.distanceM ?? null);

  function save() {
    const draft: TargetDraft = { text: '' };
    const parts: string[] = [];
    if ((weighted || assisted) && load !== null) {
      const kg = fromDisplay(load, unit);
      if (assisted) draft.assistKg = kg;
      else draft.loadKg = kg;
      parts.push(`${formatLoad(kg, unit)}${assisted ? ' assist' : ''}`);
    }
    if (reps && repCount !== null) {
      draft.repTargets = Array(sets).fill(repCount);
      parts.push(`${sets} × ${repCount}`);
    }
    if (timed && seconds !== null) {
      draft.timeSec = seconds;
      parts.push(`${seconds} s`);
    }
    if (distance && metres !== null) {
      draft.distanceM = metres;
      parts.push(`${sets} × ${metres} m`);
    }
    if (!parts.length) return;
    draft.text = `${parts.join(', ')} (your target)`;
    onSave(draft);
  }

  return (
    <div className="override">
      <div className="set-row">
        {(weighted || assisted) && <NumberField label={assisted ? `assist ${unit}` : unit} value={load} onCommit={setLoad} />}
        {reps && <NumberField label="reps per set" integer value={repCount} onCommit={setRepCount} />}
        {timed && <NumberField label="seconds" integer value={seconds} onCommit={setSeconds} />}
        {distance && <NumberField label="metres" value={metres} onCommit={setMetres} />}
      </div>
      <div className="buttons">
        <button type="button" onClick={save}>Save target</button>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
