import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/src/lib/utils';

const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-blue-800',
        secondary: 'border border-border bg-card text-foreground hover:bg-slate-50',
        ghost: 'text-foreground hover:bg-slate-100',
        danger: 'bg-danger text-white hover:bg-red-800',
        link: 'min-h-0 px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: '',
        sm: 'min-h-9 px-3 text-xs',
        lg: 'min-h-12 px-6 text-base',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
