export const metadata = { title: 'Privacy notice' };

export default function PrivacyPage() {
  return (
    <main id="main" className="prose mx-auto max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Privacy notice</h1>
      <p className="mt-4 text-sm">
        This notice explains what the Tax Intake Adviser collects, why, where it is stored and how you can delete it. It is written to align with the
        Australian Privacy Principles.
      </p>
      <h2 className="mt-6 text-lg font-semibold">What we collect</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
        <li>Your email address, to sign you in.</li>
        <li>Profile details you enter: a display name, relationship to you, year of birth (year only) and occupations.</li>
        <li>Your interview answers for each tax year, including income, deductions, family and health-cover facts, and WorkCover or compensation amounts.</li>
        <li>Documents you choose to upload, such as income statements and receipts.</li>
        <li>An audit log of changes you make, and the estimates and reports the app generates.</li>
      </ul>
      <p className="mt-2 text-sm">We never ask for a tax file number, bank account details or a full date of birth, and no field accepts them.</p>
      <h2 className="mt-6 text-lg font-semibold">Why we collect it</h2>
      <p className="mt-2 text-sm">Only to produce an indicative tax estimate and an advisory report for you. The app never lodges anything and never connects to ATO online services.</p>
      <h2 className="mt-6 text-lg font-semibold">Where it is stored</h2>
      <p className="mt-2 text-sm">
        Data is stored in a Supabase project hosted in the Sydney region. Every table is protected by row-level security so only the signed-in owner can read
        their own rows. Uploaded files and PDFs sit in a private storage bucket and are served only through short-lived signed links.
      </p>
      <h2 className="mt-6 text-lg font-semibold">How long we keep it</h2>
      <p className="mt-2 text-sm">Final reports are kept for 7 years by default, in line with common record-keeping advice. You can delete a profile, a tax year or a report earlier at any time.</p>
      <h2 className="mt-6 text-lg font-semibold">How to delete or export</h2>
      <p className="mt-2 text-sm">
        Open a profile and choose “Delete profile” to remove the profile, its tax years, answers, documents and reports. Use “Export my data” on the
        dashboard to download everything as JSON.
      </p>
      <h2 className="mt-6 text-lg font-semibold">Boundary</h2>
      <p className="mt-2 text-sm">
        Every figure is an indicative estimate. It is not tax advice and not a tax return. The ATO notice of assessment is the only final figure. This
        tool is not affiliated with or endorsed by the Australian Taxation Office.
      </p>
    </main>
  );
}
