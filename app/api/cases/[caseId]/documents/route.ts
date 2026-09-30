import { NextResponse } from 'next/server';
import { createClient } from '@/src/lib/supabase/server';
import { getCase } from '@/src/lib/db/repo';
import { accessForUser } from '@/src/lib/access';
import { rateLimit } from '@/src/lib/rate-limit';
import { EXTRACT_MEDIA_TYPES, extractStatement, extractionAvailable, type ExtractMediaType } from '@/src/lib/documents/extract';

export const maxDuration = 60;

/** Vercel caps request bodies at 4.5 MB; the client shrinks photos before sending. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * Upload an income statement (PDF or photo). The file is kept in the case's private storage and
 * read by Claude; the extracted figures come back for the user to review. Nothing is written to
 * the interview until they confirm (see ./apply).
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
  if (!extractionAvailable()) return NextResponse.json({ error: 'Document reading is not set up yet. Enter the figures by hand for now.' }, { status: 503 });
  if (!rateLimit(`extract:${user.id}`, 20, 60 * 60_000)) return NextResponse.json({ error: 'Too many uploads. Try again in an hour.' }, { status: 429 });

  const caseRow = await getCase(supabase, caseId);
  if (!caseRow) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (caseRow.status === 'final') return NextResponse.json({ error: 'This case is final and read-only' }, { status: 409 });

  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a file to upload.' }, { status: 400 });
  if (!EXTRACT_MEDIA_TYPES.includes(file.type as ExtractMediaType)) return NextResponse.json({ error: 'Upload a PDF, JPG, PNG or WebP file.' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That file is over 4 MB. Try a smaller PDF or a photo.' }, { status: 413 });

  const data = Buffer.from(await file.arrayBuffer());
  const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80) || 'statement';
  const path = `${caseRow.owner_id}/${caseId}/${crypto.randomUUID()}-${safeName}`;
  const up = await supabase.storage.from('case-documents').upload(path, data, { contentType: file.type });
  if (up.error) return NextResponse.json({ error: 'Could not store the file. Try again.' }, { status: 500 });
  const doc = await supabase
    .from('documents')
    .insert({ case_id: caseId, owner_id: caseRow.owner_id, storage_path: path, doc_type: 'income_statement', original_name: file.name.slice(0, 200) })
    .select('id')
    .single();

  try {
    const extracted = await extractStatement({ data, mediaType: file.type as ExtractMediaType });
    return NextResponse.json({
      ok: true,
      documentId: doc.data?.id ?? null,
      extracted,
      fyMismatch: extracted.financialYear !== null && extracted.financialYear !== caseRow.financial_year ? extracted.financialYear : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'The document could not be read.' }, { status: 422 });
  }
}
