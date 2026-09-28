import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Tax Intake Adviser', template: '%s · Tax Intake Adviser' },
  description: 'Indicative Australian income tax estimate and advisory report from a guided interview. Not a tax return and not tax advice.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU">
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:p-2">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
