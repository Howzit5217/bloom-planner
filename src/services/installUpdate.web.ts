import { create } from 'zustand';

/** The web app updates itself (see hooks/useWebAutoUpdate.web.ts); there's nothing to install. */
export type UpdateStep = 'idle' | 'downloading' | 'ready' | 'failed';

export const useUpdateInstall = create<{ step: UpdateStep; share: number | null; start: (apkUrl: string) => Promise<void> }>(() => ({
  step: 'idle',
  share: null,
  start: async (apkUrl) => {
    window.open(apkUrl, '_blank');
  },
}));

export function clearDownloadedUpdates(): void {}
