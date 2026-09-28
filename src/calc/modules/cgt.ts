import { GROUPS, Q } from '../../questions/ids';
import { CalcContext, addDays, addMonths, parseIsoDate } from '../context';
import { mulRate, pct } from '../money';
import { residencyKind } from './tax-scale';

/**
 * 12-month test for the CGT discount: the asset must have been owned for at least 12 months
 * excluding both the acquisition day and the disposal day, i.e.
 *   disposal >= acquisition + 12 months + 1 day.
 * Example: acquired 2024-01-15 -> qualifies from 2025-01-16.
 */
export function heldAtLeast12Months(acquired: string, disposed: string): boolean | undefined {
  const a = parseIsoDate(acquired);
  const d = parseIsoDate(disposed);
  if (!a || !d) return undefined;
  return d.getTime() >= addDays(addMonths(a, 12), 1).getTime();
}

export interface CgtResult {
  netCapitalGainCents: number;
  capitalLossCarriedForwardCents: number;
}

interface Gain {
  cents: number;
  discountable: boolean;
}

/**
 * CGT: per-event gain = (proceeds - cost base) x ownership %. Current-year losses offset current
 * gains (non-discount gains first), then prior-year losses, then the discount on what remains of
 * the discountable gains. Trust capital gain components are added (discounted component grossed).
 */
