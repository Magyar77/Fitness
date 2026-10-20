// How long a workout takes: an estimate from its sets, reps and rests, and the actual
// time of finished sessions. Deterministic and deliberately simple.

import type { TemplateSlot, WorkoutSession, WorkoutTemplate } from './model';

const WARM_UP_SEC = 5 * 60;
const BETWEEN_EXERCISES_SEC = 90; // walk to and set up the next station
const SEC_PER_REP = 3.5;
const SET_SETUP_SEC = 25;
const SUPERSET_SWITCH_SEC = 15;

const avg = (a: number, b: number) => (a + b) / 2;

/** Seconds of work in one set (both sides for one-sided exercises). */
function workSec(slot: TemplateSlot): number {
  const sides = slot.perSide ? 2 : 1;
  const t = slot.target;
  switch (t.kind) {
    case 'reps':
      return SET_SETUP_SEC + avg(t.min, t.max) * SEC_PER_REP * sides;
    case 'time':
      return SET_SETUP_SEC + avg(t.minSec, t.maxSec) * sides;
    case 'max_time':
      return SET_SETUP_SEC + 45 * sides;
    case 'distance':
      return SET_SETUP_SEC + avg(t.minM, t.maxM) / 1.2;
    case 'duration':
      return avg(t.minMin, t.maxMin) * 60;
  }
}

function restSec(slot: TemplateSlot): number {
  if (slot.restSec) return avg(slot.restSec.min, slot.restSec.max);
  return slot.target.kind === 'reps' ? 90 : 60;
}

/** Slots grouped into stations: a superset is one station done in rounds. */
function stations(slots: TemplateSlot[]): TemplateSlot[][] {
  const out: TemplateSlot[][] = [];
  for (const s of [...slots].sort((a, b) => a.order - b.order)) {
    const last = out.at(-1);
    if (last && s.supersetGroup && last[0]!.supersetGroup === s.supersetGroup) last.push(s);
    else out.push([s]);
  }
  return out;
}

/** Estimated minutes, rounded to 5: warm-up, every set, the rests between them and changeovers. */
export function estimateMinutes(t: Pick<WorkoutTemplate, 'slots'>): number {
  if (!t.slots.length) return 0;
  let sec = WARM_UP_SEC;
  const groups = stations(t.slots);
  groups.forEach((group, gi) => {
    const rounds = Math.max(...group.map((s) => s.sets ?? 1));
    for (let r = 0; r < rounds; r++) {
      const members = group.filter((s) => (s.sets ?? 1) > r);
      sec += members.reduce((sum, s) => sum + workSec(s), 0) + (members.length - 1) * SUPERSET_SWITCH_SEC;
      if (r < rounds - 1) sec += Math.max(...members.map(restSec));
    }
    if (gi < groups.length - 1) sec += BETWEEN_EXERCISES_SEC;
  });
  return Math.max(5, Math.round(sec / 60 / 5) * 5);
}

/** Actual minutes of a finished session: the time you entered, else start to finish (if plausible). */
export function sessionMinutes(s: WorkoutSession): number | null {
  if (s.status !== 'completed') return null;
  if (typeof s.durationMin === 'number') return s.durationMin;
  if (!s.startedAt || !s.finishedAt) return null;
  const min = Math.round((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 60000);
  return min >= 5 && min <= 240 ? min : null;
}

/** Median of the last five timed sessions of a workout, once there are at least two. */
export function typicalMinutes(sessions: WorkoutSession[], templateCode: string): number | null {
  const times = sessions
    .filter((s) => s.templateCode === templateCode)
    .sort((a, b) => b.date.localeCompare(a.date) || (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))
    .map(sessionMinutes)
    .filter((m): m is number => m !== null)
    .slice(0, 5)
    .sort((a, b) => a - b);
  if (times.length < 2) return null;
  const mid = Math.floor(times.length / 2);
  return times.length % 2 ? times[mid]! : Math.round((times[mid - 1]! + times[mid]!) / 2);
}

/** The time written in the program, else the estimate. */
export function plannedMinutes(t: Pick<WorkoutTemplate, 'slots' | 'estMinutes'>): number {
  return t.estMinutes ?? estimateMinutes(t);
}

/** "~50 min", or "usually 58 min" once your own times are known. */
export function durationLabel(t: WorkoutTemplate, sessions: WorkoutSession[]): string {
  const usual = typicalMinutes(sessions, t.code);
  return usual !== null ? `usually ${formatMinutes(usual)}` : `~${formatMinutes(plannedMinutes(t))}`;
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
