export const DISCLAIMER =
  'This report is an indicative estimate prepared from information you provided. It is not tax advice and is not a tax return. Final outcomes are determined by the ATO. Consider seeking advice from a registered tax agent.';

export function DisclaimerFooter() {
  return (
    <footer className="mx-auto mt-10 max-w-5xl px-4 pb-8 text-xs text-muted">
      <p>{DISCLAIMER}</p>
      <p className="mt-1">
        This tool is not affiliated with or endorsed by the Australian Taxation Office. It refers to information published by the ATO.{' '}
        <a className="underline" href="/privacy">
          Privacy notice
        </a>
      </p>
    </footer>
  );
}
