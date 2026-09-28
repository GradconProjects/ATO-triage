import { LoginForm } from './login-form';
import { DisclaimerFooter } from '@/components/layout/disclaimer';

export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-10">
      <h1 className="text-2xl font-semibold">Tax Intake Adviser</h1>
      <p className="mt-1 text-sm text-muted">Sign in to start or continue an interview.</p>
      {params.error ? <p className="mt-3 text-sm text-danger">{params.error}</p> : null}
      <LoginForm next={params.next ?? '/dashboard'} />
      <DisclaimerFooter />
    </main>
  );
}
