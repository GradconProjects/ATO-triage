import type { Metadata, Viewport } from 'next';
import { Fraunces, Instrument_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

const display = Fraunces({ subsets: ['latin'], variable: '--font-display', axes: ['SOFT', 'opsz'], display: 'swap' });
const sans = Instrument_Sans({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' });

export const metadata: Metadata = {
  title: { default: 'Tax Intake Adviser', template: '%s · Tax Intake Adviser' },
  description: 'Indicative Australian income tax estimate and advisory report from a guided interview. Not a tax return and not tax advice.',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0d2219' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-AU" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:p-2">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
