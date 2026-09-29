export function LiveDot({ at, error }: { at: string | null; error?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted" role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${error ? 'bg-red-500' : 'animate-pulse bg-green-500'}`} aria-hidden />
      {error ? 'Connection lost, retrying' : at ? `Live · updated ${new Date(at).toLocaleTimeString('en-AU')}` : 'Connecting…'}
    </span>
  );
}
