// Body measurements and progress photos. Both stay on the device.

import type { IsoDate } from '../engine/dates';
import { mergeMeasurement, validateMeasurement, type MeasurementEntry } from '../engine/measurements';
import type { PhotoPose, ProgressPhoto } from '../engine/model';
import type { FitnessDB } from './db';

export async function listMeasurements(db: FitnessDB): Promise<MeasurementEntry[]> {
  return (await db.measurements.toArray()).sort((a, b) => a.date.localeCompare(b.date));
}

/** Saves the values for a day, adding to what was already entered that day. */
export async function saveMeasurement(db: FitnessDB, entry: MeasurementEntry, today: IsoDate): Promise<string[]> {
  const problems = validateMeasurement(entry, today);
  if (problems.length) return problems;
  await db.measurements.put(mergeMeasurement(await db.measurements.get(entry.date), entry));
  return [];
}

export async function deleteMeasurement(db: FitnessDB, date: IsoDate): Promise<void> {
  await db.measurements.delete(date);
}

export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export interface NewPhoto {
  date: IsoDate;
  pose: PhotoPose;
  mime: string;
  bytes: ArrayBuffer;
  width: number;
  height: number;
}

export async function addPhoto(db: FitnessDB, p: NewPhoto, today: IsoDate, now = new Date()): Promise<{ ok: true; photo: ProgressPhoto } | { ok: false; problems: string[] }> {
  const problems: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date)) problems.push('Choose a date.');
  else if (p.date > today) problems.push("The date can't be in the future.");
  if (!p.mime.startsWith('image/')) problems.push('That file is not a photo.');
  if (!p.bytes.byteLength || p.bytes.byteLength > MAX_PHOTO_BYTES) problems.push('The photo could not be shrunk enough to store; try another one.');
  if (problems.length) return { ok: false, problems };
  const photo: ProgressPhoto = { id: crypto.randomUUID(), ...p, createdAt: now.toISOString() };
  await db.photos.add(photo);
  return { ok: true, photo };
}

/** Newest first; within a day front, side, back. */
export async function listPhotos(db: FitnessDB): Promise<ProgressPhoto[]> {
  const order: Record<PhotoPose, number> = { front: 0, side: 1, back: 2, other: 3 };
  return (await db.photos.toArray()).sort((a, b) => b.date.localeCompare(a.date) || order[a.pose] - order[b.pose] || a.createdAt.localeCompare(b.createdAt));
}

export async function deletePhoto(db: FitnessDB, id: string): Promise<void> {
  await db.photos.delete(id);
}

export async function photoStats(db: FitnessDB): Promise<{ count: number; bytes: number }> {
  const all = await db.photos.toArray();
  return { count: all.length, bytes: all.reduce((n, p) => n + p.bytes.byteLength, 0) };
}
