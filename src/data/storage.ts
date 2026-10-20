// Persistent-storage request and status (so the browser doesn't evict workout data).

export interface StorageStatus {
  supported: boolean;
  persisted: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
}

export async function requestPersistence(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function storageStatus(): Promise<StorageStatus> {
  const s = navigator.storage;
  if (!s?.persisted) return { supported: false, persisted: false, usageBytes: null, quotaBytes: null };
  const [persisted, estimate] = await Promise.all([s.persisted(), s.estimate?.() ?? Promise.resolve({} as StorageEstimate)]);
  return { supported: true, persisted, usageBytes: estimate.usage ?? null, quotaBytes: estimate.quota ?? null };
}
