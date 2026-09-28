import * as React from 'react';
import { cn } from '@/src/lib/utils';

type Tone = 'info' | 'warning' | 'danger' | 'success';
const tones: Record<Tone, string> = {
  info: 'border-blue-200 bg-blue-50 text-blue-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-900',
  success: 'border-green-200 bg-green-50 text-green-900',
};

export function Alert({ tone = 'info', className, ...props }: React.HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('rounded-md border p-3 text-sm', tones[tone], className)} {...props} />;
}
