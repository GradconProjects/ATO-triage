import { Text, View } from '@react-pdf/renderer';
import { money, rangePhrase, resultPhrase } from '../format';
import { openReviewCount, type ReportSnapshot } from '../snapshot';
import { styles } from '../styles';
import { KeyValue, SectionTitle } from './chrome';
import { Table } from './table';

/** Section 2: summary box. */
export function SummarySection({ snapshot }: { snapshot: ReportSnapshot }) {
  const t = snapshot.estimate.totals;
  const range = snapshot.estimate.range ?? snapshot.intelligence.range;
  const showRange = range && range.lowCents !== range.highCents;
  const totalTaxAndLevies = t.taxAfterOffsetsCents + t.medicareLevyCents + t.mlsCents + t.studyLoanCents + (t.phiLiabilityCents ?? 0);
  const headline = showRange ? rangePhrase(range.lowCents, range.highCents) : `Estimated ${resultPhrase(t.resultCents)}`;
  const open = openReviewCount(snapshot);

  return (
    <View style={styles.section} break>
      <SectionTitle number={2} title="Summary" />
      <View style={styles.box} wrap={false}>
        <Text style={[styles.bold, { fontSize: 14, marginBottom: 8 }]}>{headline}</Text>
        {showRange ? <Text style={[styles.small, { marginBottom: 6 }]}>Point estimate: {resultPhrase(t.resultCents)}. Range reasons are listed in section 9.</Text> : null}
        <KeyValue k="Taxable income" v={money(t.taxableIncomeCents)} />
        <KeyValue k="Total tax and levies" v={money(totalTaxAndLevies)} />
        <KeyValue k="Total credits" v={money(t.creditsCents)} />
        <KeyValue k="Interview completeness" v={`${snapshot.intelligence.completeness.pct}%`} />
        {snapshot.intelligence.completeness.evidencePct !== undefined ? <KeyValue k="Evidence completeness" v={`${snapshot.intelligence.completeness.evidencePct}% of claimed deductions`} /> : null}
        {snapshot.intelligence.completeness.reliability ? <KeyValue k="Calculation reliability" v={snapshot.intelligence.completeness.reliability.level} /> : null}
        <KeyValue k="Open review items" v={String(open)} />
        <KeyValue k="Confidence" v={snapshot.intelligence.confidence.level} />
        {snapshot.assessedResultCents !== undefined ? (
          <KeyValue
            k="ATO notice of assessment"
            v={`${resultPhrase(snapshot.assessedResultCents)} (difference ${money(t.resultCents - snapshot.assessedResultCents)})`}
          />
        ) : null}
      </View>
      {t.carriedForwardLossCents > 0 ? <Text style={styles.small}>Income loss carried forward: {money(t.carriedForwardLossCents)}.</Text> : null}
      <LossesCarriedForward snapshot={snapshot} />
    </View>
  );
}

/**
 * Losses carried forward, kept in two separate places: net capital losses (only usable against
 * capital gains) and deferred non-commercial business losses, one row per activity (only usable
 * against that activity's later profit). Both come from the same estimate as every other figure.
 */
export function LossesCarriedForward({ snapshot }: { snapshot: ReportSnapshot }) {
  const t = snapshot.estimate.totals;
  const rows = (snapshot.estimate.deferredLosses ?? []).filter((d) => d.openingCents || d.currentLossCents || d.closingCents);
  if (t.capitalLossCarriedForwardCents <= 0 && rows.length === 0) return null;
  const statusText = { deferred: 'Deferred: no loss test met', review: 'Loss test ticked: review', none: 'Profit year' } as const;
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.h3}>Losses carried forward</Text>
      <Text style={styles.small}>
        Net capital losses carried forward: {money(t.capitalLossCarriedForwardCents)} (only usable against future capital gains).
      </Text>
      {rows.length ? (
        <>
          <Text style={[styles.small, { marginTop: 4 }]}>Deferred business losses, by activity (only usable against later profit from the same activity; never against salary this year):</Text>
          <Table
            columns={[
              { key: 'a', header: 'Activity', width: 3 },
              { key: 'o', header: 'Opening', width: 2, align: 'right' },
              { key: 'u', header: 'Used', width: 2, align: 'right' },
              { key: 'l', header: 'This year\'s loss', width: 2, align: 'right' },
              { key: 'c', header: 'Carried forward', width: 2, align: 'right' },
              { key: 's', header: 'Status', width: 3 },
            ]}
            rows={rows.map((d) => ({ _key: d.activityId, a: d.activity, o: money(d.openingCents), u: money(d.usedCents), l: money(d.currentLossCents), c: money(d.closingCents), s: statusText[d.status] }))}
          />
        </>
      ) : null}
    </View>
  );
}
