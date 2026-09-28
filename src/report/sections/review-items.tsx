import { Text, View } from '@react-pdf/renderer';
import type { Flag } from '@/src/intelligence/types';
import type { ReportSnapshot, SnapshotAnswer } from '../snapshot';
import { colors, styles } from '../styles';
import { SectionTitle } from './chrome';

const KIND_LABELS: Record<Flag['kind'], string> = {
  review: 'Review',
  missing: 'Missing information',
  consistency: 'Consistency check',
  opportunity: 'Opportunity',
};

function severityStyle(sev: Flag['severity']) {
  if (sev === 'blocker') return { backgroundColor: colors.dangerBg, color: colors.danger };
  if (sev === 'warning') return { backgroundColor: colors.warnBg, color: colors.warn };
  return { backgroundColor: colors.soft, color: colors.ink };
}

/** The prompts (and current answers) behind a flag, so the reader knows what to check. */
export function relatedAnswers(flag: Flag, answers: SnapshotAnswer[]): SnapshotAnswer[] {
  // A flag key is either 'questionId' (any item of that question) or 'questionId@itemId' (one item).
  const anyItem = new Set(flag.questionIds.filter((k) => !k.includes('@')));
  const exact = new Set(flag.questionIds.filter((k) => k.includes('@')));
  return answers.filter((a) => anyItem.has(a.questionId) || (a.itemId !== null && exact.has(`${a.questionId}@${a.itemId}`)));
}

export function FlagCard({ flag, answers, prefix }: { flag: Flag; answers: SnapshotAnswer[]; prefix?: string }) {
  const related = relatedAnswers(flag, answers);
  return (
    <View style={[styles.box, { marginBottom: 6 }]} wrap={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
        <Text style={[styles.small, { flex: 1 }]}>
          {KIND_LABELS[flag.kind]} · {flag.code}
        </Text>
        <Text style={[styles.badge, severityStyle(flag.severity)]}>{flag.severity.toUpperCase()}</Text>
      </View>
      <Text style={styles.p}>
        {prefix ? <Text style={styles.bold}>{prefix} </Text> : null}
        {flag.message}
      </Text>
      {related.length ? (
        <View style={{ marginTop: 2 }}>
          <Text style={[styles.small, styles.bold]}>What to check</Text>
          {related.slice(0, 6).map((a, i) => (
            <Text key={`${a.questionId}-${a.itemId ?? ''}-${i}`} style={styles.small}>
              • {a.itemLabel ? `${a.itemLabel}: ` : ''}
              {a.prompt} — {a.display}
            </Text>
          ))}
        </View>
      ) : null}
      {flag.atoRef ? <Text style={[styles.small, { marginTop: 2 }]}>ATO information: {flag.atoRef}</Text> : null}
    </View>
  );
}

/** Section 6: items needing review (review, missing and consistency flags). */
export function ReviewItemsSection({ snapshot }: { snapshot: ReportSnapshot }) {
  const order: Flag['severity'][] = ['blocker', 'warning', 'info'];
  const flags = snapshot.intelligence.flags
    .filter((f) => f.kind !== 'opportunity')
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  return (
    <View style={styles.section}>
      <SectionTitle number={6} title="Items needing review" />
      {flags.length === 0 ? (
        <Text style={[styles.p, styles.muted]}>None. No review, missing-information or consistency flags were raised.</Text>
      ) : (
        <>
          <Text style={[styles.p, styles.muted]}>
            {flags.length} item{flags.length === 1 ? '' : 's'}. Every “Not sure” answer appears here; it is never treated as “No”.
          </Text>
          {flags.map((f, i) => (
            <FlagCard key={`${f.code}-${i}`} flag={f} answers={snapshot.answers} />
          ))}
        </>
      )}
    </View>
  );
}
