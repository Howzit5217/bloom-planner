import { addDaysKey } from '../dates';
import { doneFromToGo, looksLikeLevelUp, missedDay, rebalanceNext, stateBefore, toGoAtDayEnd } from '../leftLog';
import { replayLog } from '../progress';
import { questOf } from '../quest';
import { entry, profile, reqOf, table } from './helpers';

const t = table([
  { level: 3, steps: 1000, flowers: 100 },
  { level: 4, steps: 2000, flowers: 200 },
  { level: 5, steps: 3000, flowers: 300 },
]);
const req = reqOf(t);
const p = profile({ currentLevel: 2, goalLevel: 5, stepsIntoLevel: 200, flowersIntoLevel: 10 });

describe('level quests', () => {
  it('reads every task pattern in the level file', () => {
    expect(questOf('Clear 15 mushrooms')).toEqual({ kind: 'mushrooms', count: 15 });
    expect(questOf('Destroy 1 mushroom')).toEqual({ kind: 'mushrooms', count: 1 });
    expect(questOf('Complete 3 expedition(s)')).toEqual({ kind: 'expeditions', count: 3 });
    expect(questOf('Complete 40 expeditions')).toEqual({ kind: 'expeditions', count: 40 });
    expect(questOf('Grow 10 Pikmin')).toEqual({ kind: 'pikmin', count: 10 });
    expect(questOf('Pick 250 flower petals')).toEqual({ kind: 'petals', count: 250 });
    expect(questOf('Grow a White Seedling')).toEqual({ kind: 'seedling', count: 1 });
    expect(questOf('Tutorial')).toBeNull();
    expect(questOf('')).toBeNull();
  });

  it('keeps the logged count until a level-up, and is ready only once everything is cleared', () => {
    const tq = table([
      { level: 3, steps: 1000, flowers: 100, task: 'Clear 5 mushrooms' },
      { level: 4, steps: 2000, flowers: 200 },
    ]);
    const rq = reqOf(tq);
    const cleared = { gameStepsToGo: 0, gameFlowersToGo: 0 };
    const a = replayLog(p, [entry('2026-11-05', 0, 0, { ...cleared, gameTaskToGo: 2 })], rq, tq.maxLevel);
    expect(a.taskToGo).toBe(2);
    expect(a.readyToLevel).toBe(false);
    // Steps and flowers done but the mushrooms never logged: not ready yet.
    expect(replayLog(p, [entry('2026-11-05', 0, 0, cleared)], rq, tq.maxLevel).readyToLevel).toBe(false);
    expect(replayLog(p, [entry('2026-11-05', 0, 0, { ...cleared, gameTaskToGo: 0 })], rq, tq.maxLevel).readyToLevel).toBe(true);
    // A level with no quest needs only steps and flowers.
    expect(replayLog(p, [entry('2026-11-05', 0, 0, cleared)], req, t.maxLevel).readyToLevel).toBe(true);
    const c = replayLog(p, [entry('2026-11-05', 0, 0, { gameTaskToGo: 2 }), entry('2026-11-06', 0, 0, { leveledUp: true, newLevel: 3 })], req, t.maxLevel);
    expect(c.taskToGo).toBeNull();
  });
});

