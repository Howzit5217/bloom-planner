import type { ResolvedRates } from './types';

export interface TimeCost {
  /** Hours on the bike to plant the day's flowers, on a day you ride (0 without a bike). */
  bikeHours: number;
  /**
   * Hours of walking for the day's steps. The same whether or not you ride: Pikmin Bloom's steps
   * come from the phone's step counter, and a bike ride earns none. Without a bike, the walking
   * plants the flowers too, so it's whichever of the two takes longer.
   */
  walkHours: number;
  /** Walking is indoors (treadmill) or outdoors. */
  walkWhere: 'indoor' | 'outdoor';
  /**
   * A day on foot (no bike, or not riding that day): walking outside until the day's flowers are
   * planted (only walking outside plants them, and it counts steps too), then any steps still to
   * go, indoors when there's a treadmill. Its total is never less than the steps alone take.
   */
  footDay: { outside: number; moreSteps: number; total: number };
  /** Biking plus walking on a ride day. */
  totalRideDay: number;
  /** More than 6 hours of movement on a ride day. */
  implausible: boolean;
}

/**
 * §7.4 Time cost of a day's targets.
 * stepsPerDay: steps planned for the day. flowersPerRideDay: flowers to plant if you ride.
 */
export function timeCost(stepsPerDay: number, flowersPerRideDay: number, rates: Pick<ResolvedRates, 'walkStepsPerHour' | 'bikeFlowersPerHour' | 'walkFlowersPerHour' | 'treadmillAvailable' | 'bikes'>): TimeCost {
  const flowers = Math.max(0, flowersPerRideDay);
  const forSteps = Math.max(0, stepsPerDay) / Math.max(1, rates.walkStepsPerHour);
  const bikeHours = rates.bikes && rates.bikeFlowersPerHour > 0 ? flowers / rates.bikeFlowersPerHour : 0;
  const outside = flowers / Math.max(1, rates.walkFlowersPerHour);
  const moreSteps = Math.max(0, forSteps - outside);
  const footDay = { outside, moreSteps, total: outside + moreSteps };
  const walkHours = rates.bikes ? forSteps : footDay.total;
  const totalRideDay = bikeHours + walkHours;
  return {
    bikeHours,
    walkHours,
    walkWhere: rates.treadmillAvailable ? 'indoor' : 'outdoor',
    footDay,
    totalRideDay,
    implausible: totalRideDay > 6,
  };
}
