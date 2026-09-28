/**
 * The PDF report (Section 11). Renders purely from an immutable `ReportSnapshot`:
 * no database, question bank or rule table access, so the same snapshot always
 * produces the same document.
 *
 * Ten sections in order: cover, summary, income, deductions, tax calculation, items
 * needing review, potential opportunities, your answers, assumptions and limitations,
 * disclaimer. Fixed header (name + FY) and footer (disclaimer + "Page x of y") on every
 * page; draft reports carry a diagonal DRAFT watermark. Built-in Helvetica only.
 */
import { Document, Page, type DocumentProps } from '@react-pdf/renderer';
import type { ReactElement } from 'react';
import { PREPARED_BY, REPORT_TITLE } from './format';
import type { ReportSnapshot } from './snapshot';
import { styles } from './styles';
import { AnswersSection } from './sections/answers';
import { AssumptionsSection } from './sections/assumptions';
import { DraftWatermark, PageFooter, PageHeader } from './sections/chrome';
import { CoverSection } from './sections/cover';
import { DeductionsSection } from './sections/deductions';
import { DisclaimerSection } from './sections/disclaimer';
import { IncomeSection } from './sections/income';
import { OpportunitiesSection } from './sections/opportunities';
import { ReviewItemsSection } from './sections/review-items';
import { SummarySection } from './sections/summary';
import { TaxCalculationSection } from './sections/tax-calculation';

export function ReportDocument({ snapshot }: { snapshot: ReportSnapshot }) {
  const { profile, fy, isFinal } = snapshot;
  return (
    <Document
      title={`${REPORT_TITLE} - ${profile.displayName} - ${fy}`}
      author={PREPARED_BY}
      subject={`Indicative tax estimate for ${fy} (${isFinal ? 'Final' : 'Draft'})`}
      creator="Tax Intake Adviser"
      producer="Tax Intake Adviser"
      language="en-AU"
    >
      <Page size="A4" style={styles.page} wrap>
        <PageHeader profileName={profile.displayName} fy={fy} isFinal={isFinal} />
        {isFinal ? null : <DraftWatermark />}

        <CoverSection snapshot={snapshot} />
        <SummarySection snapshot={snapshot} />
        <IncomeSection snapshot={snapshot} />
        <DeductionsSection snapshot={snapshot} />
        <TaxCalculationSection snapshot={snapshot} />
        <ReviewItemsSection snapshot={snapshot} />
        <OpportunitiesSection snapshot={snapshot} />
        <AnswersSection snapshot={snapshot} />
        <AssumptionsSection snapshot={snapshot} />
        <DisclaimerSection />

        <PageFooter />
      </Page>
    </Document>
  );
}

/** Typed element for `renderToBuffer` / `renderToStream`, which expect a `<Document>` element. */
export function reportElement(snapshot: ReportSnapshot): ReactElement<DocumentProps> {
  return <ReportDocument snapshot={snapshot} />;
}

export default ReportDocument;
