import { Server, Socket } from 'socket.io';
import { supabase } from '../lib/supabase';
import xss from 'xss';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userData?: {
    id: string;
    name: string;
    email?: string;
    avatar: string;
  };
  currentRoom?: string;
}

const rooms = new Map<string, Set<string>>();
const userSockets = new Map<string, Set<string>>();

export function registerSocketHandlers(io: Server) {
  io.use(async (socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(token as string);
        if (user && !error) {
          socket.userId = user.id;
          socket.userData = {
            id: user.id,
            name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous',
            email: user.email,
            avatar: user.user_metadata?.avatar_url || '',
          };
        }
      } catch {
        // Auth optional - viewers can join without auth
      }
    }
    next();
  });

  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`[Socket] Connected: ${socket.id} (${socket.userData?.name || 'Anonymous'})`);

    if (socket.userId) {
      if (!userSockets.has(socket.userId)) {
        userSockets.set(socket.userId, new Set());
      }
      userSockets.get(socket.userId)!.add(socket.id);
    }

    // --- Room Events ---
    socket.on('room:join', async (data: { room_slug: string }) => {
      try {
        const { room_slug } = data;
        if (!room_slug) {
          socket.emit('room:error', { message: 'Invalid room slug' });
          return;
        }

        // Get room from database
        const { data: room, error: roomError } = await supabase
          .from('rooms')
          .select('*')
          .eq('slug', room_slug)
          .single();

        if (roomError || !room) {
          socket.emit('room:error', { message: 'Room not found' });
          return;
        }

        if (!room.is_active) {
          socket.emit('room:error', { message: 'Room is no longer active' });
          return;
        }

        // Join the socket room
        socket.join(room_slug);
        socket.currentRoom = room_slug;

        // Track room membership
        if (!rooms.has(room_slug)) {
          rooms.set(room_slug, new Set());
        }
        rooms.get(room_slug)!.add(socket.id);

        // Upsert room member in database
        if (socket.userId) {
          const { data: existingMember } = await supabase
            .from('room_members')
            .select('*')
            .eq('room_id', room.id)
            .eq('user_id', socket.userId)
            .single();

          if (existingMember) {
            await supabase
              .from('room_members')
              .update({ last_active_at: new Date().toISOString() })
              .eq('id', existingMember.id);
          } else {
            const isHost = room.host_id === socket.userId;
            await supabase
              .from('room_members')
              .insert({
                room_id: room.id,
                user_id: socket.userId,
                role: isHost ? 'host' : 'viewer',
              });
          }

          // Update analytics - increment total visitors
          try { await supabase.rpc('increment_visitors', { room_id: room.id }); } catch {}
        }

        // Fetch full room state
        const roomState = await getRoomState(room_slug);

        // Get current user count
        const userCount = rooms.get(room_slug)?.size || 1;
        const peakConcurrent = roomState?.analytics?.peak_concurrent || 0;
        if (userCount > peakConcurrent) {
          await supabase
            .from('room_analytics')
            .update({ peak_concurrent: userCount })
            .eq('room_id', room.id);
        }

        if (roomState) {
          socket.emit('room:state', roomState);
        }

        // Broadcast user joined
        if (socket.userData) {
          socket.to(room_slug).emit('room:user-joined', { user: socket.userData });
          socket.to(room_slug).emit('room:users', { 
            users: await getRoomUsers(room_slug) 
          });
        }
      } catch (err) {
        console.error('[Socket] room:join error:', err);
        socket.emit('room:error', { message: 'Failed to join room' });
      }
    });

    socket.on('room:leave', () => {
      handleRoomLeave(socket, io);
    });

    // --- Video Events ---
    socket.on('video:play', async () => {
      await handleVideoPlay(socket, io);
    });

    socket.on('video:pause', async () => {
      await handleVideoPause(socket, io);
    });

    socket.on('video:seek', async (data: { timestamp: number }) => {
      await handleVideoSeek(socket, io, data.timestamp);
    });

    socket.on('video:change', async (data: { youtube_video_id: string; title?: string; channel_name?: string; channel_avatar?: string }) => {
      await handleVideoChange(socket, io, data);
    });

    socket.on('video:sync-request', async () => {
      await handleVideoSyncRequest(socket, io);
    });

    // --- Queue Events ---
    socket.on('queue:add', async (data) => {
      await handleQueueAdd(socket, io, data);
    });

    socket.on('queue:remove', async (data: { video_id: string }) => {
      await handleQueueRemove(socket, io, data.video_id);
    });

    socket.on('queue:reorder', async (data: { video_ids: string[] }) => {
      await handleQueueReorder(socket, io, data.video_ids);
    });

    socket.on('queue:skip', async () => {
      await handleQueueSkip(socket, io);
    });

    socket.on('queue:play-now', async (data: { video_id: string }) => {
      await handleQueuePlayNow(socket, io, data.video_id);
    });

    socket.on('queue:clear', async () => {
      await handleQueueClear(socket, io);
    });

    // --- Suggestion Events ---
    socket.on('suggest:add', async (data) => {
      await handleSuggestionAdd(socket, io, data);
    });

    socket.on('suggest:approve', async (data: { suggestion_id: string }) => {
      await handleSuggestionApprove(socket, io, data.suggestion_id);
    });

    socket.on('suggest:reject', async (data: { suggestion_id: string }) => {
      await handleSuggestionReject(socket, io, data.suggestion_id);
    });

    // --- Chat Events ---
    socket.on('chat:send', async (data: { message: string }) => {
      await handleChatSend(socket, io, data.message);
    });

    socket.on('chat:delete', async (data: { message_id: string }) => {
      await handleChatDelete(socket, io, data.message_id);
    });

    socket.on('chat:mute', async (data: { user_id: string }) => {
      await handleChatMute(socket, io, data.user_id);
    });

    socket.on('chat:unmute', async (data: { user_id: string }) => {
      await handleChatUnmute(socket, io, data.user_id);
    });

    // --- Disconnect ---
    socket.on('disconnect', () => {
      console.log(`[Socket] Disconnected: ${socket.id}`);
      handleRoomLeave(socket, io);
      if (socket.userId) {
        const sockets = userSockets.get(socket.userId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) userSockets.delete(socket.userId);
        }
      }
    });
  });
}

