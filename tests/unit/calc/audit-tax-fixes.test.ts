import { describe, expect, it } from 'vitest';
import { Q } from '@/src/questions/ids';
import { getRuleSet } from '@/src/rules';
import { a, c, lineById, run } from './fixture';

const rules = getRuleSet('2024-25');
const opts = { rules, fy: '2024-25' as const };

describe('audit fixes: Medicare, MLS, WHM, SAPTO', () => {
  it('a Medicare Entitlement Statement for some days pro-rates the levy', () => {
    const est = run([a(Q.emp.gross, c(60000), 'e1'), a(Q.med.exemption, 'temp_visa_mes'), a(Q.med.exemptDays, 100)], opts);
    expect(lineById(est, 'medicare.levy').amountCents).toBe(87123);
  });
  it('a statement for the whole year means no levy', () => {
    const est = run([a(Q.emp.gross, c(60000), 'e1'), a(Q.med.exemption, 'temp_visa_mes'), a(Q.med.exemptDays, 365)], opts);
    expect(est.totals.medicareLevyCents).toBe(0);
  });
  it('no surcharge on Medicare-exempt days', () => {
    const est = run([a(Q.emp.gross, c(150000), 'e1'), a(Q.phi.cover, 'none'), a(Q.med.exemption, 'part_year'), a(Q.med.exemptDays, 200)], opts);
    expect(est.totals.mlsCents).toBe(Math.round((15000000 * 0.0125 * 165) / 365));
  });
  it('non-resident WHM: no Medicare levy; other income stacked on the foreign resident scale', () => {
    const est = run([a(Q.res.status, 'whm'), a(Q.res.whmResident, 'no'), a(Q.res.whmIncome, c(30000)), a(Q.emp.gross, c(50000), 'e1')], opts);
    expect(est.totals.medicareLevyCents).toBe(0);
    // WHM 15% x 30,000 = 4,500; foreign 30% on 30,000-50,000 = 6,000
    expect(lineById(est, 'tax.gross.whm').amountCents).toBe(c(4500));
    expect(lineById(est, 'tax.gross.other').amountCents).toBe(c(6000));
  });
  it('SAPTO rebate income uses the adjusted fringe benefits total (x 0.53)', () => {
    const est = run([a(Q.emp.gross, c(34919), 'e1'), a(Q.emp.rfb, c(10000), 'e1'), a(Q.off.saptoEligible, 'yes'), a(Q.off.saptoStatus, 'single')], opts);
    expect(lineById(est, 'offset.sapto').formula).toContain('rebate income 40219');
  });
});
