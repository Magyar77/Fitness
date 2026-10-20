import { exportBackup, markBackedUp } from '../data/backup';
import type { FitnessDB } from '../data/db';
import { today } from './dates';
import { downloadText, shareOrDownload } from './download';

const PHOTOS_KEY = 'backup-photos';

/** Whether backups include progress photos (on unless turned off on this device). */
export function photosInBackup(): boolean {
  try {
    return localStorage.getItem(PHOTOS_KEY) !== 'no';
  } catch {
    return true;
  }
}

export function setPhotosInBackup(on: boolean): void {
  try {
    localStorage.setItem(PHOTOS_KEY, on ? 'yes' : 'no');
  } catch {
    // only a convenience
  }
}

/** Saves a full backup through the share sheet (or as a download) and records when. */
export async function saveBackup(db: FitnessDB, how: 'share' | 'download' = 'share', opts: { photos?: boolean } = {}): Promise<{ saved: boolean; text: string }> {
  const backup = JSON.stringify(await exportBackup(db, new Date(), { photos: opts.photos ?? photosInBackup() }));
  const name = `fitness-backup-${today()}.json`;
  const result = how === 'share' ? await shareOrDownload(name, backup, 'application/json', 'Fitness backup') : (downloadText(name, backup, 'application/json'), 'downloaded' as const);
  if (result === 'cancelled') return { saved: false, text: 'Backup not saved.' };
  await markBackedUp(db);
  return result === 'shared'
    ? { saved: true, text: 'Backup handed to the app you picked. If it was Google Drive or Files, it is safe off this phone.' }
    : { saved: true, text: 'Backup saved to your downloads. Move a copy somewhere safe, such as Google Drive or iCloud.' };
}
