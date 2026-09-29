import { Q } from '../../questions/ids';
import type { CalcContext } from '../context';
import { pct } from '../money';
import { resolvePaid, weakEvidence } from '../reimbursement';

const CAR_BASE = 'ded.car';

/**
 * Car expenses.
 * - cents per km: sum over up to two cars of min(km, carMaxKm) x carCentsPerKm, only when the trip types are answered and do
 *   not include ordinary home-to-work travel (or an exception applies: bulky tools with no secure
 *   storage, itinerant work, home as a work base).
 * - logbook: total costs x logbook %.
 * Reimbursement via ded.car.paid. Returns the deductible cents.
 */
export function computeCar(cx: CalcContext): number {
  const rules = cx.rules;
  const any = cx.a.string(Q.ded.carAny);
  const method = cx.a.string(Q.ded.carMethod);
  const km = cx.a.number(Q.ded.carKm);
  if (any !== 'yes' && method === undefined && km === undefined && cx.a.cents(Q.ded.carTotalCosts) === undefined) {
    if (cx.a.isNotSure(Q.ded.carAny)) {
      cx.setStatus('car', 'manual_review');
      cx.review('car', 'Not sure whether there were work-related car trips.', [Q.ded.carAny]);
    } else cx.setStatus('car', 'not_applicable');
    return 0;
  }
  if (any === 'no') {
    cx.setStatus('car', 'not_applicable');
    return 0;
  }
  const inputs = [Q.ded.carAny, Q.ded.carMethod];
  const toReview = (reason: string, ids: string[], amount: number, formula: string) => {
    cx.setStatus('car', 'manual_review');
    cx.review('car', reason, ids, amount);
    cx.markUncertain(Q.ded.carKm, Q.ded.carKm2, Q.ded.carTotalCosts);
    cx.lines.review({ id: 'ded.car', section: 'deductions', label: 'Car expenses', amountCents: amount, ruleId: `${rules.fy}.car`, inputs: [...inputs, ...ids], formula, note: reason, category: 'car' });
    return 0;
  };
  const toExcluded = (reason: string, ids: string[], amount: number, formula: string) => {
    cx.setStatus('car', 'computed');
    cx.lines.excluded({ id: 'ded.car', section: 'deductions', label: 'Car expenses', amountCents: amount, ruleId: `${rules.fy}.car`, inputs: [...inputs, ...ids], formula, note: reason, category: 'car' });
    return 0;
  };

  let gross: number;
  let formula: string;
  let detail: Record<string, string | number | boolean | null | undefined>;
  const extraInputs: string[] = [];
  if (method === 'cents_per_km') {
    if (km === undefined) return toReview('Work kilometres not answered.', [Q.ded.carKm], 0, 'km x rate (km missing)');
    const twoCars = cx.a.string(Q.ded.carCount) === 'two';
    const km2 = twoCars ? cx.a.number(Q.ded.carKm2) : undefined;
    const rate = rules.carCentsPerKm;
    // The 5,000 km cap applies to each car separately.
    const cars = twoCars && km2 !== undefined ? [km, km2] : [km];
    const cappedKm = cars.reduce((sum, k) => sum + Math.min(k, rules.carMaxKm), 0);
    const totalKm = cars.reduce((sum, k) => sum + k, 0);
    const kmText = cars.length === 2 ? `(${cars.map((k) => `${Math.min(k, rules.carMaxKm)}${k > rules.carMaxKm ? ` capped from ${k}` : ''}`).join(' + ')}) km` : `${cappedKm} km${km > rules.carMaxKm ? ` (capped from ${km})` : ''}`;
    const kmIds = twoCars ? [Q.ded.carKm, Q.ded.carCount, Q.ded.carKm2] : [Q.ded.carKm];
    if (twoCars && km2 === undefined) return toReview('Second car kilometres not answered.', [Q.ded.carKm2], cappedKm * rate, `${kmText} x ${rate}c (second car km missing)`);
    const trips = cx.a.list(Q.ded.carTripTypes);
    if (!trips || trips.length === 0 || trips.includes('not_sure')) {
      return toReview('Trip types not answered, so home-to-work travel cannot be separated.', [Q.ded.carTripTypes], cappedKm * rate, `${totalKm} km x ${rate}c (trip types missing)`);
    }
    if (trips.includes('home_to_work')) {
      const exception = cx.a.string(Q.ded.carException);
      const exceptionApplies = exception === 'bulky_no_storage' || exception === 'itinerant' || exception === 'home_base';
      const onlyHomeToWork = trips.every((t) => t === 'home_to_work');
      if (!exceptionApplies) {
        const amount = cappedKm * rate;
        if (onlyHomeToWork) return toExcluded('Ordinary home-to-work travel is private and cannot be claimed.', [Q.ded.carTripTypes, Q.ded.carException], amount, `${totalKm} km home-to-work x ${rate}c (excluded)`);
        return toReview('Kilometres include home-to-work trips with no exception; the work-only kilometres must be separated before claiming.', [Q.ded.carTripTypes, Q.ded.carException, ...kmIds], amount, `${totalKm} km (mixed trips) x ${rate}c`);
      }
      extraInputs.push(Q.ded.carException);
    }
    gross = cappedKm * rate;
    formula = `${kmText} x ${rate}c`;
    detail = { method: 'cents_per_km', cars: cars.length, km: totalKm, cappedKm, centsPerKm: rate, tripTypes: trips.join(','), ...(cars.length === 2 ? { car1Km: km, car2Km: km2 } : {}) };
    extraInputs.push(...kmIds, Q.ded.carTripTypes);
  } else if (method === 'logbook') {
    const costs = cx.a.cents(Q.ded.carTotalCosts);
    const lp = cx.a.number(Q.ded.carLogbookPct);
    if (costs === undefined || lp === undefined) return toReview('Logbook method needs total car costs and the logbook work percentage.', [Q.ded.carTotalCosts, Q.ded.carLogbookPct], costs ?? 0, 'total costs x logbook % (missing)');
    gross = pct(costs, lp);
    formula = `${costs / 100} x ${lp}% logbook`;
    detail = { method: 'logbook', totalCostsCents: costs, logbookPct: lp };
    extraInputs.push(Q.ded.carTotalCosts, Q.ded.carLogbookPct);
  } else {
    return toReview(cx.a.isNotSure(Q.ded.carMethod) ? 'Not sure which car method applies.' : 'Car method not answered.', [Q.ded.carMethod], 0, 'method unknown');
  }

  const paid = resolvePaid(cx, CAR_BASE, null, gross);
  if (paid.kind === 'excluded') return toExcluded(paid.note ?? 'Reimbursed.', paid.inputs, gross, formula);
  if (paid.kind === 'review') return toReview(paid.note ?? 'Reimbursement unknown.', paid.inputs, gross, formula);
  const net = paid.netCents;
  if (weakEvidence(cx, CAR_BASE, null)) cx.markUncertain(Q.ded.carKm, Q.ded.carKm2, Q.ded.carTotalCosts);
  cx.setStatus('car', 'computed');
  cx.lines.computed({
    id: 'ded.car', section: 'deductions', label: `Car expenses (${method === 'logbook' ? 'logbook' : 'cents per km'})`, amountCents: net,
    ruleId: `${rules.fy}.car`, inputs: [...inputs, ...extraInputs, ...paid.inputs], formula: paid.reimbursedCents ? `${formula} - ${paid.reimbursedCents / 100} reimbursed` : formula,
    category: 'car', detail, ...(paid.note ? { note: paid.note } : {}),
  });
  return net;
}
