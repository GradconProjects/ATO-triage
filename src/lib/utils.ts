import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return `${sign}$${dollars.toLocaleString('en-AU')}.${rem.toString().padStart(2, '0')}`;
}

export function formatDateTimeMelbourne(iso: string): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: process.env.REPORT_TIMEZONE || 'Australia/Melbourne',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}