export function computeCgt(cx: CalcContext): CgtResult {
  const rules = cx.rules;
  const fy = rules.fy;
  const events = cx.items(GROUPS.cgtEvent);
  const kind = residencyKind(cx);
  const gains: Gain[] = [];
  let losses = 0;
  let touched = false;
  const discountRate = rules.cgtDiscountRate;
  const residentForDiscount = kind === 'resident' || kind === 'unknown';
  if (kind === 'unknown' && events.length > 0) cx.assume('Residency not answered: CGT discount applied as for a resident.');
  const eventReview = (itemId: string, label: string, reason: string, ids: string[], amount: number, formula: string, key: string) => {
    cx.setStatus('cgt', 'manual_review');
    cx.review('cgt', `${label}: ${reason}`, ids, amount);
    cx.markUncertain(key);
    cx.lines.review({ id: `income.cgt.event@${itemId}`, section: 'income', label, amountCents: amount, ruleId: `${fy}.cgt`, inputs: ids, formula, note: reason, category: 'capital_gain', itemId, informational: true });
  };

  for (const it of events) {
    const id = it.id;
    const has = (q: string) => cx.visible.has(`${q}@${id}`);
    const proceeds = has(Q.cgt.proceeds) ? cx.a.cents(Q.cgt.proceeds, id) : undefined;
    const cost = has(Q.cgt.costBase) ? cx.a.cents(Q.cgt.costBase, id) : undefined;
    const asset = cx.a.string(Q.cgt.assetType, id) ?? 'other';
    const desc = cx.a.string(Q.cgt.description, id);
    const label = `CGT event: ${desc ?? asset}`;
    const key = `${Q.cgt.proceeds}@${id}`;
    if (proceeds === undefined && cost === undefined) continue;
    touched = true;
    const inputs = [Q.cgt.assetType, Q.cgt.proceeds, Q.cgt.costBase, Q.cgt.ownershipPct, Q.cgt.acquiredDate, Q.cgt.disposedDate];
    if (proceeds === undefined || cost === undefined) {
      eventReview(id, label, 'Proceeds and cost base are both needed.', [Q.cgt.proceeds, Q.cgt.costBase], proceeds ?? cost ?? 0, 'proceeds - cost base (missing)', key);
      continue;
    }
    if (asset === 'property') {
      const mr = cx.a.string(Q.cgt.mainResidence, id);
      if (mr === 'yes') {
        cx.lines.excluded({ id: `income.cgt.event@${id}`, section: 'income', label, amountCents: proceeds - cost, ruleId: `${fy}.cgt.mainResidence`, inputs: [...inputs, Q.cgt.mainResidence], formula: 'main residence: exempt', note: 'Main residence for the whole ownership period: exempt from CGT.', category: 'capital_gain', itemId: id, informational: true });
        continue;
      }
      if (mr !== 'no') {
        eventReview(id, label, mr === 'part' ? 'Partial main residence exemption needs an apportionment.' : 'Main residence status not answered.', [Q.cgt.mainResidence], proceeds - cost, 'proceeds - cost base (main residence status)', key);
        continue;
      }
      cx.review('cgt', `${label}: property disposals need review (cost base elements, capital works adjustments).`, [Q.cgt.costBase], proceeds - cost);
    }
    if (asset === 'crypto') {
      const method = cx.a.string(Q.cgt.cryptoMethod);
      if (method === undefined || method === 'not_sure') {
        eventReview(id, label, 'The crypto cost-base method (specific identification or FIFO) must be answered, not assumed.', [Q.cgt.cryptoMethod], proceeds - cost, 'proceeds - cost base (method missing)', key);
        continue;
      }
    }
    let ownership = cx.a.number(Q.cgt.ownershipPct, id);
    if (ownership === undefined) {
      ownership = 100;
      cx.assume(`${label}: ownership share not answered; 100% assumed.`);
    }
    const raw = pct(proceeds - cost, ownership);
    if (raw < 0) {
      losses += -raw;
      cx.lines.computed({ id: `income.cgt.event@${id}`, section: 'income', label: `${label} (capital loss)`, amountCents: raw, ruleId: `${fy}.cgt`, inputs, formula: `(${proceeds / 100} - ${cost / 100}) x ${ownership}%`, category: 'capital_gain', itemId: id, informational: true });
      continue;
    }
    const acq = cx.a.string(Q.cgt.acquiredDate, id);
    const disp = cx.a.string(Q.cgt.disposedDate, id);
    const held = acq && disp ? heldAtLeast12Months(acq, disp) : undefined;
    if (held === undefined) {
      eventReview(id, label, 'Acquisition and disposal dates are both needed to test the 12-month discount.', [Q.cgt.acquiredDate, Q.cgt.disposedDate], raw, `(${proceeds / 100} - ${cost / 100}) x ${ownership}% (dates missing)`, key);
      continue;
    }
    const discountable = held && residentForDiscount;
    gains.push({ cents: raw, discountable });
    cx.lines.computed({ id: `income.cgt.event@${id}`, section: 'income', label: `${label} (${discountable ? 'held 12+ months, discount eligible' : held ? 'no discount: not a resident' : 'held under 12 months'})`, amountCents: raw, ruleId: `${fy}.cgt`, inputs, formula: `(${proceeds / 100} - ${cost / 100}) x ${ownership}%`, category: 'capital_gain', itemId: id, informational: true, detail: { acquired: acq, disposed: disp, heldTwelveMonths: held, discountable } });
  }

  // Trust capital gain components.
  for (const it of cx.items(GROUPS.trustDist)) {
    const disc = cx.visible.has(`${Q.inv.trustCgDiscounted}@${it.id}`) ? cx.a.cents(Q.inv.trustCgDiscounted, it.id) : undefined;
    const other = cx.visible.has(`${Q.inv.trustCgOther}@${it.id}`) ? cx.a.cents(Q.inv.trustCgOther, it.id) : undefined;
    if (disc !== undefined) {
      touched = true;
      gains.push({ cents: disc, discountable: residentForDiscount });
      cx.lines.computed({ id: `income.cgt.trust.discounted@${it.id}`, section: 'income', label: 'Trust capital gain (discountable, grossed-up)', amountCents: disc, ruleId: `${fy}.cgt.trust`, inputs: [Q.inv.trustCgDiscounted], formula: `${disc / 100} grossed-up discount gain component`, category: 'capital_gain', itemId: it.id, informational: true });
    }
    if (other !== undefined) {
      touched = true;
      gains.push({ cents: other, discountable: false });
      cx.lines.computed({ id: `income.cgt.trust.other@${it.id}`, section: 'income', label: 'Trust capital gain (no discount)', amountCents: other, ruleId: `${fy}.cgt.trust`, inputs: [Q.inv.trustCgOther], formula: `${other / 100}`, category: 'capital_gain', itemId: it.id, informational: true });
    }
  }

  const prior = cx.visible.has(Q.cgt.priorLosses) ? (cx.a.cents(Q.cgt.priorLosses) ?? 0) : 0;
  if (!touched) {
    cx.setStatus('cgt', prior > 0 ? 'computed' : 'not_applicable');
    return { netCapitalGainCents: 0, capitalLossCarriedForwardCents: prior };
  }

  // Apply losses: current-year losses then prior-year losses, against non-discount gains first.
  let nonDisc = gains.filter((g) => !g.discountable).reduce((a, g) => a + g.cents, 0);
  let disc = gains.filter((g) => g.discountable).reduce((a, g) => a + g.cents, 0);
  const grossGains = nonDisc + disc;
  const applyLoss = (loss: number): number => {
    let remaining = loss;
    const useNon = Math.min(nonDisc, remaining);
    nonDisc -= useNon;
    remaining -= useNon;
    const useDisc = Math.min(disc, remaining);
    disc -= useDisc;
    remaining -= useDisc;
    return remaining;
  };
  const currentUnused = applyLoss(losses);
  const priorUnused = applyLoss(prior);
  const discountAmount = mulRate(disc, discountRate);
  const net = nonDisc + disc - discountAmount;
  const carried = currentUnused + priorUnused;
  if (cx.moduleStatus['cgt'] !== 'manual_review') cx.setStatus('cgt', 'computed');
  cx.lines.computed({
    id: 'income.cgt.net', section: 'income', label: 'Net capital gain', amountCents: net, ruleId: `${fy}.cgt`,
    inputs: [Q.cgt.repeater, Q.cgt.priorLosses], category: 'capital_gain',
    formula: `gains ${grossGains / 100} - current losses ${losses / 100} - prior losses ${prior / 100} - ${discountRate * 100}% discount ${discountAmount / 100} on ${disc / 100} discountable`,
    detail: { grossGainsCents: grossGains, currentLossesCents: losses, priorLossesCents: prior, discountCents: discountAmount, carriedForwardCents: carried },
  });
  if (carried > 0) cx.assume(`Net capital loss of ${carried / 100} carried forward to later years.`);
  return { netCapitalGainCents: net, capitalLossCarriedForwardCents: carried };
}