// ============================================
// Helper: Get full room state
// ============================================
async function getRoomState(roomSlug: string) {
  const { data: room } = await supabase
    .from('rooms')
    .select('*')
    .eq('slug', roomSlug)
    .single();

  if (!room) return null;

  const { data: playback } = await supabase
    .from('playback_states')
    .select('*')
    .eq('room_id', room.id)
    .single();

  const { data: queue } = await supabase
    .from('videos')
    .select('*')
    .eq('room_id', room.id)
    .order('position', { ascending: true });

  const { data: messages } = await supabase
    .from('messages')
    .select('*')
    .eq('room_id', room.id)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(100);

  const { data: suggestions } = await supabase
    .from('suggestions')
    .select('*')
    .eq('room_id', room.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: members } = await supabase
    .from('room_members')
    .select('*, profile:profiles(*)')
    .eq('room_id', room.id);

  const { data: muted } = await supabase
    .from('muted_users')
    .select('user_id')
    .eq('room_id', room.id);

  const { data: history } = await supabase
    .from('session_history')
    .select('*')
    .eq('room_id', room.id)
    .order('watched_at', { ascending: false })
    .limit(50);

  const { data: analytics } = await supabase
    .from('room_analytics')
    .select('*')
    .eq('room_id', room.id)
    .single();

  return {
    room,
    playback,
    queue: queue || [],
    messages: messages || [],
    suggestions: suggestions || [],
    members: members || [],
    muted_users: (muted || []).map(m => m.user_id),
    history: history || [],
    analytics,
    current_video_info: playback ? {
      video_id: playback.youtube_video_id,
      title: playback.title,
      channel_name: playback.channel_name,
      channel_avatar: playback.channel_avatar,
    } : null,
  };
}

