import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/admin';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Доступ запрещён' }, { status: 403 });
  }

  const [{ count: usersCount }, { count: checksCount }, { data: recentChecks }, { data: subjectBreakdown }] =
    await Promise.all([
      supabaseServer.from('users').select('*', { count: 'exact', head: true }),
      supabaseServer.from('checks').select('*', { count: 'exact', head: true }),
      supabaseServer
        .from('checks')
        .select('id, subject, grade, created_at, tokens_input, tokens_output')
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseServer.from('checks').select('subject')
    ]);

  const subjectCounts: Record<string, number> = {};
  (subjectBreakdown || []).forEach((row: { subject: string }) => {
    subjectCounts[row.subject] = (subjectCounts[row.subject] || 0) + 1;
  });

  const totalTokensInput = (recentChecks || []).reduce((sum, c) => sum + (c.tokens_input || 0), 0);
  const totalTokensOutput = (recentChecks || []).reduce((sum, c) => sum + (c.tokens_output || 0), 0);

  return NextResponse.json({
    usersCount: usersCount || 0,
    checksCount: checksCount || 0,
    subjectCounts,
    recentChecks,
    recentTokens: { input: totalTokensInput, output: totalTokensOutput }
  });
}
