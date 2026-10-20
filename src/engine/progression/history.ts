import type { IsoDate } from '../dates';
import type { Prescription, SetLog, TemplateSlot, WorkoutSession } from '../model';
import type { SlotPerformance } from './types';

/** Slot keys that share progression with `slot` (its link group), including itself. */
export function progressionKeys(slot: TemplateSlot, allSlots: TemplateSlot[]): string[] {
  if (!slot.linkGroup) return [slot.slotKey];
  return allSlots.filter((s) => s.linkGroup === slot.linkGroup).map((s) => s.slotKey);
}

/**
 * Completed performances of the given slots, oldest first, up to and including `until`.
 * Sessions flagged `legacyProgram` are history only and never drive progression.
 */
export function performancesFor(
  sessions: WorkoutSession[],
  sets: SetLog[],
  slotKeys: string[],
  until?: IsoDate,
): SlotPerformance[] {
  const keys = new Set(slotKeys);
  const bySession = new Map<string, SetLog[]>();
  for (const s of sets) {
    if (s.slotKey !== null && keys.has(s.slotKey)) {
      const list = bySession.get(s.sessionId) ?? [];
      list.push(s);
      bySession.set(s.sessionId, list);
    }
  }
  return sessions
    .filter((s) => s.status === 'completed' && !s.flags.includes('legacyProgram') && bySession.has(s.id))
    .filter((s) => until === undefined || s.date <= until)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((session) => ({ session, sets: [...bySession.get(session.id)!].sort((a, b) => a.setIndex - b.setIndex) }));
}

/** The active target for a slot (or its link group) on a date; later entries win ties. */
export function activePrescription(prescriptions: Prescription[], slot: TemplateSlot, onDate: IsoDate): Prescription | null {
  let best: Prescription | null = null;
  for (const p of prescriptions) {
    const matches = slot.linkGroup ? p.linkGroup === slot.linkGroup : p.slotKey === slot.slotKey;
    if (!matches || p.status !== 'active' || p.effectiveFrom > onDate) continue;
    if (!best || p.effectiveFrom >= best.effectiveFrom) best = p;
  }
  return best;
}