async function getRoomUsers(roomSlug: string) {
  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('slug', roomSlug)
    .single();
    
  if (!room) return [];
  
  const { data: members } = await supabase
    .from('room_members')
    .select('profile:profiles(*)')
    .eq('room_id', room.id);
    
  return (members || []).map(m => m.profile).filter(Boolean);
}

// ============================================
// Room Leave Handler
// ============================================
async function handleRoomLeave(socket: AuthenticatedSocket, io: Server) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  socket.leave(roomSlug);
  rooms.get(roomSlug)?.delete(socket.id);
  if (rooms.get(roomSlug)?.size === 0) rooms.delete(roomSlug);

  if (socket.userId) {
    // Update last_active
    const { data: room } = await supabase
      .from('rooms')
      .select('id')
      .eq('slug', roomSlug)
      .single();

    if (room) {
      await supabase
        .from('room_members')
        .update({ last_active_at: new Date().toISOString() })
        .eq('room_id', room.id)
        .eq('user_id', socket.userId);
    }

    socket.to(roomSlug).emit('room:user-left', { user_id: socket.userId });
    socket.to(roomSlug).emit('room:users', { 
      users: await getRoomUsers(roomSlug) 
    });
  }

  socket.currentRoom = undefined;
}

// ============================================
// Video Handlers
// ============================================
async function handleVideoPlay(socket: AuthenticatedSocket, io: Server) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) {
    socket.emit('room:error', { message: 'Only the host can control playback' });
    return;
  }

  await supabase
    .from('playback_states')
    .update({ playback_state: 'playing', last_updated: new Date().toISOString() })
    .eq('room_id', room.id);

  const { data: state } = await supabase
    .from('playback_states')
    .select('*')
    .eq('room_id', room.id)
    .single();

  if (state) {
    io.to(roomSlug).emit('video:state-change', state);
    io.to(roomSlug).emit('video:sync', { timestamp: state.timestamp, playback_state: 'playing' });
  }
}

async function handleVideoPause(socket: AuthenticatedSocket, io: Server) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) {
    socket.emit('room:error', { message: 'Only the host can control playback' });
    return;
  }

  const { data: playback } = await supabase
    .from('playback_states')
    .select('timestamp')
    .eq('room_id', room.id)
    .single();

  await supabase
    .from('playback_states')
    .update({ 
      playback_state: 'paused', 
      timestamp: playback?.timestamp || 0,
      last_updated: new Date().toISOString() 
    })
    .eq('room_id', room.id);

  const { data: state } = await supabase
    .from('playback_states')
    .select('*')
    .eq('room_id', room.id)
    .single();

  if (state) {
    io.to(roomSlug).emit('video:state-change', state);
    io.to(roomSlug).emit('video:sync', { timestamp: state.timestamp, playback_state: 'paused' });
  }
}

async function handleVideoSeek(socket: AuthenticatedSocket, io: Server, timestamp: number) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) {
    socket.emit('room:error', { message: 'Only the host can control playback' });
    return;
  }

  const safeTimestamp = Math.max(0, Math.floor(timestamp));

  await supabase
    .from('playback_states')
    .update({ 
      timestamp: safeTimestamp, 
      last_updated: new Date().toISOString() 
    })
    .eq('room_id', room.id);

  const { data: state } = await supabase
    .from('playback_states')
    .select('*')
    .eq('room_id', room.id)
    .single();

  if (state) {
    io.to(roomSlug).emit('video:state-change', state);
    io.to(roomSlug).emit('video:sync', { timestamp: safeTimestamp, playback_state: state.playback_state });
  }
}

