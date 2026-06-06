import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { createRateLimiter } from '../middleware/rateLimiter';

export const apiRouter = Router();

// Create a rate limiter for auth routes
const authLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });

// ============================================
// Auth Status
// ============================================
apiRouter.post('/auth/callback', async (req: Request, res: Response) => {
  try {
    const { access_token, refresh_token } = req.body;
    
    if (!access_token) {
      return res.status(400).json({ error: 'No access token provided' });
    }

    const { data: { user }, error } = await supabase.auth.getUser(access_token);
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.full_name || user.email?.split('@')[0] || '',
        avatar: user.user_metadata?.avatar_url || '',
      },
    });
  } catch (err) {
    console.error('[API] Auth callback error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================
// Room Management
// ============================================

// Get room by slug
apiRouter.get('/rooms/:slug', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const { data: room, error } = await supabase
      .from('rooms')
      .select('*, host:profiles(*)')
      .eq('slug', slug)
      .single();

    if (error || !room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    return res.json(room);
  } catch (err) {
    console.error('[API] Get room error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Create room
apiRouter.post('/rooms', async (req: Request, res: Response) => {
  try {
    const { title, slug, user_id } = req.body;

    if (!title || !slug || !user_id) {
      return res.status(400).json({ error: 'Missing required fields: title, slug, user_id' });
    }

    // Validate slug format
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return res.status(400).json({ error: 'Slug can only contain lowercase letters, numbers, and hyphens' });
    }

    // Check if slug is taken
    const { data: existingRoom } = await supabase
      .from('rooms')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existingRoom) {
      return res.status(409).json({ error: 'A room with this slug already exists' });
    }

    const { data: room, error } = await supabase
      .from('rooms')
      .insert({
        title,
        slug,
        host_id: user_id,
        description: req.body.description || '',
      })
      .select()
      .single();

    if (error) {
      console.error('[API] Create room error:', error);
      return res.status(500).json({ error: 'Failed to create room' });
    }

    // Add host as room member
    await supabase
      .from('room_members')
      .insert({
        room_id: room.id,
        user_id: user_id,
        role: 'host',
      });

    return res.status(201).json(room);
  } catch (err) {
    console.error('[API] Create room error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get user's hosted rooms
apiRouter.get('/users/:userId/rooms', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('*, host:profiles(*)')
      .eq('host_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(500).json({ error: 'Failed to fetch rooms' });
    }

    return res.json(rooms || []);
  } catch (err) {
    console.error('[API] Get user rooms error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get room analytics
apiRouter.get('/rooms/:slug/analytics', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const { data: room } = await supabase
      .from('rooms')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const { data: analytics } = await supabase
      .from('room_analytics')
      .select('*')
      .eq('room_id', room.id)
      .single();

    // Get member count
    const { count: memberCount } = await supabase
      .from('room_members')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id);

    // Get current viewers (approximate, from recent activity)
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const { count: activeViewers } = await supabase
      .from('room_members')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', room.id)
      .gte('last_active_at', fiveMinAgo);

    return res.json({
      ...analytics,
      total_members: memberCount || 0,
      active_viewers: activeViewers || 0,
    });
  } catch (err) {
    console.error('[API] Get analytics error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get room session history
apiRouter.get('/rooms/:slug/history', async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const { data: room } = await supabase
      .from('rooms')
      .select('id')
      .eq('slug', slug)
      .single();

    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const { data: history } = await supabase
      .from('session_history')
      .select('*')
      .eq('room_id', room.id)
      .order('watched_at', { ascending: false })
      .limit(100);

    return res.json(history || []);
  } catch (err) {
    console.error('[API] Get history error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get YouTube video info (proxy to avoid CORS issues)
apiRouter.get('/youtube/video-info', async (req: Request, res: Response) => {
  try {
    const { videoId } = req.query;

    if (!videoId || typeof videoId !== 'string') {
      return res.status(400).json({ error: 'Missing videoId parameter' });
    }

    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      // Return basic info if no API key configured
      return res.json({
        videoId,
        title: '',
        channelName: '',
        channelAvatar: '',
        thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
        duration: 0,
      });
    }

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,contentDetails&key=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data: any = await response.json();
    
    if (!data.items?.length) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const video = data.items[0];
    const snippet = video.snippet;
    const duration = parseISO8601Duration(video.contentDetails.duration);

    return res.json({
      videoId,
      title: snippet.title,
      channelName: snippet.channelTitle,
      channelAvatar: '',
      thumbnailUrl: snippet.thumbnails?.maxres?.url || snippet.thumbnails?.high?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration,
    });
  } catch (err) {
    console.error('[API] YouTube info error:', err);
    return res.status(500).json({ error: 'Failed to fetch video info' });
  }
});

// Helper: Parse ISO 8601 duration to seconds
function parseISO8601Duration(duration: string): number {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;
  
  const hours = parseInt(match[1]?.replace('H', '') || '0', 10);
  const minutes = parseInt(match[2]?.replace('M', '') || '0', 10);
  const seconds = parseInt(match[3]?.replace('S', '') || '0', 10);
  
  return hours * 3600 + minutes * 60 + seconds;
}
