import { Text, View } from '@react-pdf/renderer';
import type { ReportSnapshot } from '../snapshot';
import { styles } from '../styles';
import { SectionTitle } from './chrome';
import { FlagCard } from './review-items';

/** Section 7: potential opportunities, always framed as "check whether". */
export function OpportunitiesSection({ snapshot }: { snapshot: ReportSnapshot }) {
  const flags = snapshot.intelligence.flags.filter((f) => f.kind === 'opportunity');
  return (
    <View style={styles.section}>
      <SectionTitle number={7} title="Potential opportunities" />
      <Text style={[styles.p, styles.muted]}>
        These are things to check, not claims you are entitled to. Whether a deduction or offset applies depends on your records and the ATO
        rules for your situation.
      </Text>
      {flags.length === 0 ? (
        <Text style={[styles.p, styles.muted]}>None identified from the answers provided.</Text>
      ) : (
        flags.map((f, i) => <FlagCard key={`${f.code}-${i}`} flag={f} answers={snapshot.answers} prefix="Check whether:" />)
      )}
    </View>
  );
}
