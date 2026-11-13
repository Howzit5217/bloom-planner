import * as ImagePicker from 'expo-image-picker';
import type { ShotSource } from '@/services/pikmin';

export type ScreenshotText = ({ lines: string[] } | { error: 'canceled' | 'unsupported' | 'failed' }) & { source?: ShotSource };

/** Tesseract (text recognition in the browser), loaded the first time it's needed. */
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';

type TesseractApi = {
  createWorker: (lang: string) => Promise<{
    setParameters: (p: Record<string, string>) => Promise<unknown>;
    recognize: (image: string) => Promise<{ data: { text: string } }>;
    terminate: () => Promise<unknown>;
  }>;
};

function loadTesseract(): Promise<TesseractApi> {
  const w = window as unknown as { Tesseract?: TesseractApi };
  if (w.Tesseract) return Promise.resolve(w.Tesseract);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = TESSERACT;
    s.async = true;
    s.onload = () => (w.Tesseract ? resolve(w.Tesseract) : reject(new Error('no Tesseract')));
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function loadImage(uri: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = uri;
  });
}

/**
 * Clean copies of the screenshot for the reader, large enough to read, with the contrast
 * stretched: in grey, the same inverted (the game puts dark text on light and white on green), and
 * the blue channel inverted, where the blue name and the white text stand out from the green. Then
 * the top half on its own (where the player's name is), in the red and green channels as well, so a
 * name in another colour, or a faint one, still reads.
 */
async function cleanCopies(uri: string): Promise<string[]> {
  const img = await loadImage(uri);
  const k = Math.min(3, Math.max(1, 1400 / img.naturalWidth));
  const w = Math.round(img.naturalWidth * k);
  const h = Math.round(img.naturalHeight * k);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const grey = new Uint8ClampedArray(w * h);
  const red = new Uint8ClampedArray(w * h);
  const green = new Uint8ClampedArray(w * h);
  const blue = new Uint8ClampedArray(w * h);
  for (let i = 0; i < w * h; i++) {
    grey[i] = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
    red[i] = px[i * 4];
    green[i] = px[i * 4 + 1];
    blue[i] = px[i * 4 + 2];
  }
  // Stretch the middle 96% of a channel's tones over the full range.
  const range = (ch: Uint8ClampedArray) => {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < ch.length; i++) hist[ch[i]]++;
    const pick = (share: number) => {
      let n = 0;
      for (let v = 0; v < 256; v++) if ((n += hist[v]) >= share * ch.length) return v;
      return 255;
    };
    const lo = pick(0.02);
    return { lo, hi: Math.max(lo + 1, pick(0.98)) };
  };
  const greyRange = range(grey);
  const blueRange = range(blue);
  const out: string[] = [];
  const copies = [
    { ch: grey, ...greyRange, invert: false, top: false },
    { ch: grey, ...greyRange, invert: true, top: false },
    { ch: blue, ...blueRange, invert: true, top: false },
    { ch: grey, ...greyRange, invert: true, top: true },
    { ch: red, ...range(red), invert: true, top: true },
    { ch: green, ...range(green), invert: true, top: true },
  ];
  const half = document.createElement('canvas');
  half.width = w;
  half.height = Math.round(h / 2);
  const halfCtx = half.getContext('2d')!;
  for (const { ch, lo, hi, invert, top } of copies) {
    for (let i = 0; i < w * h; i++) {
      let v = ((ch[i] - lo) / (hi - lo)) * 255;
      if (invert) v = 255 - v;
      px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
      px[i * 4 + 3] = 255;
    }
    ctx.putImageData(data, 0, 0);
    if (!top) {
      out.push(canvas.toDataURL('image/png'));
      continue;
    }
    halfCtx.drawImage(canvas, 0, 0, w, half.height, 0, 0, w, half.height);
    out.push(half.toDataURL('image/png'));
  }
  return out;
}

/** How far a reading has got, 0 to 1. */
export type ReadProgress = (k: number) => void;

/**
 * Pick a screenshot and read its text in the browser. The picture never leaves the device.
 * `onProgress` hears 0 once one is picked, then how far the reading is (1 when done).
 */
export async function pickScreenshotText(onProgress?: ReadProgress): Promise<ScreenshotText> {
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
  const uri = picked.canceled ? null : picked.assets?.[0]?.uri;
  if (!uri) return { error: 'canceled' };
  onProgress?.(0);
  try {
    const [T, copies] = await Promise.all([loadTesseract(), cleanCopies(uri)]);
    onProgress?.(0.15);
    const worker = await T.createWorker('eng');
    // Sparse text: a game screen, not a page.
    await worker.setParameters({ tessedit_pageseg_mode: '11' });
    onProgress?.(0.25);
    const lines: string[] = [];
    for (let i = 0; i < copies.length; i++) {
      lines.push(...(await worker.recognize(copies[i])).data.text.split(/\r?\n/));
      onProgress?.(0.25 + (0.75 * (i + 1)) / copies.length);
    }
    await worker.terminate();
    return { lines };
  } catch {
    return { error: 'failed' };
  }
}

/** The web version only reads a screenshot picked on the spot (pickScreenshotText). */
export async function readScreenshotText(_uri: string, _onProgress?: ReadProgress): Promise<ScreenshotText> {
  return { error: 'unsupported' };
}
