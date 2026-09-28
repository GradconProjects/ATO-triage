import { Text, View } from '@react-pdf/renderer';
import { answerDisplay, answerLabel, groupAnswers } from '../group-answers';
import type { ReportSnapshot } from '../snapshot';
import { styles } from '../styles';
import { SectionTitle } from './chrome';
import { Table } from './table';

const COLUMNS = [
  { key: 'q', header: 'Question', width: 3 },
  { key: 'a', header: 'Answer', width: 2 },
  { key: 's', header: 'Source', width: 0.8 },
];

/** Section 8: every answer grouped by module, including Not sure and answers no longer used. */
export function AnswersSection({ snapshot }: { snapshot: ReportSnapshot }) {
  const groups = groupAnswers(snapshot.answers);
  return (
    <View style={styles.section}>
      <SectionTitle number={8} title="Your answers" />
      {groups.length === 0 ? <Text style={[styles.p, styles.muted]}>No answers were recorded.</Text> : null}
      {groups.map((g) => (
        <View key={g.module}>
          <Text style={styles.h3} minPresenceAhead={40}>
            {g.moduleLabel}
          </Text>
          <Table
            columns={COLUMNS}
            rows={g.used.map((a, i) => ({
              _key: `${a.questionId}-${a.itemId ?? ''}-${i}`,
              q: answerLabel(a),
              a: answerDisplay(a),
              s: a.source === 'document' ? 'Imported' : a.source === 'prefill_confirmed' ? 'Confirmed' : 'Entered',
            }))}
            empty="No current answers in this module."
          />
          {g.noLongerUsed.length ? (
            <View style={{ marginBottom: 6 }}>
              <Text style={[styles.small, styles.bold]}>Answers no longer used</Text>
              <Text style={styles.small}>These were answered earlier but a later answer made the question irrelevant. They do not feed the estimate.</Text>
              {g.noLongerUsed.map((a, i) => (
                <Text key={`${a.questionId}-${a.itemId ?? ''}-${i}`} style={styles.small}>
                  • {answerLabel(a)} — {a.display}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
