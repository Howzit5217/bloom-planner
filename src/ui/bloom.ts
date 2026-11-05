import { create } from 'zustand';
import { useApp } from '@/store/app';

/** How far along the game's levels the player is (0..1), as Home works it out from the log. */
export const useBloom = create<{ share: number | null; setShare: (share: number) => void }>((set) => ({
  share: null,
  setShare: (share) => set({ share }),
}));

/**
 * How full of flowers the meadow is, for the player's level: about half the usual at level 1, rising
 * gently (fastest early on) to a tenth more at the top level, so a high level reads as a richer
 * field without crowding it. Until Home has worked out the level, the setup level stands in. Kept in
 * steps of five levels, so the field is planted afresh only now and then.
 */
export function useBloomFactor(): number {
  const known = useBloom((s) => s.share);
  const setup = useApp((s) => (s.profile ? s.profile.currentLevel / Math.max(1, s.table.maxLevel) : 0.5));
  const share = Math.round(Math.max(0, Math.min(1, known ?? setup)) * 26) / 26;
  return 0.5 + 0.6 * Math.sqrt(share);
}
