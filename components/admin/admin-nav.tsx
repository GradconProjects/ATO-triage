import Link from 'next/link';
import { cn } from '@/src/lib/utils';

const TABS = [
  { href: '/admin', label: 'Live activity', key: 'live' },
  { href: '/admin/users', label: 'Users', key: 'users' },
  { href: '/admin/reports', label: 'All reports', key: 'reports' },
] as const;

export function AdminNav({ active, crumbs }: { active: (typeof TABS)[number]['key']; crumbs?: { href?: string; label: string }[] }) {
  return (
    <div className="mb-6">
      <nav aria-label="Admin" className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            aria-current={active === t.key ? 'page' : undefined}
            className={cn('rounded-md px-4 py-2 text-sm font-medium', active === t.key ? 'bg-primary text-white' : 'text-foreground hover:bg-slate-100')}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {crumbs?.length ? (
        <p className="mt-3 text-sm text-muted">
          {crumbs.map((c, i) => (
            <span key={i}>
              {i > 0 ? ' / ' : ''}
              {c.href ? (
                <Link href={c.href} className="underline-offset-2 hover:underline">
                  {c.label}
                </Link>
              ) : (
                <span className="text-foreground">{c.label}</span>
              )}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}
