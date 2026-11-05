import type { ResolvedRates } from './types';

export interface TimeCost {
  /** Hours on the bike on a day you ride. */
  bikeHours: number;
  /** Steps the ride itself credits. */
  stepsFromBiking: number;
  /** Steps left to walk on a ride day. */
  walkHoursRideDay: number;
  /** Steps left to walk on a day you don't ride. */
  walkHoursRestDay: number;
  /** §7.4 average day: bike time amortised over all days, plus indoor/outdoor walking. */
  avgBikeHoursPerDay: number;
  avgWalkHoursPerDay: number;
  /** Walking is indoors (treadmill) or outdoors. */
  walkWhere: 'indoor' | 'outdoor';
  /** Total on a ride day > 6h. */
  implausible: boolean;
  totalRideDay: number;
}

/**
 * §7.4 Time cost of a day's targets.
 * stepsPerDay: steps planned for the day. flowersPerRideDay: flowers to plant if you ride.
 * rideShare: rideableDays / calendarDays (for the amortised average).
 */
export function timeCost(stepsPerDay: number, flowersPerRideDay: number, rideShare: number, rates: ResolvedRates): TimeCost {
  const bikeHours = rates.bikeFlowersPerHour > 0 ? flowersPerRideDay / rates.bikeFlowersPerHour : 0;
  const stepsFromBiking = bikeHours * rates.bikeStepsPerHour;
  const walkSph = Math.max(1, rates.walkStepsPerHour);
  const walkHoursRideDay = Math.max(0, stepsPerDay - stepsFromBiking) / walkSph;
  const walkHoursRestDay = Math.max(0, stepsPerDay) / walkSph;
  const share = Math.min(1, Math.max(0, rideShare));
  const amortisedBikeSteps = stepsFromBiking * share;
  const avgWalkHoursPerDay = Math.max(0, stepsPerDay - amortisedBikeSteps) / walkSph;
  const totalRideDay = bikeHours + walkHoursRideDay;
  return {
    bikeHours,
    stepsFromBiking,
    walkHoursRideDay,
    walkHoursRestDay,
    avgBikeHoursPerDay: bikeHours * share,
    avgWalkHoursPerDay,
    walkWhere: rates.treadmillAvailable ? 'indoor' : 'outdoor',
    implausible: totalRideDay > 6 || walkHoursRestDay > 6,
    totalRideDay,
  };
}
