import { useEffect } from 'react';

/** Look for a new version at most this often, when the app comes back to the screen. */
const EVERY = 10 * 60_000;

/** The app's own bundle, by its hashed file name (index-<hash>.js): a new version has a new name. */
const entryOf = (text: string) => text.match(/\/index-[0-9a-f]+\.js/)?.[0] ?? null;

/**
 * The web app (on the home screen it stays open in the background for days) checks for a newer
 * version when it comes back to the screen, and reloads into it: nothing to do, everyone stays
 * on the newest version. Development builds skip it.
 */
export function useWebAutoUpdate(): void {
  useEffect(() => {
    if (__DEV__) return;
    const mine = entryOf(Array.from(document.scripts, (s) => s.src).join(' '));
    if (!mine) return;
    let last = Date.now();
    const check = async () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < EVERY) return;
      last = Date.now();
      try {
        const res = await fetch(`${process.env.EXPO_BASE_URL ?? ''}/index.html`, { cache: 'no-store' });
        if (!res.ok) return;
        const theirs = entryOf(await res.text());
        if (theirs && theirs !== mine) window.location.reload();
      } catch {
        // Offline: try again next time.
      }
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, []);
}
