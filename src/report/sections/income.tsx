import { Text, View } from '@react-pdf/renderer';
import type { EstimateLine } from '@/src/calc/types';
import { categoryLabel, money, sourceLabel, statusLabel } from '../format';
import type { ReportSnapshot, SnapshotAnswer } from '../snapshot';
import { styles } from '../styles';
import { SectionTitle } from './chrome';
import { Table } from './table';

/** Entered / Imported / Confirmed for a line, from the answers that fed it. */
export function lineSource(line: EstimateLine, answers: SnapshotAnswer[]): string {
  const keys = new Set(line.inputs);
  const sources = new Set<string>();
  for (const a of answers) {
    const key = a.itemId ? `${a.questionId}@${a.itemId}` : a.questionId;
    if (keys.has(key) || keys.has(a.questionId)) sources.add(a.source);
  }
  if (sources.has('document')) return sourceLabel('document');
  if (sources.has('prefill_confirmed')) return sourceLabel('prefill_confirmed');
  return sourceLabel('user');
}

/** Payer / item label for a line: repeater item label when the line belongs to one. */
export function lineItemLabel(line: EstimateLine, answers: SnapshotAnswer[]): string {
  if (!line.itemId) return '';
  return answers.find((a) => a.itemId === line.itemId && a.itemLabel)?.itemLabel ?? '';
}

/** Section 3: income captured, by category and payer with source. */
export function IncomeSection({ snapshot }: { snapshot: ReportSnapshot }) {
  const lines = snapshot.estimate.lines.filter((l) => l.section === 'income' && !l.informational);
  const rows = lines.map((l, i) => ({
    _key: `${l.id}-${i}`,
    category: categoryLabel(l.category),
    payer: lineItemLabel(l, snapshot.answers),
    label: l.label,
    source: lineSource(l, snapshot.answers),
    amount: money(l.amountCents),
    status: statusLabel(l.status),
  }));
  return (
    <View style={styles.section}>
      <SectionTitle number={3} title="Income captured" />
      <Table
        columns={[
          { key: 'category', header: 'Category', width: 2 },
          { key: 'payer', header: 'Payer / item', width: 2 },
          { key: 'label', header: 'Description', width: 3 },
          { key: 'source', header: 'Source', width: 1 },
          { key: 'amount', header: 'Amount', width: 1.4, align: 'right' },
          { key: 'status', header: 'Status', width: 1.2 },
        ]}
        rows={rows}
        empty="No income was entered."
      />
      <Text style={styles.small}>Assessable income: {money(snapshot.estimate.totals.assessableIncomeCents)}. Excluded and manual-review amounts are shown but not added.</Text>
    </View>
  );
}
