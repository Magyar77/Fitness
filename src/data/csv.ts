// CSV export (RFC 4180 quoting) for spreadsheets.

import type { BodyWeightEntry, SetLog, WorkoutSession } from '../engine/model';
import { MEASURES, type MeasurementEntry } from '../engine/measurements';
import { EXERCISES_BY_ID } from '../engine/library/exercises';

type Cell = string | number | boolean | null | undefined;

function cell(v: Cell): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: Cell[][]): string {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function setsCsv(sessions: WorkoutSession[], sets: SetLog[], exerciseNames: ReadonlyMap<string, string> = new Map()): string {
  const byId = new Map(sessions.map((s) => [s.id, s]));
  const name = (id: string) => exerciseNames.get(id) ?? EXERCISES_BY_ID.get(id)?.name ?? id;
  const rows = sets
    .map((s) => ({ s, session: byId.get(s.sessionId) }))
    .sort((a, b) => (a.session?.date ?? '').localeCompare(b.session?.date ?? '') || a.s.sessionId.localeCompare(b.s.sessionId) || (a.s.slotKey ?? '').localeCompare(b.s.slotKey ?? '') || a.s.setIndex - b.s.setIndex)
    .map(({ s, session }) => [
      session?.date,
      session?.templateCode,
      s.slotKey,
      name(s.exerciseId),
      s.setIndex,
      s.side,
      s.weightKg,
      s.assistKg,
      s.reps,
      s.durationSec,
      s.distanceM,
      s.rir?.min,
      s.rir?.max,
      s.completed,
      s.techniqueOk,
      s.tempoMet,
      s.pauseHeld,
      s.isWarmup,
      s.drops?.map((d) => `${d.weightKg}x${d.reps}`).join(' '),
      s.quality,
      s.notes,
    ]);
  return toCsv(
    ['date', 'workout', 'slot', 'exercise', 'set', 'side', 'weight_kg', 'assist_kg', 'reps', 'duration_s', 'distance_m', 'rir_min', 'rir_max', 'completed', 'technique_ok', 'tempo_met', 'pause_held', 'warmup', 'drops', 'quality', 'notes'],
    rows,
  );
}

export function bodyWeightCsv(entries: BodyWeightEntry[]): string {
  const rows = [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [e.date, e.kg, e.conditions, e.source]);
  return toCsv(['date', 'kg', 'conditions', 'source'], rows);
}

/** One row per day; lengths in cm, body fat in %. */
export function measurementsCsv(entries: MeasurementEntry[]): string {
  const rows = [...entries].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [e.date, ...MEASURES.map((m) => e.values[m.key]), e.notes]);
  return toCsv(['date', ...MEASURES.map((m) => (m.key === 'bodyFat' ? 'body_fat_pct' : `${m.key}_cm`)), 'notes'], rows);
}