async function handleVideoChange(socket: AuthenticatedSocket, io: Server, data: { youtube_video_id: string; title?: string; channel_name?: string; channel_avatar?: string }) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) {
    socket.emit('room:error', { message: 'Only the host can change videos' });
    return;
  }

  const { youtube_video_id, title = '', channel_name = '', channel_avatar = '' } = data;

  // Update current video and mark as non-current
  await supabase
    .from('videos')
    .update({ is_current: false, status: 'played' })
    .eq('room_id', room.id)
    .eq('status', 'playing');

  // Upsert playback state
  const { data: existingPlayback } = await supabase
    .from('playback_states')
    .select('*')
    .eq('room_id', room.id)
    .single();

  if (existingPlayback) {
    await supabase
      .from('playback_states')
      .update({
        youtube_video_id,
        title,
        channel_name,
        channel_avatar,
        timestamp: 0,
        playback_state: 'paused',
        last_updated: new Date().toISOString(),
      })
      .eq('room_id', room.id);
  } else {
    await supabase
      .from('playback_states')
      .insert({
        room_id: room.id,
        youtube_video_id,
        title,
        channel_name,
        channel_avatar,
        timestamp: 0,
        playback_state: 'paused',
      });
  }

  // Add to session history
  await supabase
    .from('session_history')
    .insert({
      room_id: room.id,
      youtube_video_id,
      title,
      channel_name,
      channel_avatar,
    });

  // Update analytics
  try { await supabase.rpc('increment_videos_watched', { room_id: room.id }); } catch {}

  const { data: state } = await supabase
    .from('playback_states')
    .select('*')
    .eq('room_id', room.id)
    .single();

  if (state) {
    io.to(roomSlug).emit('video:state-change', state);
  }

  // Send history update
  const { data: historyEntry } = await supabase
    .from('session_history')
    .select('*')
    .eq('room_id', room.id)
    .eq('youtube_video_id', youtube_video_id)
    .order('watched_at', { ascending: false })
    .limit(1)
    .single();

  if (historyEntry) {
    io.to(roomSlug).emit('history:new', historyEntry);
  }
}

async function handleVideoSyncRequest(socket: AuthenticatedSocket, io: Server) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('slug', roomSlug)
    .single();

  if (!room) return;

  const { data: state } = await supabase
    .from('playback_states')
    .select('*')
    .eq('room_id', room.id)
    .single();

  if (state) {
    socket.emit('video:sync', { 
      timestamp: state.timestamp, 
      playback_state: state.playback_state as 'playing' | 'paused' | 'buffering' | 'ended'
    });
  }
}

// ============================================
// Queue Handlers
// ============================================
async function handleQueueAdd(socket: AuthenticatedSocket, io: Server, data: { youtube_video_id: string; title?: string; channel_name?: string; channel_avatar?: string; thumbnail_url?: string; duration?: number }) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('slug', roomSlug)
    .single();

  if (!room) return;

  // Get next position
  const { data: lastVideo } = await supabase
    .from('videos')
    .select('position')
    .eq('room_id', room.id)
    .order('position', { ascending: false })
    .limit(1)
    .single();

  const nextPosition = (lastVideo?.position ?? -1) + 1;

  await supabase
    .from('videos')
    .insert({
      room_id: room.id,
      youtube_video_id: data.youtube_video_id,
      title: data.title || '',
      channel_name: data.channel_name || '',
      channel_avatar: data.channel_avatar || '',
      thumbnail_url: data.thumbnail_url || '',
      duration: data.duration || 0,
      position: nextPosition,
      added_by: socket.userId,
    });

  // Update analytics
  try { await supabase.rpc('increment_queue_activity', { room_id: room.id }); } catch {}

  // Emit updated queue
  const { data: queue } = await supabase
    .from('videos')
    .select('*')
    .eq('room_id', room.id)
    .order('position', { ascending: true });

  io.to(roomSlug).emit('queue:updated', { queue: queue || [] });
}

async function handleQueueRemove(socket: AuthenticatedSocket, io: Server, videoId: string) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) return;

  await supabase
    .from('videos')
    .delete()
    .eq('id', videoId)
    .eq('room_id', room.id);

  // Reorder remaining videos
  const { data: remaining } = await supabase
    .from('videos')
    .select('*')
    .eq('room_id', room.id)
    .order('position', { ascending: true });

  if (remaining) {
    for (let i = 0; i < remaining.length; i++) {
      await supabase
        .from('videos')
        .update({ position: i })
        .eq('id', remaining[i].id);
    }
  }

  const { data: queue } = await supabase
    .from('videos')
    .select('*')
    .eq('room_id', room.id)
    .order('position', { ascending: true });

  io.to(roomSlug).emit('queue:updated', { queue: queue || [] });
}

