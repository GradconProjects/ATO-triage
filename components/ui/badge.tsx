import * as React from 'react';
import { cn } from '@/src/lib/utils';

type Tone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';
const tones: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-800',
  info: 'bg-blue-100 text-blue-900',
  warning: 'bg-amber-100 text-amber-900',
  danger: 'bg-red-100 text-red-900',
  success: 'bg-green-100 text-green-900',
};

export function Badge({ tone = 'neutral', className, ...props }: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium', tones[tone], className)} {...props} />;
}
