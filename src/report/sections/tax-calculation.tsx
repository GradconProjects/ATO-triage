import { Text, View } from '@react-pdf/renderer';
import type { EstimateLine, EstimateSection } from '@/src/calc/types';
import { money } from '../format';
import type { ReportSnapshot } from '../snapshot';
import { styles } from '../styles';
import { SectionTitle } from './chrome';
import { Table } from './table';

export const SECTION_ORDER: { id: EstimateSection; label: string }[] = [
  { id: 'income', label: 'Assessable income' },
  { id: 'deductions', label: 'Deductions' },
  { id: 'taxable_income', label: 'Taxable income' },
  { id: 'gross_tax', label: 'Gross tax' },
  { id: 'offsets', label: 'Offsets' },
  { id: 'medicare', label: 'Medicare levy' },
  { id: 'mls', label: 'Medicare levy surcharge' },
  { id: 'study_loan', label: 'Study and training loan repayment' },
  { id: 'credits', label: 'Credits (tax already paid)' },
  { id: 'result', label: 'Result' },
];

function statusSuffix(l: EstimateLine): string {
  if (l.status === 'excluded') return ' (excluded)';
  if (l.status === 'manual_review') return ' (manual review)';
  if (l.informational) return ' (for information)';
  return '';
}

/** Section 5: the full explain trail grouped by pipeline section. */
export function TaxCalculationSection({ snapshot }: { snapshot: ReportSnapshot }) {
  const t = snapshot.estimate.totals;
  const bySection = new Map<EstimateSection, EstimateLine[]>();
  for (const l of snapshot.estimate.lines) {
    const list = bySection.get(l.section) ?? [];
    list.push(l);
    bySection.set(l.section, list);
  }
  return (
    <View style={styles.section}>
      <SectionTitle number={5} title="Tax calculation" />
      <Text style={[styles.p, styles.muted]}>Every figure below shows the rule it came from and the formula used, so you can see the working.</Text>
      {SECTION_ORDER.map(({ id, label }) => {
        const lines = bySection.get(id) ?? [];
        if (lines.length === 0) return null;
        return (
          <View key={id}>
            <Text style={styles.h3} minPresenceAhead={40}>
              {label}
            </Text>
            <Table
              columns={[
                { key: 'label', header: 'Line', width: 2.6 },
                { key: 'amount', header: 'Amount', width: 1.1, align: 'right' },
                { key: 'ruleId', header: 'Rule', width: 1.4 },
                { key: 'formula', header: 'Formula', width: 3.2 },
              ]}
              rows={lines.map((l, i) => ({
                _key: `${l.id}-${i}`,
                label: `${l.label}${statusSuffix(l)}`,
                amount: money(l.amountCents),
                ruleId: l.ruleId,
                formula: l.note ? `${l.formula} — ${l.note}` : l.formula,
              }))}
            />
          </View>
        );
      })}

      <Text style={styles.h3} minPresenceAhead={120}>
        Totals
      </Text>
      <View style={styles.box} wrap={false}>
        <Table
          columns={[
            { key: 'k', header: 'Total', width: 3 },
            { key: 'v', header: 'Amount', width: 1.2, align: 'right' },
          ]}
          rows={[
            { _key: 'ai', k: 'Assessable income', v: money(t.assessableIncomeCents) },
            { _key: 'ded', k: 'Less deductions', v: money(t.deductionsCents) },
            { _key: 'ti', k: 'Taxable income (rounded down to whole dollars)', v: money(t.taxableIncomeCents) },
            { _key: 'gt', k: 'Gross tax', v: money(t.grossTaxCents) },
            { _key: 'off', k: 'Less offsets', v: money(t.offsetsCents) },
            { _key: 'tao', k: 'Tax after offsets', v: money(t.taxAfterOffsetsCents) },
            { _key: 'ml', k: 'Medicare levy', v: money(t.medicareLevyCents) },
            { _key: 'mls', k: 'Medicare levy surcharge', v: money(t.mlsCents) },
            { _key: 'sl', k: 'Study loan repayment', v: money(t.studyLoanCents) },
            ...(t.phiLiabilityCents ? [{ _key: 'phi', k: 'Private health rebate adjustment', v: money(t.phiLiabilityCents) }] : []),
            { _key: 'cr', k: 'Less credits (tax withheld, instalments, franking credits)', v: money(t.creditsCents) },
            { _key: 'res', k: t.resultCents < 0 ? 'Estimated debt' : 'Estimated refund', v: money(Math.abs(t.resultCents)) },
          ]}
        />
      </View>
    </View>
  );
}
