import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ status: 'error', message: 'Missing Supabase config' }, { status: 500 });
  }

  try {
    // Lightweight health check — query the rooms table
    const res = await fetch(`${supabaseUrl}/rest/v1/rooms?select=count`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });

    if (!res.ok) {
      throw new Error(`Supabase responded with ${res.status}`);
    }

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      supabase: 'connected',
    });
  } catch (err) {
    console.error('Health check failed:', err);
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      message: err instanceof Error ? err.message : 'Unknown error',
    }, { status: 500 });
  }
}
