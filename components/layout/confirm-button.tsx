'use client';

import { Button, type ButtonProps } from '@/components/ui/button';

export function ConfirmButton({ label, message, variant = 'ghost', size = 'sm' }: { label: string; message: string; variant?: ButtonProps['variant']; size?: ButtonProps['size'] }) {
  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      className="mt-2"
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {label}
    </Button>
  );
}
