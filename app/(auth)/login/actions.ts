'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/src/lib/supabase/server';

function baseUrl() {
  return process.env.APP_BASE_URL || 'http://localhost:3000';
}

export async function signInWithPassword(_prev: { error?: string; message?: string } | undefined, formData: FormData): Promise<{ error?: string; message?: string }> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  const next = String(formData.get('next') ?? '/dashboard');
  if (!email || !password) return { error: 'Enter your email and password.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };
  redirect(next.startsWith('/') ? next : '/dashboard');
}

export async function signUpWithPassword(_prev: { error?: string; message?: string } | undefined, formData: FormData): Promise<{ error?: string; message?: string }> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || password.length < 8) return { error: 'Use a password of at least 8 characters.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${baseUrl()}/auth/callback` } });
  if (error) return { error: error.message };
  return { message: 'Check your email to confirm your account, then sign in.' };
}

export async function sendMagicLink(_prev: { error?: string; message?: string } | undefined, formData: FormData): Promise<{ error?: string; message?: string }> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) return { error: 'Enter your email.' };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${baseUrl()}/auth/callback` } });
  if (error) return { error: error.message };
  return { message: 'Magic link sent. Check your email.' };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function signInWithCode(_prev: { error?: string; message?: string } | undefined, formData: FormData): Promise<{ error?: string; message?: string }> {
  const { ensureSeedUser, codeToPassword } = await import('@/src/lib/access');
  const { teamEmail } = await import('@/src/lib/access/seed-users');
  const username = String(formData.get('username') ?? '').trim().toLowerCase();
  const code = String(formData.get('code') ?? '').trim();
  const next = String(formData.get('next') ?? '/dashboard');
  if (!username || !code) return { error: 'Enter your username and code.' };
  await ensureSeedUser(username);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: teamEmail(username), password: codeToPassword(username, code) });
  if (error) return { error: 'Username or code is not right.' };
  redirect(next.startsWith('/') ? next : '/dashboard');
}
