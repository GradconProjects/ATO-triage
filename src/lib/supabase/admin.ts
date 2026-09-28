import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

/**
 * Service-role client. Server only; bypasses RLS. Used solely for Storage cleanup on
 * profile deletion and for signed URL generation where the user client cannot.
 * The key is never exposed to the client bundle.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
