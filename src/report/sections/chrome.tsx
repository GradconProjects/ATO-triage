import { Text, View } from '@react-pdf/renderer';
import { DISCLAIMER_TEXT, PREPARED_BY } from '../format';
import { styles } from '../styles';

/** Fixed header on every page: profile name and financial year (Section 11 technical rules). */
export function PageHeader({ profileName, fy, isFinal }: { profileName: string; fy: string; isFinal: boolean }) {
  return (
    <View style={styles.header} fixed>
      <Text>
        {profileName} · Financial year {fy}
      </Text>
      <Text>
        Tax estimate and advisory report · {isFinal ? 'Final' : 'Draft'} · indicative only
      </Text>
    </View>
  );
}

/** Fixed footer on every page: disclaimer sentence and "Page x of y". */
export function PageFooter() {
  return (
    <View style={styles.footer} fixed>
      <Text>{DISCLAIMER_TEXT}</Text>
      <View style={styles.footerRow}>
        <Text>{PREPARED_BY}. Not affiliated with or endorsed by the Australian Taxation Office.</Text>
        <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </View>
    </View>
  );
}

/** Diagonal grey DRAFT watermark rendered on every page of a draft report. */
export function DraftWatermark() {
  return (
    <Text style={styles.watermark} fixed>
      DRAFT
    </Text>
  );
}

export function SectionTitle({ number, title }: { number: number; title: string }) {
  return (
    <Text style={styles.h2} minPresenceAhead={60}>
      {number}. {title}
    </Text>
  );
}

export function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.li} wrap={false}>
      <Text style={styles.liBullet}>•</Text>
      <Text style={styles.liBody}>{children}</Text>
    </View>
  );
}

export function KeyValue({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kvRow}>
      <Text style={styles.kvKey}>{k}</Text>
      <Text style={styles.kvVal}>{v}</Text>
    </View>
  );
}