describe("the What's Left log", () => {
  it('works out the day from the change in what is left', () => {
    // 200 of 1000 steps done; the game now shows 500 to go: 300 steps that day.
    expect(doneFromToGo({ level: 2, steps: 200, flowers: 10 }, 2, 'steps', 500, req)).toBe(300);
    expect(doneFromToGo({ level: 2, steps: 200, flowers: 10 }, 2, 'flowers', 40, req)).toBe(50);
    // A level-up on the way: the rest of level 3's 1000, then 2000 - 1500 toward level 4.
    expect(doneFromToGo({ level: 2, steps: 200, flowers: 10 }, 3, 'steps', 1500, req)).toBe(800 + 500);
  });

  it('carries steps past a level into the next where the game does (up to level 100)', () => {
    const lt = table([
      { level: 3, steps: 1000, flowers: 100, stepsMode: 'lifetime' },
      { level: 4, steps: 2000, flowers: 200, stepsMode: 'lifetime' },
    ]);
    // 1,300 steps banked toward a 1,000-step level; after the level-up the game shows 1,000 of 2,000 to go:
    // 300 carried over, so 700 walked that day.
    expect(doneFromToGo({ level: 2, steps: 1300, flowers: 100 }, 3, 'steps', 1000, reqOf(lt))).toBe(700);
  });

  it('replays to exactly what the game showed', () => {
    const before = stateBefore(replayLog(p, [], req, t.maxLevel), p, '2026-11-05').state;
    const steps = doneFromToGo(before, 2, 'steps', 500, req);
    const r = replayLog(p, [entry('2026-11-05', steps, 0, { gameStepsToGo: 500 })], req, t.maxLevel);
    expect(r.state.steps).toBe(500);
  });

  it('asks about a level-up when more is left than before', () => {
    const before = { level: 2, steps: 600, flowers: 50 };
    expect(looksLikeLevelUp(before, null, req, { steps: 300, flowers: 40, task: null })).toBe(false);
    expect(looksLikeLevelUp(before, null, req, { steps: 1800, flowers: null, task: null })).toBe(true);
    expect(looksLikeLevelUp(before, null, req, { steps: null, flowers: 90, task: null })).toBe(true);
    expect(looksLikeLevelUp(before, 2, req, { steps: null, flowers: null, task: 5 })).toBe(true);
    expect(looksLikeLevelUp(before, null, req, { steps: null, flowers: null, task: 5 })).toBe(false);
  });

  it('finds where the log stood before a missed day', () => {
    const r = replayLog(p, [entry('2026-11-05', 300, 0), entry('2026-11-08', 100, 0)], req, t.maxLevel);
    expect(stateBefore(r, p, '2026-11-07').state.steps).toBe(500);
    expect(stateBefore(r, p, '2026-11-05').state.steps).toBe(200);
  });

  it('a filled-in day takes its share from the next logged day', () => {
    const next = entry('2026-11-08', 900, 30, { gameStepsToGo: 100 });
    const filled = entry('2026-11-06', 400, 10, { gameStepsToGo: 500 });
    expect(rebalanceNext([next], filled, null)).toEqual({ ...next, steps: 500 });
    // Without numbers to go, the next day was typed in by hand: leave it alone.
    expect(rebalanceNext([entry('2026-11-08', 900, 30)], filled, null)).toBeNull();
  });

  it('offers the latest missed day, or yesterday when all are logged', () => {
    const logged = [entry('2026-11-08', 1, 1), entry('2026-11-09', 1, 1)];
    expect(missedDay(logged, '2026-11-04', '2026-11-10', addDaysKey)).toBe('2026-11-07');
    expect(missedDay(logged, '2026-11-08', '2026-11-10', addDaysKey)).toBe('2026-11-09');
    expect(missedDay(logged, '2026-11-10', '2026-11-10', addDaysKey)).toBeNull();
  });
});

describe('logging an earlier day after being out today', () => {
  it("puts today's walking back on the game's numbers, so it counts for today alone", () => {
    // The game shows 600 steps to go now; 250 of them were walked today: 850 were left at the end of yesterday.
    expect(toGoAtDayEnd(600, 250, 1000)).toBe(850);
    // No further than the level can have to go.
    expect(toGoAtDayEnd(900, 400, 1000)).toBe(1000);
    // Nothing read yet, or nothing put in for today.
    expect(toGoAtDayEnd(null, 250, 1000)).toBeNull();
    expect(toGoAtDayEnd(600, null, 1000)).toBe(600);
  });

  it("works yesterday out from what's left once today's walking is back on", () => {
    const yesterday = toGoAtDayEnd(600, 250, req(3)!.steps)!;
    const before = { level: 2, steps: 0, flowers: 0 };
    expect(doneFromToGo(before, 2, 'steps', yesterday, req)).toBe(150);
  });
});
