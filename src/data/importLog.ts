// Imports a workout log CSV (from another app, a spreadsheet or an AI chat) as history.
// Imported sessions feed charts, records and "last time", but never change targets.
// Session and set ids come from the file's content, so importing the same file twice adds nothing.

import { buildExercise, type ExerciseKind } from '../engine/custom';
import type { IsoDate } from '../engine/dates';
import { bestMatch, guessKind, matchCandidates, type NameMatch, type ParsedLog, type ParsedSet } from '../engine/import/csvLog';
import type { BodyPart } from '../engine/library/groups';
import type { Exercise, SetLog, WorkoutSession } from '../engine/model';
import type { FitnessDB } from './db';
import { allExercises } from './custom';

/** What to do with one exercise name from the file. */
export type NameChoice = { kind: 'existing'; exerciseId: string } | { kind: 'new'; as: ExerciseKind } | { kind: 'skip' };

export interface NameRow {
  name: string;
  sets: number;
  match: NameMatch | null;
  candidates: NameMatch[];
  choice: NameChoice;
}

export interface ImportPreview {
  sessions: number;
  sets: number;
  from: IsoDate | null;
  to: IsoDate | null;
  names: NameRow[];
}

export function previewLog(log: ParsedLog, exercises: Exercise[]): ImportPreview {
  const byName = new Map<string, ParsedSet[]>();
  for (const s of log.sets) byName.set(s.exercise, [...(byName.get(s.exercise) ?? []), s]);
  const names = [...byName.entries()].map(([name, sets]): NameRow => {
    const match = bestMatch(name, exercises);
    return {
      name,
      sets: sets.length,
      match,
      candidates: matchCandidates(name, exercises, 6),
      choice: match ? { kind: 'existing', exerciseId: match.exercise.id } : { kind: 'new', as: guessKind(name, sets) },
    };
  });
  names.sort((a, b) => Number(!!a.match) - Number(!!b.match) || b.sets - a.sets);
  const dates = log.sets.map((s) => s.date).concat(log.bodyWeights.map((b) => b.date)).sort();
  return {
    sessions: new Set(log.sets.map((s) => `${s.date}|${s.workout}`)).size,
    sets: log.sets.length,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
    names,
  };
}

/** Short stable hash (FNV-1a) for ids derived from content. */
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Body parts guessed from a name, so new exercises show up under the right filters. */
function partsFromName(name: string): BodyPart[] {
  const n = name.toLowerCase();
  const parts: BodyPart[] = [];
  if (/squat|lunge|leg|calf|step.?up|quad|hamstring/.test(n)) parts.push('legs');
  if (/deadlift|hip|glute|thrust|bridge/.test(n)) parts.push('glutes');
  if (/bench|chest|fly|flye|push.?up|pec|dip/.test(n)) parts.push('chest');
  if (/row|pull|lat\b|chin|back|shrug/.test(n)) parts.push('back');
  if (/shoulder|overhead|military|lateral|delt|raise|press/.test(n) && !parts.includes('chest') && !parts.includes('legs')) parts.push('shoulders');
  if (/curl|bicep|tricep|extension|pushdown|skull/.test(n) && !parts.includes('legs')) parts.push('arms');
  if (/plank|crunch|ab\b|abs|core|sit.?up|hollow|knee raise|leg raise|twist/.test(n)) parts.push('core');
  return parts;
}

export interface ImportOptions {
  choices: Map<string, NameChoice>;
  /** Barbell weights in the file include the bar; the app records plates only for some lifts. */
  barIncluded: boolean;
  barKg: number;
}

export interface ImportResult {
  sessions: number;
  sets: number;
  bodyWeights: number;
  newExercises: string[];
  alreadyThere: number;
}

