/** Saves text as a file via the browser's download (works in an installed Android PWA). */
export function downloadText(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Opens the phone's share sheet with the file (Google Drive, Files, email…) where the
 * browser supports sharing files; otherwise downloads it.
 */
export async function shareOrDownload(filename: string, text: string, mime: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  try {
    const file = new File([text], filename, { type: mime });
    if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'cancelled';
    // Sharing failed for another reason: fall back to a download.
  }
  downloadText(filename, text, mime);
  return 'downloaded';
}
