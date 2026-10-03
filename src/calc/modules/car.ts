import { Q } from '../../questions/ids';
import type { CalcContext } from '../context';
import { pct } from '../money';
import { resolvePaid, weakEvidence } from '../reimbursement';

/**
 * Home-to-work exceptions ticked (multi choice). Answers saved while the question was single
 * choice are a plain string; they are read as a one-item list so nothing entered is lost.
 */
export function carExceptions(a: { list(id: string): string[] | undefined; string(id: string): string | undefined }): string[] {
  const list = a.list(Q.ded.carException);
  if (list) return list;
  const one = a.string(Q.ded.carException);
  return one ? [one] : [];
}

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
    cx.markUncertain(Q.ded.carKm, Q.ded.carKm2, Q.ded.carTotalCosts, Q.ded.carTotalCosts2);
    cx.lines.review({ id: 'ded.car', section: 'deductions', label: 'Car expenses', amountCents: amount, ruleId: `${rules.fy}.car`, inputs: [...inputs, ...ids], formula, note: reason, category: 'car' });
    return 0;
  };
  const toExcluded = (reason: string, ids: string[], amount: number, formula: string) => {
    cx.setStatus('car', 'computed');
    cx.lines.excluded({ id: 'ded.car', section: 'deductions', label: 'Car expenses', amountCents: amount, ruleId: `${rules.fy}.car`, inputs: [...inputs, ...ids], formula, note: reason, category: 'car' });
    return 0;
  };

  type Detail = Record<string, string | number | boolean | null | undefined>;
  type CarPart =
    | { kind: 'ok'; gross: number; formula: string; detail: Detail; ids: string[] }
    | { kind: 'review'; reason: string; ids: string[]; amount: number; formula: string }
    | { kind: 'excluded'; reason: string; ids: string[]; amount: number; formula: string };
  const rate = rules.carCentsPerKm;
  const twoCars = cx.a.string(Q.ded.carCount) === 'two' && (method === 'cents_per_km' || method === 'logbook');
  // The second car may use a different method; answers saved before it was asked use the first car's.
  const method2 = twoCars ? (cx.a.string(Q.ded.carMethod2) ?? (cx.a.has(Q.ded.carMethod2) ? undefined : method)) : undefined;

  // Cents per km for one car: its own 5,000 km cap; home-to-work trips need an exception.
  const centsPerKm = (n: 1 | 2): CarPart => {
    const kmId = n === 1 ? Q.ded.carKm : Q.ded.carKm2;
    const carKm = cx.a.number(kmId);
    const name = twoCars ? `car ${n}: ` : '';
    if (carKm === undefined) return { kind: 'review', reason: `${twoCars ? `Car ${n}: w` : 'W'}ork kilometres not answered.`, ids: [kmId], amount: 0, formula: `${name}km x rate (km missing)` };
    const capped = Math.min(carKm, rules.carMaxKm);
    const kmText = `${capped} km${carKm > rules.carMaxKm ? ` (capped from ${carKm})` : ''}`;
    const amount = capped * rate;
    const trips = cx.a.list(Q.ded.carTripTypes);
    if (!trips || trips.length === 0 || trips.includes('not_sure')) {
      return { kind: 'review', reason: 'Trip types not answered, so home-to-work travel cannot be separated.', ids: [Q.ded.carTripTypes], amount, formula: `${name}${carKm} km x ${rate}c (trip types missing)` };
    }
    const ids: string[] = [kmId, Q.ded.carTripTypes];
    if (trips.every((t) => t === 'none')) {
      return { kind: 'excluded', reason: 'No work trips were ticked, so no car kilometres are claimed.', ids: [Q.ded.carTripTypes], amount, formula: `${name}${carKm} km (no work trips)` };
    }
    if (trips.includes('other')) {
      return { kind: 'review', reason: 'An "other" kind of car trip needs checking before the kilometres are claimed.', ids: [Q.ded.carTripTypes], amount, formula: `${name}${carKm} km (other trips) x ${rate}c` };
    }
    // Home-to-work trips, and trips justified by carrying bulky tools, both need an exception:
    // bulky tools count only when the employer required them and there was no secure storage at work.
    if (trips.includes('home_to_work') || trips.includes('bulky_tools')) {
      const exceptions = carExceptions(cx.a);
      // Bulky tools with no storage, or itinerant work, each make the trips work travel on their own.
      const exceptionApplies = exceptions.includes('bulky_no_storage') || exceptions.includes('itinerant');
      // "Home as a base of work" is rare and depends on the facts (starting some work at home is
      // not enough), so when it is the only exception it is never accepted automatically: review.
      if (!exceptionApplies && exceptions.includes('home_base')) {
        return { kind: 'review', reason: 'Home-to-work trips with a claimed "home base" exception: whether home was a genuine base of work depends on the actual conditions, so this is assessed manually.', ids: [Q.ded.carException, ...ids], amount, formula: `${name}${carKm} km (home-base exception to be assessed) x ${rate}c` };
      }
      if (!exceptionApplies && (exceptions.includes('not_sure') || cx.a.isNotSure(Q.ded.carException))) {
        return { kind: 'review', reason: 'Not sure whether an exception applied to the home-to-work trips; they are held for review, not claimed or dropped.', ids: [Q.ded.carException, ...ids], amount, formula: `${name}${carKm} km (exception not confirmed) x ${rate}c` };
      }
      if (!exceptionApplies) {
        if (trips.every((t) => t === 'home_to_work' || t === 'bulky_tools')) return { kind: 'excluded', reason: 'Ordinary home-to-work travel is private and cannot be claimed.', ids: [Q.ded.carTripTypes, Q.ded.carException], amount, formula: `${name}${carKm} km home-to-work x ${rate}c (excluded)` };
        return { kind: 'review', reason: 'Kilometres include home-to-work trips with no exception; the work-only kilometres must be separated before claiming.', ids: [Q.ded.carTripTypes, Q.ded.carException, kmId], amount, formula: `${name}${carKm} km (mixed trips) x ${rate}c` };
      }
      ids.push(Q.ded.carException);
    }
    return { kind: 'ok', gross: amount, formula: `${name}${kmText} x ${rate}c`, detail: { method: 'cents_per_km', km: carKm, cappedKm: capped, centsPerKm: rate, tripTypes: trips.join(',') }, ids };
  };

  // Logbook for one car: that car's own costs x its own logbook percentage.
  const logbook = (n: 1 | 2): CarPart => {
    const costsId = n === 1 ? Q.ded.carTotalCosts : Q.ded.carTotalCosts2;
    const pctId = n === 1 ? Q.ded.carLogbookPct : Q.ded.carLogbookPct2;
    const costs = cx.a.cents(costsId);
    const lp = cx.a.number(pctId);
    const name = twoCars ? `car ${n}: ` : '';
    if (costs === undefined || lp === undefined) return { kind: 'review', reason: `${twoCars ? `Car ${n}: the` : 'The'} logbook method needs total car costs and the logbook work percentage.`, ids: [costsId, pctId], amount: costs ?? 0, formula: `${name}total costs x logbook % (missing)` };
    return { kind: 'ok', gross: pct(costs, lp), formula: `${name}${costs / 100} x ${lp}% logbook`, detail: { method: 'logbook', totalCostsCents: costs, logbookPct: lp }, ids: [costsId, pctId] };
  };

  const partFor = (n: 1 | 2, m: string | undefined): CarPart => {
    if (m === 'cents_per_km') return centsPerKm(n);
    if (m === 'logbook') return logbook(n);
    const id = n === 1 ? Q.ded.carMethod : Q.ded.carMethod2;
    return { kind: 'review', reason: cx.a.isNotSure(id) ? `Not sure which method applies${n === 2 ? ' to the second car' : ''}.` : `${n === 2 ? 'Second car' : 'Car'} method not answered.`, ids: [id], amount: 0, formula: 'method unknown' };
  };

  const parts = twoCars ? [partFor(1, method), partFor(2, method2)] : [partFor(1, method)];
  const extraIds = twoCars ? [Q.ded.carCount, Q.ded.carMethod2] : [];
  const reviewPart = parts.find((p): p is Extract<CarPart, { kind: 'review' }> => p.kind === 'review');
  if (reviewPart) {
    const amount = parts.reduce((sum, p) => sum + (p.kind === 'ok' ? p.gross : p.amount), 0);
    return toReview(reviewPart.reason, [...extraIds, ...parts.flatMap((p) => p.ids)], amount, parts.map((p) => p.formula).join(' + '));
  }
  const okParts = parts.filter((p): p is Extract<CarPart, { kind: 'ok' }> => p.kind === 'ok');
  if (okParts.length === 0) {
    const ex = parts.find((p): p is Extract<CarPart, { kind: 'excluded' }> => p.kind === 'excluded')!;
    return toExcluded(ex.reason, [...extraIds, ...parts.flatMap((p) => p.ids)], parts.reduce((sum, p) => sum + (p.kind === 'excluded' ? p.amount : 0), 0), parts.map((p) => p.formula).join(' + '));
  }
  const excludedParts = parts.filter((p): p is Extract<CarPart, { kind: 'excluded' }> => p.kind === 'excluded');
  const gross = okParts.reduce((sum, p) => sum + p.gross, 0);
  const formula = parts.map((p) => p.formula).join(' + ');
  const detail: Detail = twoCars
    ? { method: method === method2 ? method : 'mixed', cars: 2, car1Method: method, car2Method: method2, ...Object.fromEntries(parts.flatMap((p, i) => (p.kind === 'ok' ? Object.entries(p.detail).map(([k, v]) => [`car${i + 1}${k[0]!.toUpperCase()}${k.slice(1)}`, v]) : []))) }
    : okParts[0]!.detail;
  const extraInputs = [...extraIds, ...parts.flatMap((p) => p.ids)];
  const methodLabel = twoCars && method !== method2 ? `car 1 ${method === 'logbook' ? 'logbook' : 'cents per km'}, car 2 ${method2 === 'logbook' ? 'logbook' : 'cents per km'}` : method === 'logbook' ? 'logbook' : 'cents per km';
  const exclusionNote = excludedParts.length ? excludedParts.map((p) => p.reason).join(' ') : undefined;

  const paid = resolvePaid(cx, CAR_BASE, null, gross);
  if (paid.kind === 'excluded') return toExcluded(paid.note ?? 'Reimbursed.', paid.inputs, gross, formula);
  if (paid.kind === 'review') return toReview(paid.note ?? 'Reimbursement unknown.', paid.inputs, gross, formula);
  const net = paid.netCents;
  if (weakEvidence(cx, CAR_BASE, null)) cx.markUncertain(Q.ded.carKm, Q.ded.carKm2, Q.ded.carTotalCosts, Q.ded.carTotalCosts2);
  cx.setStatus('car', 'computed');
  cx.lines.computed({
    id: 'ded.car', section: 'deductions', label: `Car expenses (${methodLabel})`, amountCents: net,
    ruleId: `${rules.fy}.car`, inputs: [...inputs, ...extraInputs, ...paid.inputs], formula: paid.reimbursedCents ? `${formula} - ${paid.reimbursedCents / 100} reimbursed` : formula,
    category: 'car', detail, ...(paid.note || exclusionNote ? { note: [paid.note, exclusionNote].filter(Boolean).join(' ') } : {}),
  });
  return net;
}
