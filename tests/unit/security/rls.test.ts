import { describe, expect, it } from 'vitest';
import { createClient } from '@supabase/supabase-js';

/**
 * Row-level security test (Section 13). Runs only against a local/dev Supabase when the
 * variables below are set; skipped in plain CI so the suite stays hermetic.
 *
 *   SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_SERVICE_ROLE_KEY
 */
const url = process.env.SUPABASE_TEST_URL;
const anon = process.env.SUPABASE_TEST_ANON_KEY;
const service = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const enabled = Boolean(url && anon && service);

const TABLES = ['profiles', 'fy_cases', 'repeater_items', 'answers', 'documents', 'estimates', 'flags', 'reports', 'audit_log'] as const;

describe.skipIf(!enabled)('row level security', () => {
  it('user B cannot read, update or delete user A rows', async () => {
    const admin = createClient(url!, service!, { auth: { persistSession: false } });
    const mk = async (email: string) => {
      const { data, error } = await admin.auth.admin.createUser({ email, password: 'Passw0rd!Passw0rd!', email_confirm: true });
      if (error) throw error;
      const c = createClient(url!, anon!, { auth: { persistSession: false } });
      const signed = await c.auth.signInWithPassword({ email, password: 'Passw0rd!Passw0rd!' });
      if (signed.error) throw signed.error;
      return { id: data.user!.id, client: c };
    };
    const a = await mk(`rls-a-${Date.now()}@example.com`);
    const b = await mk(`rls-b-${Date.now()}@example.com`);
    try {
      const prof = await a.client.from('profiles').insert({ owner_id: a.id, display_name: 'A', relationship: 'self' }).select('*').single();
      expect(prof.error).toBeNull();
      const fy = await a.client.from('fy_cases').insert({ owner_id: a.id, profile_id: prof.data!.id, financial_year: '2025-26', purpose: 'pre_lodgment' }).select('*').single();
      expect(fy.error).toBeNull();
      await a.client.from('answers').insert({ owner_id: a.id, case_id: fy.data!.id, question_id: 'core.fy', value: '2025-26', state: 'answered' });

      for (const t of TABLES) {
        const read = await b.client.from(t).select('*');
        expect(read.error, t).toBeNull();
        expect(read.data, t).toEqual([]);
      }
      const upd = await b.client.from('profiles').update({ display_name: 'hacked' }).eq('id', prof.data!.id).select('*');
      expect(upd.data).toEqual([]);
      const del = await b.client.from('fy_cases').delete().eq('id', fy.data!.id).select('*');
      expect(del.data).toEqual([]);
      // answers are append-only even for the owner
      const ownerUpd = await a.client.from('answers').update({ value: 'x' }).eq('case_id', fy.data!.id).select('*');
      expect(ownerUpd.data).toEqual([]);
      // spoofed owner_id insert is rejected
      const spoof = await b.client.from('profiles').insert({ owner_id: a.id, display_name: 'spoof', relationship: 'self' });
      expect(spoof.error).not.toBeNull();
    } finally {
      await admin.auth.admin.deleteUser(a.id);
      await admin.auth.admin.deleteUser(b.id);
    }
  });
});
