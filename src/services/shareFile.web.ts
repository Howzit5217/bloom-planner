/**
 * The web version: share the file where the browser can (iPhone Safari opens its share sheet),
 * otherwise download it.
 */
export async function shareTextFile(name: string, text: string, mimeType: string, _dialogTitle: string): Promise<void> {
  const blob = new Blob([text], { type: mimeType });
  try {
    const file = new File([blob], name, { type: mimeType });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return;
    }
  } catch (e) {
    // Cancelling the share sheet is fine; anything else falls through to a download.
    if ((e as { name?: string })?.name === 'AbortError') return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
