import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getDb } from '../data/db';
import { getProfile, saveProfile, type Profile } from '../data/profile';
import type { Unit } from '../engine/units';

interface ProfileContextValue {
  profile: Profile;
  update: (p: Profile) => Promise<void>;
  /** Re-read from the database (e.g. after importing a backup). */
  reload: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const db = getDb();
  const [profile, setProfile] = useState<Profile | null>(null);

  const reload = useCallback(async () => {
    setProfile(await getProfile(db));
  }, [db]);

  useEffect(() => {
    let alive = true;
    void getProfile(db).then((p) => alive && setProfile(p));
    return () => {
      alive = false;
    };
  }, [db]);

  const update = useCallback(
    async (p: Profile) => {
      await saveProfile(db, p);
      setProfile(p);
    },
    [db],
  );

  if (!profile) return <main className="content"><p className="muted">Loading…</p></main>;
  return <ProfileContext.Provider value={{ profile, update, reload }}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const v = useContext(ProfileContext);
  if (!v) throw new Error('useProfile outside ProfileProvider');
  return v;
}

export function useUnit(): Unit {
  return useProfile().profile.unit;
}

/** Bar weight to count on barbell lifts (null = plates only). */
export function useBar(): number | null {
  return useProfile().profile.barKg;
}
