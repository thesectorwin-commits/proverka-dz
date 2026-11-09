import { NextRequest, NextResponse } from 'next/server';

// POST /api/rum — приёмник диагностики медленных заходов (см. components/RumBeacon.tsx).
// Пишет в журнал службы строку "RUM {...}" только если задано RUM_LOG=1; иначе молча отвечает 204.
// Принимает только небольшие числовые тайминги, ограничивает частоту по IP и никогда не отвечает ошибкой.

export const dynamic = 'force-dynamic';

const hits = new Map<string, number[]>();
const MAX_PER_HOUR = 60;

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.round(v), 600000) : null);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[^\w\-./ ]/g, '').slice(0, max) : '');

export async function POST(request: NextRequest) {
  const done = () => new NextResponse(null, { status: 204 });
  if (process.env.RUM_LOG !== '1') return done();

  const ip =
    request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  if (list.length >= MAX_PER_HOUR) return done();
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 2000) hits.clear();

  try {
    const text = await request.text();
    if (text.length > 1000) return done();
    const b = JSON.parse(text) as Record<string, unknown>;
    const out = {
      ip,
      path: str(b.path, 60),
      type: str(b.type, 20),
      proto: str(b.proto, 12),
      sw: num(b.sw),
      standalone: num(b.standalone),
      net: str(b.net, 10),
      start: num(b.start),
      dns: num(b.dns),
      connect: num(b.connect),
      tls: num(b.tls),
      wait: num(b.wait),
      download: num(b.download),
      dcl: num(b.dcl),
      load: num(b.load)
    };
    console.log('RUM ' + JSON.stringify(out));
  } catch {
    // мусор игнорируем
  }
  return done();
}
