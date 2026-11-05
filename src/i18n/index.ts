/** The app's translations: see core.ts. This adds the hook that ties them to the language setting. */
import { useApp } from '@/store/app';
import { setLang, t, tn, currentLang } from './core';

export * from './core';

/**
 * Re-render when the language changes, and return the translator. Every component that shows
 * text calls this, so a change in Settings reaches the whole app at once.
 */
export function useT() {
  setLang(useApp((s) => s.settings.language));
  return { t, tn, lang: currentLang() };
}
