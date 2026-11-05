// ─── Domain types shared by the engine, storage and UI ───
// The engine (src/engine) is pure TypeScript with no React or native imports.

/** How a level's step requirement counts. */
export type StepsMode =
  /** Levels 3-100: "Walk a total of X steps". Lifetime total, so extra steps carry over. */
  | 'lifetime'
  /** Levels 101+: "Walk X steps" while at the level. Extra steps are lost at level-up. */
  | 'perLevel';

export type LevelSource = 'wiki' | 'game' | 'estimated';

/** Bundled, read-only. `level` is the level this row unlocks (what you do at level-1). */
export interface LevelRow {
  level: number;
  steps: number;
  flowers: number;
  task: string;
  cumulativeSteps?: number;
  stepsMode: StepsMode;
  source: LevelSource;
  wikiRow?: number;
  note?: string;
}

export interface Extrapolation {
  method: 'geometric' | 'linear';
  // geometric
  anchorLevel?: number;
  stepsBase?: number;
  flowersBase?: number;
  ratio?: number;
  // linear (schema v1)
  fromLevel?: number;
  stepsPerLevel?: number;
  flowersPerLevel?: number;
}

export interface LevelTable {
  version: number;
  maxLevel: number;
  retrieved: string;
  sourceUrl: string;
  notes: string[];
  rules: { stepsCarryOver?: string; flowersCarryOver?: string };
  extrapolation: Extrapolation;
  /** Indexed by level. Every level 1..maxLevel is present (gaps are filled by extrapolation). */
  byLevel: Record<number, LevelRow>;
}

export interface LevelOverride {
  level: number;
  steps: number | null;
  flowers: number | null;
  recordedAt: string;
}
export type Overrides = Record<number, LevelOverride>;

/** What it takes to reach `level`, after applying any user override. */
export interface Requirement {
  level: number;
  steps: number;
  flowers: number;
  task: string;
  stepsMode: StepsMode;
  source: LevelSource;
  overridden: boolean;
  bundledSteps: number;
  bundledFlowers: number;
}

export type ReqFn = (level: number) => Requirement | null;

export interface Rates {
  walkStepsPerHour: number | null;
  bikeFlowersPerHour: number | null;
  walkFlowersPerHour: number | null;
  treadmillAvailable: boolean;
  /** Rides a bike for flowers. Missing means yes (setups from before this choice existed). */
  bikes?: boolean;
}

export interface ResolvedRates {
  walkStepsPerHour: number;
  bikeFlowersPerHour: number;
  walkFlowersPerHour: number;
  treadmillAvailable: boolean;
  /** Rides a bike for flowers; without one, flowers come from walking, on any day. */
  bikes: boolean;
  /** Which of the rates in use are defaults because the user said 'Not sure yet'. */
  estimated: Array<keyof Omit<Rates, 'treadmillAvailable' | 'bikes'>>;
}

export interface Profile {
  /** Snapshot at setup: the level the user was at. */
  currentLevel: number;
  /** Snapshot at setup: progress toward currentLevel+1's step requirement (may exceed it for lifetime levels). */
  stepsIntoLevel: number;
  /** Snapshot at setup: progress toward currentLevel+1's flower requirement. */
  flowersIntoLevel: number;
  /** Steps/flowers already done on the setup day when the snapshot was taken (not counted again from that day's log). */
  setupTodaySteps: number;
  setupTodayFlowers: number;
  lifetimeSteps: number | null;
  lifetimeFlowers: number | null;
  goalLevel: number;
  /** yyyy-MM-dd */
  goalDate: string;
  rates: Rates;
  /** ISO datetime */
  createdAt: string;
  /** yyyy-MM-dd, local calendar day of setup */
  startDate: string;
  /** At the top level: the user's own steps-and-flowers goal. */
  customGoal?: CustomGoal | null;
}

/** A goal past the top level: so many steps and flowers between two dates (yyyy-MM-dd, inclusive). */
export interface CustomGoal {
  steps: number;
  flowers: number;
  startDate: string;
  endDate: string;
}

export type OutMode = 'bike' | 'walk';

export interface DayEntry {
  /** yyyy-MM-dd, unique */
  date: string;
  steps: number;
  flowers: number;
  leveledUp: boolean;
  newLevel: number | null;
  note: string | null;
  /** Optional: minutes spent out planting, to learn real rates. */
  minutesOut: number | null;
  outMode: OutMode | null;
  /** Optional sync: what the game showed as remaining after this day. */
  gameStepsToGo: number | null;
  gameFlowersToGo: number | null;
  /** Optional sync: the level's quest (mushrooms, expeditions, ...) still to go after this day. */
  gameTaskToGo?: number | null;
}

export type SeasonSource = 'climate' | 'manual' | 'default';
export interface SeasonRate {
  /** 1-12 */
  month: number;
  /** 0..1 */
  rideable: number;
  source: SeasonSource;
  sampleDays?: number;
}

export interface PlayLocation {
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
  elevation: number | null;
  resolvedAt: string;
  climateYears: number;
}

export type ThresholdPreset = 'fair' | 'normal' | 'all';

/** Progress toward the next level. */
export interface LevelState {
  level: number;
  steps: number;
  flowers: number;
}
