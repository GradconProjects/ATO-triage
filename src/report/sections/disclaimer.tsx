import { Text, View } from '@react-pdf/renderer';
import { DISCLAIMER_TEXT, PREPARED_BY } from '../format';
import { styles } from '../styles';
import { SectionTitle } from './chrome';

/** Section 10: full disclaimer text. */
export function DisclaimerSection() {
  return (
    <View style={styles.section}>
      <SectionTitle number={10} title="Disclaimer" />
      <View style={styles.box} wrap={false}>
        <Text style={styles.p}>{DISCLAIMER_TEXT}</Text>
        <Text style={[styles.p, styles.small]}>
          This report was produced by an estimation tool ({PREPARED_BY}). It is not affiliated with, produced by or endorsed by the Australian
          Taxation Office, and refers only to information published by the ATO. It does not lodge anything and cannot connect to ATO online
          services. Figures are indicative: the notice of assessment issued by the ATO is the only final figure.
        </Text>
        <Text style={[styles.p, styles.small]}>
          Providing tax agent services to others for a fee requires registration with the Tax Practitioners Board. If this report was prepared for
          someone other than yourself or your household, consider having it reviewed by a registered tax agent.
        </Text>
        <Text style={styles.small}>
          This report contains no tax file number, no bank account details and no full date of birth. Keep it with your tax records; the ATO
          generally expects records to be kept for five years.
        </Text>
      </View>
    </View>
  );
}
