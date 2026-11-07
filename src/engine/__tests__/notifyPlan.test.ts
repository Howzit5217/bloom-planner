import bundled from '../../data/bloom-levels.json';
import { fmt, roundNice } from '../format';
import { makeReq, parseLevelTable } from '../levels';
import { CATCH_UP_HOUR, planNotifications } from '../notifyPlan';
import { buildPlan, plannedForDay } from '../plan';
import type { Dashboard } from '../summary';

const prefs = { enabled: true, hour: 20, minute: 30, nudges: false, behind: false, milestones: false, lastBehindAlert: null, nudgeDates: [], lastMilestoneLevel: null };
const dash = (over: Partial<Dashboard> = {}) =>
  ({ today: '2026-11-07', phase: 'active', loggedToday: false, todayEntry: null, nextMilestone: null, standing: { verdict: 'onTrack', displayDays: 0 }, rates: { bikes: true }, ...over }) as unknown as Dashboard;
const plan = (d: Dashboard, now = new Date(2026, 10, 7, 9, 0)) => planNotifications({ prefs, dash: d, seasonRates: new Array(12).fill(0.5), forecast: [], preset: 'normal', now });
const mornings = (d: Dashboard) => plan(d).filter((n) => n.kind === 'catchup');

describe('the morning reminder for a day not logged', () => {
  it('asks at 8 the next morning, and every morning after while the app stays closed', () => {
    const m = mornings(dash());
    expect(m[0]).toMatchObject({ date: '2026-11-08', hour: CATCH_UP_HOUR, minute: 0 });
    expect(m.map((n) => n.date)).toContain('2026-11-09');
    // Never this morning: the app is open now.
    expect(m.some((n) => n.date === '2026-11-07')).toBe(false);
  });

  it("doesn't ask about today once it's logged, nor once there's no plan to keep up with", () => {
    expect(mornings(dash({ loggedToday: true })).some((n) => n.date === '2026-11-08')).toBe(false);
    expect(mornings(dash({ phase: 'goalReached' } as Partial<Dashboard>))).toEqual([]);
    expect(planNotifications({ prefs: { ...prefs, enabled: false }, dash: dash(), seasonRates: [], forecast: [], preset: 'normal', now: new Date() })).toEqual([]);
  });
});

describe('the evening check-in', () => {
  const req = makeReq(parseLevelTable(bundled), {});
  const realPlan = buildPlan({ start: { level: 110, steps: 0, flowers: 0 }, startKey: '2026-11-07', goalKey: '2028-02-14', goalLevel: 130, seasonRates: new Array(12).fill(1), req });

  it("says the day's target, as the Today card does", () => {
    const daily = plan(dash({ plan: realPlan } as Partial<Dashboard>)).filter((n) => n.kind === 'daily');
    const p = plannedForDay(realPlan, 0);
    expect(daily[0].date).toBe('2026-11-07');
    expect(daily[0].body).toBe(`Today's target: ${fmt(roundNice(p.steps))} steps · ${fmt(roundNice(p.flowersIfRiding))} flowers if you ride. Pop in your steps and flowers.`);
  });

  it('just asks, with no plan to quote', () => {
    expect(plan(dash()).find((n) => n.kind === 'daily')?.body).toBe('Pop in your steps and flowers.');
  });
});