async function handleQueueReorder(socket: AuthenticatedSocket, io: Server, videoIds: string[]) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) return;

  for (let i = 0; i < videoIds.length; i++) {
    await supabase
      .from('videos')
      .update({ position: i })
      .eq('id', videoIds[i])
      .eq('room_id', room.id);
  }

  const { data: queue } = await supabase
    .from('videos')
    .select('*')
    .eq('room_id', room.id)
    .order('position', { ascending: true });

  io.to(roomSlug).emit('queue:updated', { queue: queue || [] });
}

async function handleQueueSkip(socket: AuthenticatedSocket, io: Server) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) return;

  // Get next video in queue
  const { data: nextVideo } = await supabase
    .from('videos')
    .select('*')
    .eq('room_id', room.id)
    .eq('status', 'queued')
    .order('position', { ascending: true })
    .limit(1)
    .single();

  if (nextVideo) {
    // Trigger video change
    await handleVideoChange(socket, io, {
      youtube_video_id: nextVideo.youtube_video_id,
      title: nextVideo.title,
      channel_name: nextVideo.channel_name,
      channel_avatar: nextVideo.channel_avatar,
    });

    // Mark as playing
    await supabase
      .from('videos')
      .update({ is_current: true, status: 'playing' })
      .eq('id', nextVideo.id);

    // Update queue
    const { data: queue } = await supabase
      .from('videos')
      .select('*')
      .eq('room_id', room.id)
      .order('position', { ascending: true });

    io.to(roomSlug).emit('queue:updated', { queue: queue || [] });
  }
}

async function handleQueuePlayNow(socket: AuthenticatedSocket, io: Server, videoId: string) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) return;

  const { data: video } = await supabase
    .from('videos')
    .select('*')
    .eq('id', videoId)
    .eq('room_id', room.id)
    .single();

  if (video) {
    await handleVideoChange(socket, io, {
      youtube_video_id: video.youtube_video_id,
      title: video.title,
      channel_name: video.channel_name,
      channel_avatar: video.channel_avatar,
    });

    await supabase
      .from('videos')
      .update({ is_current: true, status: 'playing' })
      .eq('id', video.id);

    const { data: queue } = await supabase
      .from('videos')
      .select('*')
      .eq('room_id', room.id)
      .order('position', { ascending: true });

    io.to(roomSlug).emit('queue:updated', { queue: queue || [] });
  }
}

async function handleQueueClear(socket: AuthenticatedSocket, io: Server) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) return;

  await supabase
    .from('videos')
    .delete()
    .eq('room_id', room.id)
    .neq('is_current', true);

  io.to(roomSlug).emit('queue:updated', { queue: [] });
}

// ============================================
// Suggestion Handlers
// ============================================
async function handleSuggestionAdd(socket: AuthenticatedSocket, io: Server, data: { youtube_video_id: string; title?: string; channel_name?: string; thumbnail_url?: string }) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room) return;
  if (!socket.userData) {
    socket.emit('room:error', { message: 'You must be signed in to suggest videos' });
    return;
  }

  const { data: suggestion } = await supabase
    .from('suggestions')
    .insert({
      room_id: room.id,
      user_id: socket.userId,
      username: socket.userData.name,
      youtube_video_id: data.youtube_video_id,
      title: data.title || '',
      channel_name: data.channel_name || '',
      thumbnail_url: data.thumbnail_url || '',
      status: 'pending',
    })
    .select()
    .single();

  if (suggestion) {
    // Notify host about new suggestion
    io.to(roomSlug).emit('suggest:new', suggestion);

    // Update analytics
    try { await supabase.rpc('increment_suggestions', { room_id: room.id }); } catch {}
  }
}

