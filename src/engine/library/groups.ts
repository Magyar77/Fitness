// How the library is grouped for people: body parts, equipment and type, plus filtering.

import type { EquipmentKind, Exercise, ExerciseCategory, Muscle } from '../model';

export type BodyPart = 'chest' | 'back' | 'shoulders' | 'arms' | 'legs' | 'glutes' | 'core';

export const BODY_PARTS: { id: BodyPart; label: string; muscles: Muscle[] }[] = [
  { id: 'chest', label: 'Chest', muscles: ['chest'] },
  { id: 'back', label: 'Back', muscles: ['lats', 'upper-back', 'traps', 'lower-back'] },
  { id: 'shoulders', label: 'Shoulders', muscles: ['shoulders'] },
  { id: 'arms', label: 'Arms', muscles: ['biceps', 'triceps', 'forearms'] },
  { id: 'legs', label: 'Legs', muscles: ['quads', 'hamstrings', 'adductors', 'abductors', 'calves'] },
  { id: 'glutes', label: 'Glutes', muscles: ['glutes'] },
  { id: 'core', label: 'Core', muscles: ['abs'] },
];

export const EQUIPMENT_KINDS: { id: EquipmentKind; label: string }[] = [
  { id: 'bodyweight', label: 'Bodyweight' },
  { id: 'dumbbell', label: 'Dumbbells' },
  { id: 'barbell', label: 'Barbell' },
  { id: 'cable', label: 'Cables' },
  { id: 'machine', label: 'Machines' },
  { id: 'kettlebell', label: 'Kettlebells' },
  { id: 'bands', label: 'Bands' },
  { id: 'other', label: 'Other' },
];

export type ExerciseType = 'strength' | 'calisthenics' | 'conditioning' | 'mobility';

export const EXERCISE_TYPES: { id: ExerciseType; label: string; categories: ExerciseCategory[] }[] = [
  { id: 'strength', label: 'Strength', categories: ['strength', 'powerlifting', 'olympic', 'strongman'] },
  { id: 'calisthenics', label: 'Street workout', categories: ['calisthenics'] },
  { id: 'conditioning', label: 'Cardio and plyo', categories: ['cardio', 'plyometrics'] },
  { id: 'mobility', label: 'Mobility', categories: ['mobility'] },
];

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'chest', shoulders: 'shoulders', triceps: 'triceps', biceps: 'biceps', forearms: 'forearms',
  lats: 'lats', 'upper-back': 'upper back', traps: 'traps', 'lower-back': 'lower back', abs: 'abs',
  glutes: 'glutes', quads: 'quads', hamstrings: 'hamstrings', adductors: 'inner thighs', abductors: 'outer hips',
  calves: 'calves', neck: 'neck',
};

/** Body parts an exercise mainly works (from its primary muscles). */
export function bodyPartsOf(e: Exercise): BodyPart[] {
  const muscles = new Set(e.muscles ?? []);
  return BODY_PARTS.filter((p) => p.muscles.some((m) => muscles.has(m))).map((p) => p.id);
}

/** Street workout covers the calisthenics skills plus every bodyweight strength exercise. */
export function typeOf(e: Exercise): ExerciseType {
  if (e.equipmentKind === 'bodyweight' && (e.category ?? 'strength') === 'strength') return 'calisthenics';
  return EXERCISE_TYPES.find((t) => t.categories.includes(e.category ?? 'strength'))?.id ?? 'strength';
}

export interface LibraryFilter {
  query?: string;
  part?: BodyPart | null;
  equipment?: EquipmentKind | null;
  type?: ExerciseType | null;
  level?: Exercise['level'] | null;
}

/** Normalised words for forgiving search ("pullup" finds "Pull-up", "db" finds "dumbbell"). */
function words(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bdb\b/g, 'dumbbell')
    .replace(/\bbb\b/g, 'barbell')
    .replace(/[^a-z0-9]+/g, '');
}

export function matches(e: Exercise, f: LibraryFilter): boolean {
  if (f.part && !bodyPartsOf(e).includes(f.part)) return false;
  if (f.equipment && e.equipmentKind !== f.equipment) return false;
  if (f.type && typeOf(e) !== f.type) return false;
  if (f.level && e.level !== f.level) return false;
  const q = f.query?.trim();
  if (!q) return true;
  const hay = words(`${e.name} ${(e.muscles ?? []).map((m) => MUSCLE_LABEL[m]).join(' ')}`);
  return q.split(/\s+/).every((part) => hay.includes(words(part)));
}

/**
 * Matching exercises: names starting with the search first, then names containing it, then
 * muscle-only matches; within each, your own, then the app's and street skills, then the catalog.
 */
export function searchLibrary(all: Exercise[], f: LibraryFilter): Exercise[] {
  const q = f.query ? words(f.query) : '';
  const nameRank = (e: Exercise) => {
    if (!q) return 0;
    const n = words(e.name);
    return n.startsWith(q) ? 0 : n.includes(q) ? 1 : 2;
  };
  const rank = (e: Exercise) => nameRank(e) * 10 + (e.custom ? 0 : e.id.startsWith('fx-') ? 2 : 1);
  return all.filter((e) => matches(e, f)).sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
}
