/// <reference types="node" />
import fs from 'fs';
import path from 'path';

/** Undo the escapes a JS string literal may contain. */
const unescape = (s: string) => s.replace(/\\(['"\\n])/g, (_m, ch: string) => (ch === 'n' ? '\n' : ch));

const STR = String.raw`(['"])((?:\\.|(?!\1)[^\\])*)\1`;
// t('...'), tr('...') (an alias) and tk('...') (marked for later).
const SINGLE = new RegExp(String.raw`(?<![\w.])(?:t|tr|tk)\(\s*` + STR, 'g');
// tn(n, 'one', 'other'): the first argument may hold brackets but no top-level comma.
const PLURAL = new RegExp(String.raw`(?<![\w.])tn\(\s*(?:[^,()]|\([^()]*(?:\([^()]*\)[^()]*)*\))+,\s*` + STR + String.raw`\s*,\s*` + String.raw`(['"])((?:\\.|(?!\3)[^\\])*)\3`, 'g');

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/^(en|es|fr|it|de|ja|ko|pt-BR|zh-Hans|zh-Hant)\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Every English string the app translates, with the files it appears in. */
export function collectKeys(srcDir: string): Map<string, string[]> {
  const keys = new Map<string, string[]>();
  const add = (k: string, f: string) => keys.set(k, [...(keys.get(k) ?? []), f]);
  for (const file of walk(srcDir)) {
    const src = fs.readFileSync(file, 'utf8');
    const rel = path.relative(srcDir, file);
    for (const m of src.matchAll(SINGLE)) add(unescape(m[2]), rel);
    for (const m of src.matchAll(PLURAL)) {
      add(unescape(m[2]), rel);
      add(unescape(m[4]), rel);
    }
  }
  return keys;
}

export const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
