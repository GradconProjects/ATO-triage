import { Text, View } from '@react-pdf/renderer';
import { formatDateTime, PREPARED_BY, REPORT_TITLE } from '../format';
import type { ReportSnapshot } from '../snapshot';
import { colors, styles } from '../styles';
import { KeyValue } from './chrome';

function confidenceStyle(level: string) {
  if (level === 'high') return { backgroundColor: colors.okBg, color: colors.ok };
  if (level === 'medium') return { backgroundColor: colors.warnBg, color: colors.warn };
  return { backgroundColor: colors.dangerBg, color: colors.danger };
}

/** Section 1: cover. */
export function CoverSection({ snapshot }: { snapshot: ReportSnapshot }) {
  const conf = snapshot.intelligence.confidence;
  return (
    <View style={styles.section}>
      <Text style={styles.small}>{PREPARED_BY}</Text>
      <Text style={[styles.h1, { marginTop: 40 }]}>{REPORT_TITLE}</Text>
      <Text style={[styles.p, styles.muted]}>
        An indicative estimate prepared from the information provided. It is not a tax return and not tax advice.
      </Text>

      <View style={[styles.box, { marginTop: 24 }]}>
        <KeyValue k="Prepared for" v={snapshot.profile.displayName} />
        {snapshot.profile.occupationLabels.length ? <KeyValue k="Occupation(s)" v={snapshot.profile.occupationLabels.join(', ')} /> : null}
        <KeyValue k="Financial year" v={snapshot.fy} />
        <KeyValue k="Purpose" v={snapshot.purposeLabel} />
        <KeyValue k="Generated" v={`${formatDateTime(snapshot.generatedAt, snapshot.timezone)} (${snapshot.timezone})`} />
        <KeyValue k="Rule-set version" v={snapshot.ruleSetVersion} />
        <KeyValue k="Status" v={snapshot.isFinal ? 'Final' : 'Draft'} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
        <Text style={[styles.kvKey, { width: 100 }]}>Confidence</Text>
        <Text style={[styles.badge, confidenceStyle(conf.level)]}>{conf.level.toUpperCase()}</Text>
      </View>
      {conf.reasons.length ? (
        <View style={{ marginTop: 6 }}>
          {conf.reasons.map((r, i) => (
            <Text key={i} style={styles.small}>
              • {r}
            </Text>
          ))}
        </View>
      ) : null}

      <Text style={[styles.small, { marginTop: 40 }]}>
        This report refers to information published by the ATO. It is not affiliated with, produced by or endorsed by the Australian Taxation
        Office. Only the ATO notice of assessment gives the final figure.
      </Text>
    </View>
  );
}
