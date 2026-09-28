import { Text, View } from '@react-pdf/renderer';
import { money } from '../format';
import type { ReportSnapshot } from '../snapshot';
import { styles } from '../styles';
import { Bullet, SectionTitle } from './chrome';

/** Section 9: assumptions, simplifications and modules routed to manual review. */
export function AssumptionsSection({ snapshot }: { snapshot: ReportSnapshot }) {
  const { assumptions, manualReview, range } = snapshot.estimate;
  const rangeReasons = range?.reasons ?? snapshot.intelligence.range?.reasons ?? [];
  const empty = assumptions.length === 0 && manualReview.length === 0 && rangeReasons.length === 0;
  return (
    <View style={styles.section}>
      <SectionTitle number={9} title="Assumptions and limitations" />
      {empty ? <Text style={[styles.p, styles.muted]}>None.</Text> : null}

      {assumptions.length ? (
        <View>
          <Text style={styles.h3}>Simplifications used</Text>
          {assumptions.map((a, i) => (
            <Bullet key={i}>{a}</Bullet>
          ))}
        </View>
      ) : null}

      {manualReview.length ? (
        <View>
          <Text style={styles.h3}>Routed to manual review (not calculated)</Text>
          {manualReview.map((m, i) => (
            <Bullet key={i}>
              {m.module}: {m.reason}
              {m.amountCents !== undefined ? ` (${money(m.amountCents)})` : ''}
            </Bullet>
          ))}
        </View>
      ) : null}

      {rangeReasons.length ? (
        <View>
          <Text style={styles.h3}>Why the result is shown as a range</Text>
          {rangeReasons.map((r, i) => (
            <Bullet key={i}>{r}</Bullet>
          ))}
        </View>
      ) : null}

      <Text style={[styles.small, { marginTop: 6 }]}>
        The estimate uses rule-set version {snapshot.ruleSetVersion}. It does not consider information you did not provide, and it never infers a
        tax fact from another answer.
      </Text>
    </View>
  );
}
