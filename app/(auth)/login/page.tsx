import Link from 'next/link';
import { LoginForm } from './login-form';
import s from './login.module.css';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
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
        <Link href="/" className={s.back}>
          ← Back to home
        </Link>
      </header>
      <main id="main" className={s.center}>
        <div className={s.card}>
          <h1 className={s.title}>Sign in</h1>
          <p className={s.sub}>Welcome back. Continue your tax interview.</p>
          <LoginForm next={next} initialError={params.error} />
          <p className={s.help}>Team members: use the username and code your administrator gave you. Admins can also sign in with their email address.</p>
        </div>
      </main>
      <footer className={s.foot}>
        Indicative estimates only. Not tax advice and not a tax return. Not affiliated with the Australian Taxation Office.{' '}
        <Link href="/privacy">Privacy</Link>
      </footer>
    </div>
  );
}
