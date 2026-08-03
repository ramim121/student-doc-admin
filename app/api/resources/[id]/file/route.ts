import { type NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getR2ReviewDownloadUrl } from '@/lib/cloudflare-r2';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: 'Invalid resource.' }, { status: 400 });
  const supabase = await createServerSupabaseClient();
  const [{ data: { user } }, { data: isAdmin }] = await Promise.all([supabase.auth.getUser(), supabase.rpc('is_admin')]);
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (isAdmin !== true) return NextResponse.json({ error: 'Administrator access required.' }, { status: 403 });

  const { data: resource } = await supabase.from('resources').select('storage_provider, storage_key, original_file_name, title').eq('id', id).maybeSingle();
  if (!resource?.storage_key || resource.storage_provider !== 'r2') return NextResponse.json({ error: 'Stored file is unavailable.' }, { status: 404 });
  try {
    const url = await getR2ReviewDownloadUrl(resource.storage_key, resource.original_file_name || resource.title);
    const response = NextResponse.redirect(url, 307);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch {
    return NextResponse.json({ error: 'Review download could not be prepared.' }, { status: 502 });
  }
}
