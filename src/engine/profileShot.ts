// Reading a Pikmin Bloom profile screenshot: the text the phone's text recognition found (lines, in
// reading order) turned into the numbers the app needs. OCR misreads (O for 0, l for 1, stray
// spaces in numbers) are expected and forgiven.
//
// The profile's "Next steps to level up..." has a bar per goal. The bar names the level's target
// ("Walk 479,200 step", "Plant 12K flowers", "Complete 15 expedition(s)"); the line under it, at the
// right, says what's still to go ("437,337 steps to go"). A finished goal has a tick on its bar and
// no line under it.
import { cumulativeStepsTo } from './levels';
import { questOf, type QuestKind } from './quest';
import type { ReqFn } from './types';

export interface ProfileShot {
  /** The player's name as shown beside the level badge. */
  name: string | null;
  level: number | null;
  /** What's left, from the lines under the bars (0 when the bar is ticked). */
  stepsToGo: number | null;
  flowersToGo: number | null;
  /** The level's quest still to go ("12 mushrooms to go"), 0 when ticked. */
  quest: { kind: QuestKind; toGo: number } | null;
  /** The bars' targets: "Walk X steps" / "Walk a total of X steps", and "Plant Y flowers". */
  walkTarget: number | null;
  plantTarget: number | null;
  /** How far off a rounded target may be ("12K" is within 1,000 of the real one); 0 when exact. */
  walkSlack: number;
  plantSlack: number;
  /** "Walk a total of": the lifetime count the game uses up to level 100. */
  walkLifetime: boolean;
  /** The quest bar's target ("Complete 15 expedition(s)"), done or not. */
  questTarget: { kind: QuestKind; count: number } | null;
  /** "Total steps: N" on the profile. */
  totalSteps: number | null;
}

/** Digits as OCR tends to misread them. */
const DIGITISH: Record<string, string> = { O: '0', o: '0', D: '0', l: '1', I: '1', '|': '1', i: '1', S: '5', s: '5', B: '8' };
const asDigits = (raw: string) =>
  raw
    .split('')
    .map((ch) => DIGITISH[ch] ?? ch)
    .join('');

