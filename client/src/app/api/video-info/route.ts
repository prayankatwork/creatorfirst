import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('id');

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return NextResponse.json({ error: 'Invalid video ID' }, { status: 400 });
  }

  try {
    // YouTube oEmbed API — free, no API key needed
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { next: { revalidate: 3600 } } // cache for 1 hour
    );

    if (!res.ok) {
      // Fallback — return just the ID with empty metadata
      return NextResponse.json({
        id: videoId,
        title: '',
        channel_name: '',
        channel_avatar: '',
        thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      });
    }

    const data = await res.json();

    return NextResponse.json({
      id: videoId,
      title: data.title || '',
      channel_name: data.author_name || '',
      channel_avatar: '', // oEmbed doesn't provide channel avatar
      thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
  } catch {
    return NextResponse.json({
      id: videoId,
      title: '',
      channel_name: '',
      channel_avatar: '',
      thumbnail_url: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
    });
  }
}
