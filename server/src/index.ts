import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import cron from 'node-cron';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from '@supabase/supabase-js';
import http from 'http';

// ============================================
// Environment & Config
// ============================================

const PORT = parseInt(process.env.PORT || '3001', 10);
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'https://creatorfirst.vercel.app';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ============================================
// Express App Setup
// ============================================

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());

// Global rate limit: 100 requests per 15 minutes per IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use(globalLimiter);

// ============================================
// Feature 1: YouTube Data API Endpoint
// ============================================

/**
 * GET /api/youtube/video-info?id={videoId}
 *
 * Fetches video duration (converts ISO 8601 to seconds) and channel avatar
 * using the YouTube Data API v3. Needs YOUTUBE_API_KEY set.
 */
app.get('/api/youtube/video-info', async (req, res) => {
  const videoId = req.query.id as string;

  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Invalid video ID' });
  }

  if (!YOUTUBE_API_KEY) {
    return res.status(503).json({
      error: 'YouTube API key not configured',
      hint: 'Set YOUTUBE_API_KEY environment variable',
    });
  }

  try {
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`
    );

    if (!response.ok) {
      const errBody = await response.text();
      console.error('YouTube API error:', response.status, errBody);
      return res.status(502).json({ error: 'YouTube API request failed' });
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return res.status(404).json({ error: 'Video not found' });
    }

    const video = data.items[0];
    const snippet = video.snippet;
    const contentDetails = video.contentDetails;

    // Convert ISO 8601 duration (e.g. PT1H2M30S) to seconds
    const duration = parseISODuration(contentDetails.duration);

    return res.json({
      id: videoId,
      title: snippet.title || '',
      channel_name: snippet.channelTitle || '',
      channel_avatar: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || '',
      thumbnail_url: snippet.thumbnails?.maxres?.url
        || snippet.thumbnails?.high?.url
        || snippet.thumbnails?.medium?.url
        || snippet.thumbnails?.default?.url
        || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
      duration,
    });
  } catch (err) {
    console.error('YouTube API fetch error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Converts an ISO 8601 duration string (e.g. "PT1H2M30S") to total seconds.
 */
function parseISODuration(duration: string): number {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1]?.replace('H', '') || '0', 10);
  const minutes = parseInt(match[2]?.replace('M', '') || '0', 10);
  const seconds = parseInt(match[3]?.replace('S', '') || '0', 10);

  return hours * 3600 + minutes * 60 + seconds;
}

// ============================================
// Feature 2: Rate Limiting (enabled globally above)
// ============================================

// Additional per-route rate limiters applied as middleware
const strictLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

const moderateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

app.get('/api/health', moderateLimiter, (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.post('/api/webhook', strictLimiter, (req, res) => {
  // Placeholder for future webhook handlers (e.g. Discord bot, custom events)
  res.json({ received: true });
});

// ============================================
// Feature 3: Background Jobs (Room Cleanup)
// ============================================

/**
 * Runs every hour: deletes inactive rooms older than 24 hours.
 * Also cleans up orphaned room_members, playback_states, etc. (CASCADE handles that).
 */
cron.schedule('0 * * * *', async () => {
  console.log('[Cron] Running room cleanup...');

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    // Find inactive rooms with no recent activity
    const { data: oldRooms, error: fetchError } = await supabase
      .from('rooms')
      .select('id, slug, title')
      .eq('is_active', false)
      .lt('updated_at', twentyFourHoursAgo);

    if (fetchError) {
      console.error('[Cron] Error fetching old rooms:', fetchError.message);
      return;
    }

    if (!oldRooms || oldRooms.length === 0) {
      console.log('[Cron] No old rooms to clean up.');
      return;
    }

    // Also find active rooms that haven't been updated in 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: staleRooms, error: staleError } = await supabase
      .from('rooms')
      .select('id, slug, title')
      .eq('is_active', true)
      .lt('updated_at', sevenDaysAgo);

    if (staleError) {
      console.error('[Cron] Error fetching stale rooms:', staleError.message);
      return;
    }

    const allToDelete = [...(oldRooms || []), ...(staleRooms || [])];

    if (allToDelete.length === 0) {
      console.log('[Cron] No rooms to clean up.');
      return;
    }

    const roomIds = allToDelete.map(r => r.id);

    const { error: deleteError } = await supabase
      .from('rooms')
      .delete()
      .in('id', roomIds);

    if (deleteError) {
      console.error('[Cron] Error deleting rooms:', deleteError.message);
      return;
    }

    console.log(`[Cron] Cleaned up ${allToDelete.length} rooms:`);
    allToDelete.forEach(r => {
      console.log(`  - ${r.title} (/${r.slug})`);
    });
  } catch (err) {
    console.error('[Cron] Room cleanup error:', err);
  }
});

// Also run every 30 minutes to update peak concurrent viewers in analytics
cron.schedule('*/30 * * * *', async () => {
  try {
    // Update analytics: set peak_concurrent based on room_members count
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id')
      .eq('is_active', true);

    if (!rooms) return;

    for (const room of rooms) {
      const { count } = await supabase
        .from('room_members')
        .select('*', { count: 'exact', head: true })
        .eq('room_id', room.id);

      if (count && count > 0) {
        // Update peak_concurrent if current count exceeds the stored peak
        await supabase
          .from('room_analytics')
          .update({ peak_concurrent: count, updated_at: new Date().toISOString() })
          .eq('room_id', room.id)
          .lt('peak_concurrent', count);
      }
    }
  } catch (err) {
    console.error('[Cron] Peak concurrent update error:', err);
  }
});

// ============================================
// Feature 4: WebSocket Server
// ============================================

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

// Track connected clients by room
const rooms = new Map<string, Set<WebSocket>>();

wss.on('connection', (ws, req) => {
  console.log('[WS] New connection');

  // Parse room from URL query params: ws://host/ws?room=my-room
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const roomSlug = url.searchParams.get('room') || 'global';

  // Add client to room
  if (!rooms.has(roomSlug)) {
    rooms.set(roomSlug, new Set());
  }
  rooms.get(roomSlug)!.add(ws);

  console.log(`[WS] Client joined room: ${roomSlug} (${rooms.get(roomSlug)!.size} clients)`);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    room: roomSlug,
    timestamp: new Date().toISOString(),
  }));

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      const { type, payload } = message;

      switch (type) {
        case 'ping':
          ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
          break;

        case 'sync:request':
          // A viewer requests the current playback state from the host
          // Forward to all other clients in the room
          broadcastToRoom(roomSlug, ws, {
            type: 'sync:request',
            payload: { ...payload, from: getClientId(ws) },
          });
          break;

        case 'sync:response':
          // Host responds with current playback state
          broadcastToRoom(roomSlug, ws, {
            type: 'sync:response',
            payload: { ...payload, from: getClientId(ws) },
          });
          break;

        case 'latency:ping':
          ws.send(JSON.stringify({
            type: 'latency:pong',
            payload: { sentAt: payload?.sentAt },
          }));
          break;

        default:
          // Forward unknown messages to room (custom event relay)
          broadcastToRoom(roomSlug, ws, { type, payload });
      }
    } catch (err) {
      console.error('[WS] Invalid message:', err);
    }
  });

  // Handle client disconnect
  ws.on('close', () => {
    const roomClients = rooms.get(roomSlug);
    if (roomClients) {
      roomClients.delete(ws);
      if (roomClients.size === 0) {
        rooms.delete(roomSlug);
      }
    }
    console.log(`[WS] Client left room: ${roomSlug} (${roomClients?.size || 0} remaining)`);
  });

  // Handle errors
  ws.on('error', (err) => {
    console.error('[WS] Client error:', err.message);
    const roomClients = rooms.get(roomSlug);
    if (roomClients) {
      roomClients.delete(ws);
    }
  });
});

/**
 * Broadcast a message to all clients in a room except the sender.
 */
function broadcastToRoom(roomSlug: string, sender: WebSocket, message: object) {
  const roomClients = rooms.get(roomSlug);
  if (!roomClients) return;

  const data = JSON.stringify(message);
  roomClients.forEach((client) => {
    if (client !== sender && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

let clientIdCounter = 0;
function getClientId(ws: WebSocket): number {
  return (ws as any)._clientId || ((ws as any)._clientId = ++clientIdCounter);
}

// ============================================
// Health endpoint
// ============================================

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    clients: Array.from(rooms.entries()).map(([slug, clients]) => ({
      room: slug,
      clients: clients.size,
    })),
    youtubeApiConfigured: !!YOUTUBE_API_KEY,
  });
});

// ============================================
// Start Server
// ============================================

server.listen(PORT, () => {
  console.log(`\n🚀 CreatorFirst Server running on port ${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`   REST:      http://localhost:${PORT}/api`);
  console.log(`   Health:    http://localhost:${PORT}/health`);
  console.log(`   YouTube API: ${YOUTUBE_API_KEY ? '✅ Configured' : '⚠️  Not configured (set YOUTUBE_API_KEY)'}\n`);
});
