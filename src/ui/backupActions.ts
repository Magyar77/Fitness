import { exportBackup, markBackedUp } from '../data/backup';
import type { FitnessDB } from '../data/db';
import { today } from './dates';
import { downloadText, shareOrDownload } from './download';

/** Saves a full backup through the share sheet (or as a download) and records when. */
export async function saveBackup(db: FitnessDB, how: 'share' | 'download' = 'share'): Promise<{ saved: boolean; text: string }> {
  const backup = JSON.stringify(await exportBackup(db));
  const name = `fitness-backup-${today()}.json`;
  const result = how === 'share' ? await shareOrDownload(name, backup, 'application/json', 'Fitness backup') : (downloadText(name, backup, 'application/json'), 'downloaded' as const);
  if (result === 'cancelled') return { saved: false, text: 'Backup not saved.' };
  await markBackedUp(db);
  return result === 'shared'
    ? { saved: true, text: 'Backup handed to the app you picked. If it was Google Drive or Files, it is safe off this phone.' }
    : { saved: true, text: 'Backup saved to your downloads. Move a copy somewhere safe, such as Google Drive or iCloud.' };
}
