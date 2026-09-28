import { Text, View } from '@react-pdf/renderer';
import type { EstimateLine } from '@/src/calc/types';
import { categoryLabel, money, statusLabel } from '../format';
import type { ReportSnapshot } from '../snapshot';
import { styles } from '../styles';
import { SectionTitle } from './chrome';
import { lineItemLabel } from './income';
import { Table } from './table';

type Detail = NonNullable<EstimateLine['detail']>;

/** First present value among several candidate keys in `line.detail`. */
export function pickDetail(detail: Detail | undefined, keys: string[]): string | number | boolean | null | undefined {
  if (!detail) return undefined;
  for (const k of keys) {
    const v = detail[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

const REIMBURSEMENT_LABELS: Record<string, string> = {
  paid_not_reimbursed: 'Not reimbursed',
  paid_fully_reimbursed: 'Fully reimbursed',
  paid_partly_reimbursed: 'Partly reimbursed',
  employer_paid: 'Employer paid',
  not_sure: 'Not sure',
  none: 'Not reimbursed',
};

const EVIDENCE_LABELS: Record<string, string> = {
  receipts: 'Receipts',
  bank_statements: 'Bank statements',
  logbook: 'Logbook',
  diary: 'Diary',
  estimate_only: 'Estimate only',
  none: 'None',
  not_sure: 'Not sure',
};

function humanise(v: string | number | boolean | null | undefined, map?: Record<string, string>): string {
  if (v === undefined || v === null || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') return String(v);
  const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.map((p) => map?.[p] ?? p.replace(/_/g, ' ')).join(', ');
}

function workPct(detail: Detail | undefined): string {
  const v = pickDetail(detail, ['workPct', 'work_pct', 'workUsePct', 'work_use_pct', 'businessPct']);
  if (v === undefined) return '—';
  if (typeof v === 'number') return `${v}%`;
  return String(v).endsWith('%') ? String(v) : `${v}%`;
}

/** Section 4: deductions captured. */
export function DeductionsSection({ snapshot }: { snapshot: ReportSnapshot }) {
  const lines = snapshot.estimate.lines.filter((l) => l.section === 'deductions' && !l.informational);
  const rows = lines.map((l, i) => {
    const d = l.detail;
    return {
      _key: `${l.id}-${i}`,
      category: categoryLabel(l.category),
      label: [lineItemLabel(l, snapshot.answers), l.label].filter(Boolean).join(': '),
      amount: money(l.amountCents),
      workPct: workPct(d),
      reimbursed: humanise(pickDetail(d, ['reimbursement', 'reimbursed', 'paid', 'paidStatus']), REIMBURSEMENT_LABELS),
      evidence: humanise(pickDetail(d, ['evidence', 'evidenceHeld', 'records']), EVIDENCE_LABELS),
      method: humanise(pickDetail(d, ['method', 'work_pct_method', 'workPctMethod', 'basis'])),
      status: statusLabel(l.status),
    };
  });
  const notes = lines.filter((l) => l.note && l.status !== 'computed');
  return (
    <View style={styles.section}>
      <SectionTitle number={4} title="Deductions captured" />
      <Table
        columns={[
          { key: 'category', header: 'Category', width: 1.6 },
          { key: 'label', header: 'Item', width: 2.6 },
          { key: 'amount', header: 'Amount', width: 1.2, align: 'right' },
          { key: 'workPct', header: 'Work use', width: 0.9, align: 'right' },
          { key: 'reimbursed', header: 'Reimbursement', width: 1.3 },
          { key: 'evidence', header: 'Evidence', width: 1.3 },
          { key: 'method', header: 'Method', width: 1.1 },
          { key: 'status', header: 'Status', width: 1.1 },
        ]}
        rows={rows}
        empty="No deductions were entered."
      />
      <Text style={styles.small}>Total deductions included: {money(snapshot.estimate.totals.deductionsCents)}.</Text>
      {notes.length ? (
        <View style={{ marginTop: 4 }}>
          {notes.map((l, i) => (
            <Text key={`${l.id}-${i}`} style={styles.small}>
              • {l.label}: {l.note}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
