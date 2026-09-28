import { Text, View } from '@react-pdf/renderer';
import { money, rangePhrase, resultPhrase } from '../format';
import { openReviewCount, type ReportSnapshot } from '../snapshot';
import { styles } from '../styles';
import { KeyValue, SectionTitle } from './chrome';

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
        <KeyValue k="Completeness" v={`${snapshot.intelligence.completeness.pct}%`} />
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
      {t.capitalLossCarriedForwardCents > 0 ? <Text style={styles.small}>Net capital loss carried forward: {money(t.capitalLossCarriedForwardCents)}.</Text> : null}
    </View>
  );
}
