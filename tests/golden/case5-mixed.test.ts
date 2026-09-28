/**
 * Golden case 5 (Section 13): employee plus one rental property and one crypto disposal held 14 months, 2026-27.
 *   Salary $95,000 (withheld $22,000). Rental: rent $26,000, interest $18,000, council $1,800, agent $2,000,
 *   repairs $900 (not initial repairs), 100% owned. Crypto: 0.5 BTC acquired 10 May 2025, sold 20 July 2026 for
 *   $32,000 with a $20,000 cost base (FIFO), no prior losses. Hospital cover all year, no loans.
 *
 * Hand working (2026-27: 15% over 18,200, 30% over 45,000 with base 4,020; Medicare 2%; MLS tier 1 from 105,001):
 *   net rent     26,000 - (18,000 + 1,800 + 2,000 + 900)                 =  3,300.00
 *   crypto gain  (32,000 - 20,000) x 100%, held 14 months: 50% discount  =  6,000.00
 *   assessable   95,000 + 3,300 + 6,000                                  = 104,300.00
 *   taxable      no deductions                                           = 104,300.00
 *   gross tax    4,020 + 0.30 x (104,300 - 45,000)                       = 21,810.00
 *   LITO         104,300 > 66,667                                        =      0
 *   Medicare     0.02 x 104,300                                          =  2,086.00
 *   MLS          104,300 <= 105,000 (tier 0), and covered anyway         =      0
 *   result       22,000 - (21,810 + 2,086)                               = -1,896.00 (amount owing)
 */
import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { a, c, item, lineById, runGolden } from './harness';

const E = 'e1';
const run = () =>
  runGolden({
    fy: '2026-27',
    items: [item(E, 'employer'), item('p1', 'rental_property'), item('c1', 'cgt_event')],
    answers: [
      a(Q.core.fy, '2026-27'),
      a(Q.core.purpose, 'pre_lodgment'),
      a(Q.core.lodged, 'no'),
      a(Q.res.status, 'resident_full'),
      a(Q.res.dual, 'no'),
      a(Q.fam.spouse, 'no'),
      a(Q.fam.dependantsCount, 0),
      a(Q.med.exemption, 'entitled_full'),
      a(Q.phi.cover, 'whole_year'),
      a(Q.emp.name, 'Office Pty Ltd', E),
      a(Q.emp.occupation, 'office_professional', E),
      a(Q.emp.dates, { from: '2026-07-01', to: '2027-06-30' }, E),
      a(Q.emp.gross, c(95000), E),
      a(Q.emp.withheld, c(22000), E),
      a(Q.emp.taxReady, 'yes', E),
      a(Q.emp.otherPay, ['none']),
      a(Q.allow.any, 'no'),
      a(Q.comp.received, ['none']),
      a(Q.comp.etpReceived, ['none']),
      a(Q.gov.received, ['none']),
      a(Q.sup.received, 'no'),
      a(Q.inv.interestAny, 'no'),
      a(Q.inv.divAny, 'no'),
      a(Q.inv.trustAny, 'no'),
      a(Q.inv.ess, 'no'),
      // Rental
      a(Q.rent.any, 'yes'),
      a(Q.rent.address, '12 Example St', 'p1'),
      a(Q.rent.ownershipPct, 100, 'p1'),
      a(Q.rent.available, { from: '2026-07-01', to: '2027-06-30' }, 'p1'),
      a(Q.rent.daysRented, 365, 'p1'),
      a(Q.rent.daysPrivate, 0, 'p1'),
      a(Q.rent.income, c(26000), 'p1'),
      a(Q.rent.expInterest, c(18000), 'p1'),
      a(Q.rent.expCouncil, c(1800), 'p1'),
      a(Q.rent.expAgent, c(2000), 'p1'),
      a(Q.rent.expRepairs, c(900), 'p1'),
      a(Q.rent.initialRepairs, 'no', 'p1'),
      a(Q.rent.shortStay, 'no', 'p1'),
      // Crypto
      a(Q.cgt.events, ['crypto']),
      a(Q.cgt.assetType, 'crypto', 'c1'),
      a(Q.cgt.description, '0.5 BTC', 'c1'),
      a(Q.cgt.acquiredDate, '2025-05-10', 'c1'),
      a(Q.cgt.costBase, c(20000), 'c1'),
      a(Q.cgt.disposedDate, '2026-07-20', 'c1'),
      a(Q.cgt.proceeds, c(32000), 'c1'),
      a(Q.cgt.ownershipPct, 100, 'c1'),
      a(Q.cgt.priorLosses, 0),
      a(Q.cgt.cryptoMethod, 'fifo'),
      a('cgt.crypto_income.any', 'no'),
      a(Q.fgn.received, ['none']),
      a(Q.bus.soleTrader, 'no'),
      a(Q.bus.ptAny, 'no'),
      // Screens
      a(Q.ded.carAny, 'no'),
      a('ded.travel.any', 'no'),
      a(Q.ded.wfhAny, 'no'),
      a('ded.phone.any', 'no'),
      a('ded.selfed.any', 'no'),
      a('ded.subscriptions.any', 'no'),
      a('ded.tax_affairs.any', 'no'),
      a('ded.gifts.any', 'no'),
      a('ded.income_protection.any', 'no'),
      a('ded.investment.any', 'no'),
      a(Q.supc.personalAny, 'no'),
      a('off.payg_instalments.any', 'no'),
      a(Q.off.zone, 'none'),
      a(Q.off.invalidCarer, 'no'),
      a(Q.off.saptoEligible, 'no'),
      a('off.fito.any', 'no'),
      a(Q.loan.types, ['none']),
    ],
  });

describe('golden 5: employee + rental + crypto 2026-27', () => {
  const { estimate: est, hiddenAnswered, rules } = run();

  it('every answer given is visible; 2026-27 scale', () => {
    expect(hiddenAnswered).toEqual([]);
    expect(rules.residentScale[1]?.rate).toBe(0.15);
  });
  it('net rent $3,300', () => {
    const l = lineById(est, 'income.rent.net@p1');
    expect(l.amountCents).toBe(c(3300));
    expect(l.status).toBe('computed');
    expect(est.moduleStatus['rental']).toBe('computed');
  });
  it('crypto held 14 months: 50% discount on a $12,000 gain', () => {
    const ev = lineById(est, 'income.cgt.event@c1');
    expect(ev.amountCents).toBe(c(12000));
    expect(ev.detail?.['discountable']).toBe(true);
    expect(ev.informational).toBe(true);
    expect(lineById(est, 'income.cgt.net').amountCents).toBe(c(6000));
    expect(est.totals.capitalLossCarriedForwardCents).toBe(0);
    expect(est.moduleStatus['cgt']).toBe('computed');
  });
  it('totals: an amount owing', () => {
    expect(est.totals.assessableIncomeCents).toBe(c(104300));
    expect(est.totals.deductionsCents).toBe(0);
    expect(est.totals.taxableIncomeCents).toBe(c(104300));
    expect(lineById(est, 'tax.gross').amountCents).toBe(c(21810));
    expect(est.totals.offsetsCents).toBe(0);
    expect(lineById(est, 'medicare.levy').amountCents).toBe(c(2086));
    expect(est.totals.mlsCents).toBe(0);
    expect(est.totals.creditsCents).toBe(c(22000));
    expect(est.totals.resultCents).toBe(c(-1896));
    expect(lineById(est, 'result').label).toBe('Estimated amount owing');
    expect(est.manualReview).toEqual([]);
  });
});