/** "479,200" "479.200" "479 200" "47g,2OO" -> 479200. */
export function readNumber(raw: string): number | null {
  const cleaned = asDigits(raw).replace(/[,.\s'’ _]/g, '');
  if (!/^\d{1,9}$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** A number, or a rounded one ("12K", "1.2M"), with how far off it may be. */
export function readAmount(raw: string): { n: number; slack: number } | null {
  const m = raw.trim().match(/^(.*?)\s?([KkMm])$/);
  if (!m) {
    const n = readNumber(raw);
    return n == null ? null : { n, slack: 0 };
  }
  const body = asDigits(m[1]).replace(/[\s'’ ]/g, '');
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(body)) return null;
  const unit = /[Kk]/.test(m[2]) ? 1000 : 1_000_000;
  const decimals = body.split('.')[1]?.length ?? 0;
  return { n: Math.round(Number(body) * unit), slack: unit / 10 ** decimals };
}

// A number starts on a real digit and stays on its line; misread digits are allowed after that,
// and a rounded one ends in K or M.
const NUM = String.raw`((?:[0-9][0-9OoDlI|,.'’  ]*[0-9OoDlI]|[0-9])(?:\s?[KkMm](?![A-Za-z]))?)`;

/**
 * The number just before a label. When the reader runs two numbers together ("479,200 120,000
 * steps to go": the bar's target, then what's left under it), the last one is the label's.
 */
function lastAmount(raw: string): { n: number; slack: number } | null {
  const chunks = raw.trim().split(/\s+/);
  for (let k = 0; k < chunks.length; k++) {
    const a = readAmount(chunks.slice(k).join(' '));
    if (a) return a;
  }
  return null;
}
const find = (text: string, re: RegExp) => {
  const m = text.match(re);
  return m ? lastAmount(m[1]) : null;
};

// "(s)" as in "Complete 15 expedition(s)".
const PLURAL = String.raw`(?:\(s\))?`;
const QUESTS: Array<{ kind: QuestKind; noun: string; verb: string }> = [
  { kind: 'mushrooms', noun: 'mushrooms?', verb: '(?:destroy|clear)' },
  { kind: 'expeditions', noun: 'expeditions?', verb: 'complete' },
  { kind: 'pikmin', noun: 'pikmin', verb: 'grow' },
  { kind: 'petals', noun: '(?:flower\\s*)?petals?', verb: 'pick' },
];

/** A tick on a bar: at the end of its line, or read as a line of its own just after it. */
function ticked(lines: string[], re: RegExp): boolean {
  const i = lines.findIndex((l) => re.test(l));
  return i >= 0 && (/[✓✔]\s*$/.test(lines[i]) || /^[✓✔]$/.test(lines[i + 1] ?? ''));
}

/** The level after "Lv" (it may be on the next line, and split by OCR: "1 1/0" is 110). */
function readLevel(text: string, maxLevel: number): number | null {
  const at = text.search(/\bL[vV]\b\.?/);
  if (at < 0) return null;
  const after = text.slice(at + 2, at + 16);
  let digits = '';
  for (const ch of after) {
    // In the badge only O, l, I and | stand in for digits; a line break or a letter ends it.
    const d = /[0-9]/.test(ch) ? ch : 'OolI|'.includes(ch) ? DIGITISH[ch] : null;
    if (d) digits += d;
    else if (digits && (ch === String.fromCharCode(10) || /[A-Za-z]/.test(ch))) break;
    if (digits.length === 3) break;
  }
  const n = digits ? Number(digits) : NaN;
  return n >= 1 && n <= maxLevel ? n : null;
}

/**
 * A believable player name: 2 to 20 characters, at least two of them letters, almost all letters
 * or digits. Badge debris such as "U 1/0" (a misread "110") is not a name.
 */
const nameLike = (s: string) => {
  const t = s.trim();
  if (t.length < 2 || t.length > 20 || /[/|\\:;]/.test(t)) return false;
  const chars = t.replace(/\s/g, '');
  const letters = chars.match(/\p{L}/gu)?.length ?? 0;
  const plain = chars.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return letters >= 2 && plain >= chars.length * 0.8 && !/^(lv|level|friends?|edit|mii|account|total|next|walk|plant)\b/i.test(t);
};

const LV = /\bL[vV]\b/;
/** "Lv 110" and the digits OCR makes of the badge, taken out of a line. */
const dropBadge = (l: string) => l.replace(/\bL[vV]\b\.?\s*[0-9OIl|/ ]*/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * The name: before "Account ID" on its line, or on a line above it, no higher than the "Lv" badge
 * (what's above the badge is the rest of the screen).
 */
function readName(lines: string[]): string | null {
  const i = lines.findIndex((l) => /account\s*id/i.test(l));
  if (i < 0) return null;
  const before = dropBadge(lines[i].split(/account\s*id/i)[0]).replace(/^[^\p{L}]+/u, '');
  if (nameLike(before)) return before;
  for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
    const l = dropBadge(lines[k]);
    if (nameLike(l) && !/\d{3}/.test(l)) return l;
    if (LV.test(lines[k])) break;
  }
  return null;
}

/**
 * Whether the player's name is anywhere on the screenshot: a line, a word, or two words of one,
 * allowing a letter's misread. More reliable than finding the name's spot first.
 */
export function nameOnShot(saved: string, lines: string[]): boolean {
  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean);
    const bits = [line, dropBadge(line.split(/account\s*id/i)[0]), ...words, ...words.slice(1).map((w, k) => `${words[k]} ${w}`)];
    if (bits.some((b) => b.trim() && sameName(saved, b))) return true;
    if (nameWithin(saved, line)) return true;
  }
  return false;
}

export function readProfileShot(lines: string[], maxLevel: number): ProfileShot {
  const clean = lines.map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const text = clean.join('\n');

  const walkRe = new RegExp(String.raw`walk\s*(a\s*total\s*of\s*)?${NUM}\s*steps?`, 'i');
  const plantRe = new RegExp(String.raw`plant\s*${NUM}\s*flowers?`, 'i');
  const walkM = text.match(walkRe);
  const walk = walkM ? lastAmount(walkM[2]) : null;
  const plant = find(text, plantRe);

  let stepsToGo = find(text, new RegExp(String.raw`${NUM}\s*steps?\s*to\s*go`, 'i'))?.n ?? null;
  let flowersToGo = find(text, new RegExp(String.raw`${NUM}\s*flowers?\s*to\s*go`, 'i'))?.n ?? null;
  let quest: ProfileShot['quest'] = null;
  let questTarget: ProfileShot['questTarget'] = null;
  let questRe: RegExp | null = null;
  for (const q of QUESTS) {
    const left = find(text, new RegExp(String.raw`${NUM}\s*${q.noun}${PLURAL}\s*to\s*go`, 'i'));
    if (left && !quest) quest = { kind: q.kind, toGo: left.n };
    const re = new RegExp(String.raw`${q.verb}\s*${NUM}\s*${q.noun}`, 'i');
    const target = find(text, re);
    if (target && !questTarget) {
      questTarget = { kind: q.kind, count: target.n };
      questRe = re;
    }
  }
  const seedRe = /grow\s*an?\s*[\p{L}-]+\s*seedling/iu;
  if (!questTarget && seedRe.test(text)) {
    questTarget = { kind: 'seedling', count: 1 };
    questRe = seedRe;
  }

  // A goal whose bar is there with no line under it is done; so is a ticked one. Only trusted when
  // the reader did get some "to go" line, so it did read that part of the screen.
  const readSomeToGo = stepsToGo != null || flowersToGo != null || quest != null;
  if (flowersToGo == null && plant && (readSomeToGo || ticked(clean, plantRe))) flowersToGo = 0;
  if (!quest && questTarget && questRe && (readSomeToGo || ticked(clean, questRe))) quest = { kind: questTarget.kind, toGo: 0 };
  if (stepsToGo == null && walk && (readSomeToGo || ticked(clean, walkRe))) stepsToGo = 0;

  return {
    name: readName(clean),
    level: readLevel(text, maxLevel),
    stepsToGo,
    flowersToGo,
    quest,
    walkTarget: walk?.n ?? null,
    plantTarget: plant?.n ?? null,
    walkSlack: walk?.slack ?? 0,
    plantSlack: plant?.slack ?? 0,
    walkLifetime: !!walkM?.[1],
    questTarget,
    totalSteps: find(text, new RegExp(String.raw`total\s*steps?\s*[:：]?\s*${NUM}`, 'i'))?.n ?? null,
  };
}

const near = (seen: number, slack: number, want: number) => Math.abs(seen - want) <= slack;

/**
 * The levels the screenshot can be at, judged by the bars' targets: those whose next level asks
 * for what the bars show.
 */
function levelsFromTargets(shot: ProfileShot, req: ReqFn, maxLevel: number): number[] {
  if (shot.walkTarget == null && shot.plantTarget == null && !shot.questTarget) return [];
  const out: number[] = [];
  for (let L = 1; L < maxLevel; L++) {
    const next = req(L + 1);
    if (!next) continue;
    const stepsOk =
      shot.walkTarget == null ||
      near(shot.walkTarget, shot.walkSlack, next.steps) ||
      (next.stepsMode === 'lifetime' && near(shot.walkTarget, shot.walkSlack, cumulativeStepsTo(req, L + 1)));
    const flowersOk = shot.plantTarget == null || near(shot.plantTarget, shot.plantSlack, next.flowers);
    const q = questOf(next.task);
    const questOk = !shot.questTarget || (!!q && q.kind === shot.questTarget.kind && q.count === shot.questTarget.count);
    if (stepsOk && flowersOk && questOk) out.push(L);
  }
  return out;
}

/** The level the bars' targets point to, when they point to one. */
export function levelFromTargets(shot: ProfileShot, req: ReqFn, maxLevel: number): number | null {
  const all = levelsFromTargets(shot, req, maxLevel);
  return all.length === 1 ? all[0] : null;
}

const squash = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Letters text recognition mixes up, made the same: 0 and o, 1, i and l, 5 and s, 8 and b, 2 and z,
 * 6 and g, rn and m, vv and w, cl and d.
 */
const LOOKALIKE: Array<[RegExp, string]> = [
  [/rn/g, 'm'],
  [/vv/g, 'w'],
  [/cl/g, 'd'],
  [/0/g, 'o'],
  [/[1il|!]/g, 'l'],
  [/5/g, 's'],
  [/8/g, 'b'],
  [/2/g, 'z'],
  [/6/g, 'g'],
];
const shape = (s: string) => LOOKALIKE.reduce((t, [re, to]) => t.replace(re, to), squash(s));

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/**
 * Whether the screenshot's name is the player's, allowing for a letter or two misread by OCR
 * (look-alike letters don't count against it).
 */
export function sameName(saved: string, seen: string): boolean {
  const a = shape(saved);
  const b = shape(seen);
  if (!a || !b) return false;
  if (a === b) return true;
  const slack = a.length >= 8 ? 2 : a.length >= 4 ? 1 : 0;
  return distance(a, b) <= slack;
}

/**
 * Whether the name is inside a run of text OCR ran together ("lv110blossom42account"), allowing
 * the same misreads: some stretch of it about the name's length matches.
 */
function nameWithin(saved: string, text: string): boolean {
  const a = shape(saved);
  const b = shape(text);
  if (a.length < 4 || b.length <= a.length) return false;
  if (b.includes(a)) return true;
  const slack = a.length >= 8 ? 2 : 1;
  for (let len = a.length - 1; len <= a.length + 1; len++)
    for (let i = 0; i + len <= b.length; i++) if (distance(a, b.slice(i, i + len)) <= slack) return true;
  return false;
}

/**
 * The level to trust. The badge, when the bars agree with it or (if they didn't read) what's left
 * fits it: a level can't have more to go than it asks for. The badge with a first digit the
 * reader dropped ("10" read off a "110" badge). The bars' level when they point to one. Null when
 * nothing fits: the player sets it.
 */
export function settleLevel(shot: ProfileShot, req: ReqFn, maxLevel: number): number | null {
  const byTargets = levelsFromTargets(shot, req, maxLevel);
  const fits = (L: number) => {
    const next = L >= 1 && L < maxLevel ? req(L + 1) : null;
    if (!next) return false;
    if (byTargets.length) return byTargets.includes(L);
    return (shot.stepsToGo == null || shot.stepsToGo <= next.steps) && (shot.flowersToGo == null || shot.flowersToGo <= next.flowers);
  };
  if (shot.level != null) {
    if (fits(shot.level)) return shot.level;
    for (const lead of ['1', '2', '3', '4', '5', '6', '7', '8', '9']) {
      const L = Number(lead + String(shot.level));
      if (L <= maxLevel && fits(L)) return L;
    }
  }
  return byTargets.length === 1 ? byTargets[0] : null;
}

/**
 * The screenshot made ready to use: the level settled, and, up to level 100 where the game counts
 * lifetime steps, the steps to go worked out from "Total steps" when no line said so.
 */
export function finishShot(shot: ProfileShot, req: ReqFn, maxLevel: number): ProfileShot {
  const level = settleLevel(shot, req, maxLevel);
  const next = level != null ? req(level + 1) : null;
  let stepsToGo = shot.stepsToGo;
  if (level != null && next?.stepsMode === 'lifetime' && shot.totalSteps != null && (stepsToGo == null || stepsToGo === 0)) {
    const target = shot.walkLifetime && shot.walkTarget != null && shot.walkSlack === 0 ? shot.walkTarget : cumulativeStepsTo(req, level + 1);
    stepsToGo = Math.max(0, target - shot.totalSteps);
  }
  // A level without a quest has none to go, whatever the reader made of the screen.
  const quest = next && !questOf(next.task) ? null : shot.quest;
  return { ...shot, level, stepsToGo, quest };
}
