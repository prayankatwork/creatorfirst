'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase';
import type { RealtimeChannel, SupabaseClient, User } from '@supabase/supabase-js';
import type { RoomState, PlaybackState, PlaybackStateType, ChatMessage, Suggestion, SessionHistoryEntry, RoomAnalytics } from '@/types';

interface UseRoomReturn {
  isConnected: boolean;
  roomState: RoomState | null;
  error: string | null;
  joinRoom: (slug: string, token?: string) => void;
  leaveRoom: () => void;

  // Video controls
  playVideo: () => void;
  pauseVideo: () => void;
  seekVideo: (timestamp: number) => void;
  changeVideo: (data: { youtube_video_id: string; title?: string; channel_name?: string; channel_avatar?: string }) => void;
  requestSync: () => void;

  // Queue controls
  addToQueue: (data: { youtube_video_id: string; title?: string; channel_name?: string; channel_avatar?: string; thumbnail_url?: string; duration?: number }) => void;
  removeFromQueue: (videoId: string) => void;
  reorderQueue: (videoIds: string[]) => void;
  skipVideo: () => void;
  playNow: (videoId: string) => void;
  clearQueue: () => void;

  // Suggestion controls
  suggestVideo: (data: { youtube_video_id: string; title?: string; channel_name?: string; thumbnail_url?: string }) => void;
  approveSuggestion: (suggestionId: string) => void;
  rejectSuggestion: (suggestionId: string) => void;

  // Chat controls
  sendMessage: (message: string) => void;
  deleteMessage: (messageId: string) => void;
  muteUser: (userId: string) => void;
  unmuteUser: (userId: string) => void;
}

function sanitizeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function useRoom(): UseRoomReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const supabaseRef = useRef<SupabaseClient | null>(null);
  const currentUserRef = useRef<User | null>(null);
  const roomIdRef = useRef<string | null>(null);
  const slugRef = useRef<string | null>(null);

  const fetchRoomState = useCallback(async (supabase: SupabaseClient, slug: string): Promise<RoomState | null> => {
    const { data: room } = await supabase
      .from('rooms')
      .select('*, host:profiles(*)')
      .eq('slug', slug)
      .single();

    if (!room) return null;
    roomIdRef.current = room.id;

    const [
      { data: playback },
      { data: queue },
      { data: messages },
      { data: suggestions },
      { data: members },
      { data: muted },
      { data: history },
      { data: analytics },
    ] = await Promise.all([
      supabase.from('playback_states').select('*').eq('room_id', room.id).single(),
      supabase.from('videos').select('*').eq('room_id', room.id).order('position', { ascending: true }),
      supabase.from('messages').select('*').eq('room_id', room.id).eq('is_deleted', false).order('created_at', { ascending: true }).limit(100),
      supabase.from('suggestions').select('*').eq('room_id', room.id).order('created_at', { ascending: false }).limit(50),
      supabase.from('room_members').select('*, profile:profiles(*)').eq('room_id', room.id),
      supabase.from('muted_users').select('user_id').eq('room_id', room.id),
      supabase.from('session_history').select('*').eq('room_id', room.id).order('watched_at', { ascending: false }).limit(50),
      supabase.from('room_analytics').select('*').eq('room_id', room.id).single(),
    ]);

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
  }, []);

  const joinRoom = useCallback(async (slug: string, token?: string) => {
    if (channelRef.current) {
      channelRef.current.unsubscribe();
    }
    setError(null);
    slugRef.current = slug;

    const supabase = createClient();
    supabaseRef.current = supabase;

    let currentUser: User | null = null;
    try {
      const { data: { user } } = token
        ? await supabase.auth.getUser(token)
        : await supabase.auth.getUser();
      currentUser = user;
    } catch {}
    currentUserRef.current = currentUser;

    const state = await fetchRoomState(supabase, slug);
    if (!state) {
      setError('Room not found');
      return;
    }
    setRoomState(state);

    if (currentUser) {
      const isHost = state.room.host_id === currentUser.id;
      const { data: existing } = await supabase
        .from('room_members')
        .select('*')
        .eq('room_id', state.room.id)
        .eq('user_id', currentUser.id)
        .single();

      if (existing) {
        await supabase
          .from('room_members')
          .update({ last_active_at: new Date().toISOString() })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('room_members')
          .insert({ room_id: state.room.id, user_id: currentUser.id, role: isHost ? 'host' : 'viewer' });
      }

      try { await supabase.rpc('increment_visitors', { room_id: state.room.id }); } catch {}
    }

    const channel = supabase.channel(`room:${slug}`, {
      config: {
        broadcast: { self: true },
        presence: { key: currentUser?.id || 'anon-' + Math.random().toString(36).slice(2) },
      },
    });    // Broadcast listeners for instant video sync (low latency, no DB roundtrip)
    channel.on('broadcast', { event: 'video:play' }, () => {
      setRoomState(prev => prev && prev.playback ? {
        ...prev,
        playback: { ...prev.playback, playback_state: 'playing' as PlaybackStateType },
      } : prev);
    });

    channel.on('broadcast', { event: 'video:pause' }, () => {
      setRoomState(prev => prev && prev.playback ? {
        ...prev,
        playback: { ...prev.playback, playback_state: 'paused' as PlaybackStateType },
      } : prev);
    });

    channel.on('broadcast', { event: 'video:seek' }, (payload: any) => {
      setRoomState(prev => prev && prev.playback ? {
        ...prev,
        playback: { ...prev.playback, timestamp: payload.timestamp },
      } : prev);
    });

    channel.on('broadcast', { event: 'video:sync' }, (payload: any) => {
      setRoomState(prev => prev && prev.playback ? {
        ...prev,
        playback: { ...prev.playback, timestamp: payload.timestamp, playback_state: payload.playback_state as PlaybackStateType },
      } : prev);
    });

    // Postgres Changes for DB-backed features
    const roomFilter = `room_id=eq.${state.room.id}` as const;

    // Messages - new
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: roomFilter } as const, (payload: any) => {
      const msg = payload.new as ChatMessage;
      setRoomState(prev => prev ? { ...prev, messages: [...prev.messages, msg] } : null);
      try { supabase.rpc('increment_chat_activity', { room_id: state.room.id }); } catch {}
    });

    // Messages - delete
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: roomFilter } as const, (payload: any) => {
      const updated = payload.new as ChatMessage;
      setRoomState(prev => prev ? {
        ...prev,
        messages: prev.messages.map(m => m.id === updated.id ? { ...m, is_deleted: updated.is_deleted } : m),
      } : null);
    });

    // Videos (queue) - all events
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'videos', filter: roomFilter } as const, async (payload: any) => {
      const { data: queue } = await supabase.from('videos').select('*').eq('room_id', state.room.id).order('position', { ascending: true });
      setRoomState(prev => prev ? { ...prev, queue: queue || [] } : null);
    });

    // Suggestions - all events
    channel.on('postgres_changes', { event: '*', schema: 'public', table: 'suggestions', filter: roomFilter } as const, async (payload: any) => {
      const { data: suggestions } = await supabase.from('suggestions').select('*').eq('room_id', state.room.id).order('created_at', { ascending: false }).limit(50);
      setRoomState(prev => prev ? { ...prev, suggestions: suggestions || [] } : null);
    });

    // Playback state changes
    channel.on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'playback_states', filter: roomFilter } as const, (payload: any) => {
      const pb = payload.new as PlaybackState;
      setRoomState(prev => prev ? {
        ...prev,
        playback: pb,
        current_video_info: { video_id: pb.youtube_video_id, title: pb.title, channel_name: pb.channel_name, channel_avatar: pb.channel_avatar },
      } : null);
    });

    // Session history
    channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'session_history', filter: roomFilter } as const, (payload: any) => {
      const entry = payload.new as SessionHistoryEntry;
      setRoomState(prev => prev ? { ...prev, history: [entry, ...prev.history] } : null);
    });

    // Presence
    channel.on('presence', { event: 'sync' }, () => {
      // Re-fetch members to update online status
      supabase.from('room_members')
        .select('*, profile:profiles(*)')
        .eq('room_id', state.room.id)
        .then(({ data: members }) => {
          if (members) {
            setRoomState(prev => prev ? { ...prev, members } : null);
          }
        });
    });

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        setIsConnected(true);
        await channel.track({
          user_id: currentUser?.id || 'anonymous',
          name: currentUser?.user_metadata?.full_name || currentUser?.email?.split('@')[0] || 'Anonymous',
          avatar: currentUser?.user_metadata?.avatar_url || '',
          online_at: new Date().toISOString(),
        });
      }
    });

    channelRef.current = channel;
  }, [fetchRoomState]);

  const leaveRoom = useCallback(async () => {
    const slug = slugRef.current;
    const user = currentUserRef.current;
    const supabase = supabaseRef.current;

    if (slug && user && supabase) {
      const { data: room } = await supabase
        .from('rooms')
        .select('id')
        .eq('slug', slug)
        .single();
      if (room) {
        await supabase
          .from('room_members')
          .update({ last_active_at: new Date().toISOString() })
          .eq('room_id', room.id)
          .eq('user_id', user.id);
      }
    }

    if (channelRef.current) {
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    supabaseRef.current = null;
    currentUserRef.current = null;
    roomIdRef.current = null;
    slugRef.current = null;
    setRoomState(null);
    setError(null);
    setIsConnected(false);
  }, []);

  const broadcast = useCallback((event: string, payload?: Record<string, unknown>) => {
    channelRef.current?.send({ type: 'broadcast', event, payload: payload || {} });
  }, []);

  // Video controls
  const playVideo = useCallback(async () => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) { setError('Only the host can control playback'); return; }

    await supabase.from('playback_states').update({ playback_state: 'playing', last_updated: new Date().toISOString() }).eq('room_id', roomId);
    broadcast('video:play');
  }, [broadcast]);

  const pauseVideo = useCallback(async () => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) { setError('Only the host can control playback'); return; }

    const { data: playback } = await supabase.from('playback_states').select('timestamp').eq('room_id', roomId).single();
    await supabase.from('playback_states').update({ playback_state: 'paused', timestamp: playback?.timestamp || 0, last_updated: new Date().toISOString() }).eq('room_id', roomId);
    broadcast('video:pause');
  }, [broadcast]);

  const seekVideo = useCallback(async (timestamp: number) => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) { setError('Only the host can control playback'); return; }

    const safeTimestamp = Math.max(0, Math.floor(timestamp));
    await supabase.from('playback_states').update({ timestamp: safeTimestamp, last_updated: new Date().toISOString() }).eq('room_id', roomId);
    broadcast('video:seek', { timestamp: safeTimestamp });
  }, [broadcast]);

  const changeVideo = useCallback(async (data: { youtube_video_id: string; title?: string; channel_name?: string; channel_avatar?: string }) => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) { setError('Only the host can change videos'); return; }

    const { youtube_video_id, title = '', channel_name = '', channel_avatar = '' } = data;

    await supabase.from('videos').update({ is_current: false, status: 'played' }).eq('room_id', roomId).eq('status', 'playing');

    const { data: existingPlayback } = await supabase.from('playback_states').select('*').eq('room_id', roomId).single();
    if (existingPlayback) {
      await supabase.from('playback_states').update({ youtube_video_id, title, channel_name, channel_avatar, timestamp: 0, playback_state: 'paused', last_updated: new Date().toISOString() }).eq('room_id', roomId);
    } else {
      await supabase.from('playback_states').insert({ room_id: roomId, youtube_video_id, title, channel_name, channel_avatar, timestamp: 0, playback_state: 'paused' });
    }

    await supabase.from('session_history').insert({ room_id: roomId, youtube_video_id, title, channel_name, channel_avatar });
    try { await supabase.rpc('increment_videos_watched', { room_id: roomId }); } catch {}
  }, []);

  const requestSync = useCallback(async () => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    if (!supabase || !roomId) return;

    const { data: state } = await supabase.from('playback_states').select('*').eq('room_id', roomId).single();
    if (state) {
      broadcast('video:sync', { timestamp: state.timestamp, playback_state: state.playback_state });
    }
  }, [broadcast]);

  // Queue controls
  const addToQueue = useCallback(async (data: { youtube_video_id: string; title?: string; channel_name?: string; channel_avatar?: string; thumbnail_url?: string; duration?: number }) => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    if (!supabase || !roomId) return;

    const { data: lastVideo } = await supabase.from('videos').select('position').eq('room_id', roomId).order('position', { ascending: false }).limit(1).single();
    const nextPosition = (lastVideo?.position ?? -1) + 1;

    await supabase.from('videos').insert({
      room_id: roomId, youtube_video_id: data.youtube_video_id, title: data.title || '', channel_name: data.channel_name || '',
      channel_avatar: data.channel_avatar || '', thumbnail_url: data.thumbnail_url || '', duration: data.duration || 0,
      position: nextPosition, added_by: currentUserRef.current?.id,
    });
    try { await supabase.rpc('increment_queue_activity', { room_id: roomId }); } catch {}
  }, []);

  const removeFromQueue = useCallback(async (videoId: string) => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId || !userId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) return;

    await supabase.from('videos').delete().eq('id', videoId).eq('room_id', roomId);
    const { data: remaining } = await supabase.from('videos').select('*').eq('room_id', roomId).order('position', { ascending: true });
    if (remaining) {
      for (let i = 0; i < remaining.length; i++) {
        await supabase.from('videos').update({ position: i }).eq('id', remaining[i].id);
      }
    }
  }, []);

  const reorderQueue = useCallback(async (videoIds: string[]) => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId || !userId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) return;

    for (let i = 0; i < videoIds.length; i++) {
      await supabase.from('videos').update({ position: i }).eq('id', videoIds[i]).eq('room_id', roomId);
    }
  }, []);

  const skipVideo = useCallback(async () => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId || !userId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) return;

    const { data: nextVideo } = await supabase.from('videos').select('*').eq('room_id', roomId).eq('status', 'queued').order('position', { ascending: true }).limit(1).single();
    if (nextVideo) {
      await changeVideo({ youtube_video_id: nextVideo.youtube_video_id, title: nextVideo.title, channel_name: nextVideo.channel_name, channel_avatar: nextVideo.channel_avatar });
      await supabase.from('videos').update({ is_current: true, status: 'playing' }).eq('id', nextVideo.id);
    }
  }, [changeVideo]);

  const playNow = useCallback(async (videoId: string) => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId || !userId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) return;

    const { data: video } = await supabase.from('videos').select('*').eq('id', videoId).eq('room_id', roomId).single();
    if (video) {
      await changeVideo({ youtube_video_id: video.youtube_video_id, title: video.title, channel_name: video.channel_name, channel_avatar: video.channel_avatar });
      await supabase.from('videos').update({ is_current: true, status: 'playing' }).eq('id', video.id);
    }
  }, [changeVideo]);

  const clearQueue = useCallback(async () => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId || !userId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) return;

    await supabase.from('videos').delete().eq('room_id', roomId).neq('is_current', true);
  }, []);

  // Suggestion controls
  const suggestVideo = useCallback(async (data: { youtube_video_id: string; title?: string; channel_name?: string; thumbnail_url?: string }) => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const user = currentUserRef.current;
    if (!supabase || !roomId || !user) { setError('You must be signed in to suggest videos'); return; }

    await supabase.from('suggestions').insert({
      room_id: roomId, user_id: user.id, username: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Anonymous',
      youtube_video_id: data.youtube_video_id, title: data.title || '', channel_name: data.channel_name || '',
      thumbnail_url: data.thumbnail_url || '', status: 'pending',
    });
    try { await supabase.rpc('increment_suggestions', { room_id: roomId }); } catch {}
  }, []);

  const approveSuggestion = useCallback(async (suggestionId: string) => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId || !userId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) return;

    const { data: suggestion } = await supabase.from('suggestions').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', suggestionId).eq('room_id', roomId).select().single();
    if (suggestion) {
      const { data: lastVideo } = await supabase.from('videos').select('position').eq('room_id', roomId).order('position', { ascending: false }).limit(1).single();
      const nextPosition = (lastVideo?.position ?? -1) + 1;
      await supabase.from('videos').insert({ room_id: roomId, youtube_video_id: suggestion.youtube_video_id, title: suggestion.title, channel_name: suggestion.channel_name, thumbnail_url: suggestion.thumbnail_url, position: nextPosition, added_by: userId });
      try { await supabase.rpc('increment_queue_activity', { room_id: roomId }); } catch {}
    }
  }, []);

  const rejectSuggestion = useCallback(async (suggestionId: string) => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId || !userId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) return;

    await supabase.from('suggestions').update({ status: 'rejected', updated_at: new Date().toISOString() }).eq('id', suggestionId).eq('room_id', roomId);
  }, []);

  // Chat controls
  const sendMessage = useCallback(async (message: string) => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const user = currentUserRef.current;
    if (!supabase || !roomId) return;
    if (!message?.trim() || message.length > 500) { if (message.length > 500) setError('Message too long (max 500 characters)'); return; }

    if (user) {
      const { data: isMuted } = await supabase.from('muted_users').select('*').eq('room_id', roomId).eq('user_id', user.id).single();
      if (isMuted) { setError('You are muted in this room'); return; }
    }

    await supabase.from('messages').insert({
      room_id: roomId, user_id: user?.id || 'anonymous', username: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Anonymous',
      avatar: user?.user_metadata?.avatar_url || '', message: sanitizeHtml(message.trim()),
    });
  }, []);

  const deleteMessage = useCallback(async (messageId: string) => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId || !userId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) return;

    await supabase.from('messages').update({ is_deleted: true }).eq('id', messageId).eq('room_id', roomId);
  }, []);

  const muteUser = useCallback(async (targetUserId: string) => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId || !userId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) return;

    await supabase.from('muted_users').insert({ room_id: roomId, user_id: targetUserId, muted_by: userId });
  }, []);

  const unmuteUser = useCallback(async (targetUserId: string) => {
    const supabase = supabaseRef.current;
    const roomId = roomIdRef.current;
    const userId = currentUserRef.current?.id;
    if (!supabase || !roomId || !userId) return;

    const { data: room } = await supabase.from('rooms').select('host_id').eq('id', roomId).single();
    if (!room || room.host_id !== userId) return;

    await supabase.from('muted_users').delete().eq('room_id', roomId).eq('user_id', targetUserId);
  }, []);

  useEffect(() => {
    return () => { if (channelRef.current) channelRef.current.unsubscribe(); };
  }, []);

  return {
    isConnected, roomState, error, joinRoom, leaveRoom,
    playVideo, pauseVideo, seekVideo, changeVideo, requestSync,
    addToQueue, removeFromQueue, reorderQueue, skipVideo, playNow, clearQueue,
    suggestVideo, approveSuggestion, rejectSuggestion,
    sendMessage, deleteMessage, muteUser, unmuteUser,
  };
}
