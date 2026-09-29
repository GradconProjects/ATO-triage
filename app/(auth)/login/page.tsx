import Link from 'next/link';
import { LoginForm } from './login-form';
import s from './login.module.css';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; admin?: string }> }) {
  const params = await searchParams;
  const next = params.next && params.next.startsWith('/') && !params.next.startsWith('//') ? params.next : '/dashboard';
  return (
    <div className={s.page}>
      <header className={s.top}>
        <Link href="/" className={s.brand}>
          <span className={s.seal} aria-hidden>
            TI
          </span>
          Tax Intake Adviser
        </Link>
        <nav className={s.topLinks}>
          <Link href="/" className={s.back}>
            ← Home
          </Link>
          <Link href="/login?admin=1" className={s.adminBtn}>
            Admin
          </Link>
        </nav>
      </header>
      <main id="main" className={s.center}>
        <div className={s.card}>
          <LoginForm key={params.admin ? 'admin' : 'user'} next={next} initialError={params.error} adminMode={Boolean(params.admin)} />
        </div>
      </main>
      <footer className={s.foot}>
        Indicative estimates only. Not tax advice and not a tax return. Not affiliated with the Australian Taxation Office.{' '}
        <Link href="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}
