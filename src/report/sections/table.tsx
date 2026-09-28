import { Text, View } from '@react-pdf/renderer';
import { styles } from '../styles';

export interface Column {
  key: string;
  header: string;
  /** Relative width (flex). */
  width: number;
  align?: 'left' | 'right';
}

export type Row = Record<string, string | number | null | undefined> & { _key?: string };

/**
 * Simple flex table. The header row is `fixed` so it repeats on every page the table
 * spans; each body row is `wrap={false}` so a row never splits across pages.
 */
export function Table({ columns, rows, empty = 'None' }: { columns: Column[]; rows: Row[]; empty?: string }) {
  if (rows.length === 0) return <Text style={[styles.p, styles.muted]}>{empty}</Text>;
  return (
    <View style={styles.table}>
      <View style={styles.th} fixed>
        {columns.map((c) => (
          <Text key={c.key} style={[styles.cellHead, { flex: c.width }, c.align === 'right' ? styles.right : {}]}>
            {c.header}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={r._key ?? i} style={styles.tr} wrap={false}>
          {columns.map((c) => {
            const v = r[c.key];
            return (
              <Text key={c.key} style={[styles.cell, { flex: c.width }, c.align === 'right' ? styles.right : {}]}>
                {v === null || v === undefined || v === '' ? '—' : String(v)}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}
