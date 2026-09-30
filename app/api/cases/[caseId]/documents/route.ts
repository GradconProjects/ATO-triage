import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { getCase } from '@/src/lib/db/repo';
import { accessForUser } from '@/src/lib/access';
import { rateLimit } from '@/src/lib/rate-limit';
import { EXTRACT_MEDIA_TYPES, extractPriorYear, extractStatement, extractionAvailable, type ExtractMediaType } from '@/src/lib/documents/extract';

export const maxDuration = 60;

/** Vercel caps request bodies at 4.5 MB; the client shrinks photos before sending. */
const MAX_BYTES = 4 * 1024 * 1024;
const KINDS = { income_statement: 'income_statement', prior_year: 'prior_year_record' } as const;

/**
 * Upload a document (an income statement, or a prior-year notice/return with `kind=prior_year`).
 * The file is kept in the case's private storage and read by Claude; the figures come back for
 * review and nothing is written to the interview here. The same file uploaded again (same
 * sha-256) is recognised: its earlier reading is returned, it is not read or stored twice.
 */
export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });
  const access = await accessForUser(supabase, user);
  if (!access.can.editAnswers) return NextResponse.json({ error: 'Your access level is view only' }, { status: 403 });

  const caseRow = await getCase(supabase, caseId);
  if (!caseRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (caseRow.status === 'final') return NextResponse.json({ error: 'This case is final and read-only' }, { status: 409 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const kind = form?.get('kind') === 'prior_year' ? 'prior_year' : 'income_statement';
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  if (!EXTRACT_MEDIA_TYPES.includes(file.type as ExtractMediaType)) return NextResponse.json({ error: 'Upload a PDF, JPG, PNG or WebP file.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That file is over 4 MB. Try a smaller PDF or a photo.' }, { status: 413 });

  const data = Buffer.from(await file.arrayBuffer());
  const hash = createHash('sha256').update(data).digest('hex');
  const docType = KINDS[kind];

  // Same file already uploaded to this case: reuse its reading, never read or store it twice.
  const prev = await supabase.from('documents').select('id, created_at, original_name, extracted').eq('case_id', caseId).eq('content_hash', hash).eq('doc_type', docType).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (prev.data?.extracted) {
    return NextResponse.json({ ok: true, documentId: prev.data.id, fileName: prev.data.original_name, extracted: prev.data.extracted, duplicateOf: { uploadedAt: prev.data.created_at }, fyMismatch: fyMismatch(prev.data.extracted, caseRow.financial_year) });
  }

  if (!extractionAvailable()) return NextResponse.json({ error: 'Document reading is not set up yet. Enter the figures by hand for now.' }, { status: 503 });
  if (!rateLimit(`extract:${user.id}`, 20, 60 * 60_000)) return NextResponse.json({ error: 'Too many uploads. Try again in an hour.' }, { status: 429 });

  let extracted: unknown;
  try {
    extracted = kind === 'prior_year' ? await extractPriorYear({ data, mediaType: file.type as ExtractMediaType }) : await extractStatement({ data, mediaType: file.type as ExtractMediaType });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'The document could not be read.' }, { status: 422 });
  }

  const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'document';
  const path = `${caseRow.owner_id}/${caseId}/${crypto.randomUUID()}-${safeName}`;
  const up = await supabase.storage.from('case-documents').upload(path, data, { contentType: file.type });
  if (up.error) return NextResponse.json({ error: 'Could not store the file. Try again.' }, { status: 500 });
  const doc = await supabase
    .from('documents')
    .insert({ case_id: caseId, owner_id: caseRow.owner_id, storage_path: path, doc_type: docType, original_name: file.name.slice(0, 200), content_hash: hash, extracted })
    .select('id')
    .single();
  return NextResponse.json({ ok: true, documentId: doc.data?.id ?? null, fileName: file.name, extracted, duplicateOf: null, fyMismatch: fyMismatch(extracted, caseRow.financial_year) });
}

function fyMismatch(extracted: unknown, caseFy: string): string | null {
  const fy = (extracted as { financialYear?: string | null } | null)?.financialYear ?? null;
  return fy !== null && fy !== caseFy ? fy : null;
}
