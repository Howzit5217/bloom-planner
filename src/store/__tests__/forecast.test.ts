import { fetchPlanForecast } from '@/services/climateApi';
import { useForecast, type SavedForecast } from '../forecast';

jest.mock('@/services/climateApi', () => ({ fetchPlanForecast: jest.fn() }));
jest.mock('@/storage/db', () => ({ kvGet: jest.fn(async () => null), kvSet: jest.fn(async () => {}) }));

const fetchMock = fetchPlanForecast as jest.MockedFunction<typeof fetchPlanForecast>;
const place = { latitude: 40, longitude: -90, timezone: 'America/Chicago' };
const day = (date: string, precipChance: number) => ({ date, precipChance }) as unknown as SavedForecast['days'][number];
const saved = (at: Date, days = [day('2026-11-11', 20)]): SavedForecast => ({ days, at: at.getTime(), latitude: place.latitude, longitude: place.longitude });

describe('the plan forecast', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date(2026, 10, 11, 15, 0) });
    fetchMock.mockReset();
    useForecast.setState({ days: null, saved: null, loaded: false });
  });
  afterEach(() => jest.useRealTimers());

  it('is there from the start: the saved one comes with the rest of the app', () => {
    const s = saved(new Date(2026, 10, 11, 8, 0));
    useForecast.getState().seed(s, place);
    expect(useForecast.getState().days).toBe(s.days);
  });

  it("keeps the day's first forecast all day, so the target holds still", async () => {
    const s = saved(new Date(2026, 10, 11, 8, 0));
    useForecast.getState().seed(s, place);
    await useForecast.getState().refresh(place);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useForecast.getState().days).toBe(s.days);
  });

  it("fetches the day's forecast once, the last one standing in until then", async () => {
    const yesterday = saved(new Date(2026, 10, 10, 20, 0));
    const fresh = [day('2026-11-11', 70)];
    fetchMock.mockResolvedValue(fresh);
    useForecast.getState().seed(yesterday, place);
    expect(useForecast.getState().days).toBe(yesterday.days);
    await useForecast.getState().refresh(place);
    expect(useForecast.getState().days).toBe(fresh);
    await useForecast.getState().refresh(place);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fetches again for a new place', async () => {
    useForecast.getState().seed(saved(new Date(2026, 10, 11, 8, 0)), place);
    fetchMock.mockResolvedValue([day('2026-11-11', 10)]);
    await useForecast.getState().refresh({ ...place, latitude: 41 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('lets go of a forecast more than two days old', () => {
    useForecast.getState().seed(saved(new Date(2026, 10, 8, 8, 0)), place);
    expect(useForecast.getState().days).toBeNull();
  });
});
