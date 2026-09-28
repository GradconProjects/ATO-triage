import * as React from 'react';
import { cn } from '@/src/lib/utils';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'flex min-h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-base text-foreground placeholder:text-muted disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn('flex min-h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-base text-foreground', className)}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-sm font-medium text-foreground', className)} {...props} />;
}
