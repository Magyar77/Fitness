// Shorthand for writing logged sets by hand (seed files, fixtures).

import type { DataQuality, DropSegment, SetLog, Side } from '../model';

export interface CompactSet {
  w?: number | null; // weightKg
  a?: number | null; // assistKg
  r?: number | null; // reps
  t?: number | null; // durationSec
  d?: number | null; // distanceM
  rir?: number | [number, number] | null;
  q?: DataQuality;
  side?: Side;
  tempo?: boolean | null;
  pause?: boolean | null;
  ok?: boolean | null; // techniqueOk
  drops?: DropSegment[];
  note?: string;
}

/** Expands compact rows into SetLogs; `common` fills fields every row shares. */
export function logSets(
  sessionId: string,
  slotKey: string | null,
  exerciseId: string,
  rows: CompactSet[],
  common: CompactSet = {},
): SetLog[] {
  return rows.map((row, i) => {
    const c = { ...common, ...row };
    const set: SetLog = {
      id: `${sessionId}:${slotKey ?? exerciseId}:${i + 1}`,
      sessionId,
      slotKey,
      exerciseId,
      setIndex: i + 1,
      side: c.side ?? 'both',
      completed: true,
      techniqueOk: c.ok === undefined ? true : c.ok,
      isWarmup: false,
      quality: c.q ?? 'confirmed',
    };
    if (c.w !== undefined) set.weightKg = c.w;
    if (c.a !== undefined) set.assistKg = c.a;
    if (c.r !== undefined) set.reps = c.r;
    if (c.t !== undefined) set.durationSec = c.t;
    if (c.d !== undefined) set.distanceM = c.d;
    if (c.rir !== undefined) {
      set.rir = c.rir === null ? null : typeof c.rir === 'number' ? { min: c.rir, max: c.rir } : { min: c.rir[0], max: c.rir[1] };
    }
    if (c.tempo !== undefined) set.tempoMet = c.tempo;
    if (c.pause !== undefined) set.pauseHeld = c.pause;
    if (c.drops) set.drops = c.drops;
    if (c.note) set.notes = c.note;
    return set;
  });
}

/** Same values repeated: times(3, { w: 20, r: 6 }) → three identical rows. */
export function times(n: number, row: CompactSet): CompactSet[] {
  return Array.from({ length: n }, () => ({ ...row }));
}