export async function importLog(db: FitnessDB, log: ParsedLog, opts: ImportOptions): Promise<ImportResult> {
  const known = new Map((await allExercises(db)).map((e) => [e.id, e]));
  const result: ImportResult = { sessions: 0, sets: 0, bodyWeights: 0, newExercises: [], alreadyThere: 0 };

  // Exercises: existing ones by id; new ones are created once per name.
  const exerciseFor = new Map<string, Exercise>();
  const created: Exercise[] = [];
  const takenNames = new Set([...known.values()].map((e) => e.name.trim().toLowerCase()));
  for (const [name, choice] of opts.choices) {
    if (choice.kind === 'existing') {
      const e = known.get(choice.exerciseId);
      if (e) exerciseFor.set(name, e);
    } else if (choice.kind === 'new') {
      const lower = name.trim().toLowerCase();
      const existing = [...known.values()].find((e) => e.name.trim().toLowerCase() === lower);
      if (existing) {
        exerciseFor.set(name, existing);
        continue;
      }
      const e = buildExercise({ name, kind: choice.as, parts: partsFromName(name), pull: /row|pull|chin/i.test(name), perSide: null, cues: '' }, `custom-imp-${hash(lower)}`);
      if (e.measure === 'duration') e.region = null;
      created.push(e);
      takenNames.add(lower);
      exerciseFor.set(name, e);
    }
  }

  // Sessions, one per date and workout name.
  const groups = new Map<string, ParsedSet[]>();
  for (const s of log.sets) {
    if (!exerciseFor.has(s.exercise)) continue;
    const k = `${s.date}|${s.workout}`;
    groups.set(k, [...(groups.get(k) ?? []), s]);
  }
  const sessions: WorkoutSession[] = [];
  const sets: SetLog[] = [];
  for (const [k, rows] of groups) {
    const [date, workout] = k.split('|') as [IsoDate, string];
    const id = `imp-${date}-${hash(k + JSON.stringify(rows.map((r) => [r.exercise, r.setIndex, r.weightKg, r.reps, r.seconds])))}`;
    sessions.push({
      id, date, templateCode: null, programVersionId: null, status: 'completed', startedAt: null, finishedAt: null,
      fatigue: null, discomfort: [], conditions: [], notes: [`Imported: ${workout}`], flags: ['imported'], prescriptionSnapshot: null,
    });
    rows.forEach((r, i) => {
      const e = exerciseFor.get(r.exercise)!;
      let weightKg = r.weightKg;
      let assistKg = r.assistKg;
      if (e.loadType === 'plates' && weightKg !== null && opts.barIncluded) weightKg = Math.max(0, Math.round((weightKg - opts.barKg) * 10000) / 10000);
      if (e.loadType === 'assisted_machine' && assistKg === null && weightKg !== null) {
        assistKg = weightKg;
        weightKg = null;
      }
      const duration = e.measure === 'duration' && r.seconds === null && r.reps !== null ? null : r.seconds;
      sets.push({
        id: `${id}-${i + 1}`, sessionId: id, slotKey: null, exerciseId: e.id, setIndex: r.setIndex, side: e.perSide ? 'each' : 'both',
        weightKg, assistKg, reps: r.reps, durationSec: duration, distanceM: r.distanceM,
        rir: r.rir === null ? null : { min: r.rir, max: r.rir },
        completed: true, techniqueOk: null, isWarmup: r.warmup, ...(r.notes ? { notes: r.notes } : {}), quality: 'confirmed',
      });
    });
  }

  await db.transaction('rw', [db.sessions, db.sets, db.exercises, db.bodyWeights], async () => {
    const existing = await db.sessions.bulkGet(sessions.map((s) => s.id));
    const fresh = sessions.filter((_, i) => !existing[i]);
    const freshIds = new Set(fresh.map((s) => s.id));
    result.alreadyThere = sessions.length - fresh.length;
    const usedExercises = new Set(sets.filter((s) => freshIds.has(s.sessionId)).map((s) => s.exerciseId));
    const newOnes = created.filter((e) => usedExercises.has(e.id));
    const present = await db.exercises.bulkGet(newOnes.map((e) => e.id));
    const toAdd = newOnes.filter((_, i) => !present[i]);
    await db.exercises.bulkAdd(toAdd);
    await db.sessions.bulkAdd(fresh);
    const freshSets = sets.filter((s) => freshIds.has(s.sessionId));
    await db.sets.bulkAdd(freshSets);
    const weights = log.bodyWeights.filter((b, i, all) => all.findIndex((x) => x.date === b.date) === i);
    const have = await db.bodyWeights.bulkGet(weights.map((b) => b.date));
    const newWeights = weights.filter((_, i) => !have[i]).map((b) => ({ date: b.date, kg: b.kg, source: 'import' as const }));
    await db.bodyWeights.bulkAdd(newWeights);
    result.sessions = fresh.length;
    result.sets = freshSets.length;
    result.bodyWeights = newWeights.length;
    result.newExercises = toAdd.map((e) => e.name);
  });
  return result;
}