async function handleSuggestionApprove(socket: AuthenticatedSocket, io: Server, suggestionId: string) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) return;

  const { data: suggestion } = await supabase
    .from('suggestions')
    .update({ status: 'approved', updated_at: new Date().toISOString() })
    .eq('id', suggestionId)
    .eq('room_id', room.id)
    .select()
    .single();

  if (suggestion) {
    io.to(roomSlug).emit('suggest:updated', suggestion);

    // Add to queue
    await handleQueueAdd(socket, io, {
      youtube_video_id: suggestion.youtube_video_id,
      title: suggestion.title,
      channel_name: suggestion.channel_name,
      thumbnail_url: suggestion.thumbnail_url,
    });
  }
}

async function handleSuggestionReject(socket: AuthenticatedSocket, io: Server, suggestionId: string) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) return;

  const { data: suggestion } = await supabase
    .from('suggestions')
    .update({ status: 'rejected', updated_at: new Date().toISOString() })
    .eq('id', suggestionId)
    .eq('room_id', room.id)
    .select()
    .single();

  if (suggestion) {
    io.to(roomSlug).emit('suggest:updated', suggestion);
  }
}

// ============================================
// Chat Handlers
// ============================================
async function handleChatSend(socket: AuthenticatedSocket, io: Server, message: string) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  if (!message?.trim()) return;
  if (message.length > 500) {
    socket.emit('room:error', { message: 'Message too long (max 500 characters)' });
    return;
  }

  const { data: room } = await supabase
    .from('rooms')
    .select('id')
    .eq('slug', roomSlug)
    .single();

  if (!room) return;

  // Check if user is muted
  const { data: isMuted } = await supabase
    .from('muted_users')
    .select('*')
    .eq('room_id', room.id)
    .eq('user_id', socket.userId)
    .single();

  if (isMuted) {
    socket.emit('room:error', { message: 'You are muted in this room' });
    return;
  }

  const username = socket.userData?.name || 'Anonymous';
  const avatar = socket.userData?.avatar || '';
  const userId = socket.userId || 'anonymous';

  // Sanitize message using xss package
  const sanitizedMessage = xss(message, {
    whiteList: {} as { [key: string]: string[] },
    stripIgnoreTag: true,
  }).trim();

  const { data: chatMessage } = await supabase
    .from('messages')
    .insert({
      room_id: room.id,
      user_id: userId,
      username,
      avatar,
      message: sanitizedMessage,
    })
    .select()
    .single();

  if (chatMessage) {
    io.to(roomSlug).emit('chat:message', chatMessage);

    // Update analytics
    try { await supabase.rpc('increment_chat_activity', { room_id: room.id }); } catch {}
  }
}

async function handleChatDelete(socket: AuthenticatedSocket, io: Server, messageId: string) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) return;

  await supabase
    .from('messages')
    .update({ is_deleted: true })
    .eq('id', messageId)
    .eq('room_id', room.id);

  io.to(roomSlug).emit('chat:deleted', { message_id: messageId });
}

async function handleChatMute(socket: AuthenticatedSocket, io: Server, targetUserId: string) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) return;

  await supabase
    .from('muted_users')
    .insert({
      room_id: room.id,
      user_id: targetUserId,
      muted_by: socket.userId,
    })
    .select()
    .single();

  io.to(roomSlug).emit('chat:muted', { user_id: targetUserId });
}

async function handleChatUnmute(socket: AuthenticatedSocket, io: Server, targetUserId: string) {
  const roomSlug = socket.currentRoom;
  if (!roomSlug) return;

  const { data: room } = await supabase
    .from('rooms')
    .select('id, host_id')
    .eq('slug', roomSlug)
    .single();

  if (!room || room.host_id !== socket.userId) return;

  await supabase
    .from('muted_users')
    .delete()
    .eq('room_id', room.id)
    .eq('user_id', targetUserId);

  io.to(roomSlug).emit('chat:unmuted', { user_id: targetUserId });
}
