/** The web app updates itself (see hooks/useWebAutoUpdate.web.ts); there's nothing to install. */
export async function downloadAndInstall(apkUrl: string): Promise<void> {
  window.open(apkUrl, '_blank');
}

export function clearDownloadedUpdates(): void {}
