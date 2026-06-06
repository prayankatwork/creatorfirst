'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getSocket, disconnectSocket } from '@/lib/socket';
import type {
  RoomState,
  PlaybackState,
  Video,
  ChatMessage,
  Suggestion,
  SessionHistoryEntry,
  UserProfile,
  RoomMember,
  RoomAnalytics,
  ServerToClientEvents,
} from '@/types';

interface UseSocketReturn {
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

export function useSocket(): UseSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<ReturnType<typeof getSocket>>(undefined);
  const roomSlugRef = useRef<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    socketRef.current = socket;

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('connect_error', (err) => setError(err.message));

    socket.on('room:state', (state: RoomState) => {
      setRoomState(state);
      setError(null);
    });

    socket.on('room:error', (data: { message: string }) => {
      setError(data.message);
    });

    socket.on('room:deleted', () => {
      setRoomState(null);
      setError('Room has been deleted');
    });

    socket.on('video:state-change', (data: PlaybackState) => {
      setRoomState(prev => prev ? {
        ...prev,
        playback: data,
        current_video_info: {
          video_id: data.youtube_video_id,
          title: data.title,
          channel_name: data.channel_name,
          channel_avatar: data.channel_avatar,
        },
      } : null);
    });

    socket.on('queue:updated', (data: { queue: Video[] }) => {
      setRoomState(prev => prev ? { ...prev, queue: data.queue } : null);
    });

    socket.on('chat:message', (data: ChatMessage) => {
      setRoomState(prev => prev ? { ...prev, messages: [...prev.messages, data] } : null);
    });

    socket.on('chat:deleted', (data: { message_id: string }) => {
      setRoomState(prev => prev ? {
        ...prev,
        messages: prev.messages.map(m =>
          m.id === data.message_id ? { ...m, is_deleted: true } : m
        ),
      } : null);
    });

    socket.on('suggest:new', (data: Suggestion) => {
      setRoomState(prev => prev ? {
        ...prev,
        suggestions: [data, ...prev.suggestions],
      } : null);
    });

    socket.on('suggest:updated', (data: Suggestion) => {
      setRoomState(prev => prev ? {
        ...prev,
        suggestions: prev.suggestions.map(s =>
          s.id === data.id ? data : s
        ),
      } : null);
    });

    socket.on('room:user-joined', (data: { user: UserProfile }) => {
      // Handled by room:users
    });

    socket.on('room:user-left', (data: { user_id: string }) => {
      setRoomState(prev => prev ? {
        ...prev,
        members: prev.members.filter(m => m.user_id !== data.user_id),
      } : null);
    });

    socket.on('room:users', (data: { users: UserProfile[] }) => {
      // Update members list with current users
    });

    socket.on('chat:muted', (data: { user_id: string }) => {
      setRoomState(prev => prev ? {
        ...prev,
        muted_users: [...prev.muted_users, data.user_id],
      } : null);
    });

    socket.on('chat:unmuted', (data: { user_id: string }) => {
      setRoomState(prev => prev ? {
        ...prev,
        muted_users: prev.muted_users.filter(id => id !== data.user_id),
      } : null);
    });

    socket.on('history:new', (data: SessionHistoryEntry) => {
      setRoomState(prev => prev ? {
        ...prev,
        history: [data, ...prev.history],
      } : null);
    });

    socket.on('analytics:update', (data: Partial<RoomAnalytics>) => {
      setRoomState(prev => prev && prev.analytics ? {
        ...prev,
        analytics: { ...prev.analytics, ...data },
      } : null);
    });

    return () => {
      if (roomSlugRef.current) {
        socket.emit('room:leave');
      }
      socket.removeAllListeners();
    };
  }, []);

  const joinRoom = useCallback((slug: string, token?: string) => {
    const socket = getSocket(token);
    roomSlugRef.current = slug;
    socket.emit('room:join', { room_slug: slug });
  }, []);

  const leaveRoom = useCallback(() => {
    const socket = socketRef.current;
    if (socket && roomSlugRef.current) {
      socket.emit('room:leave');
      roomSlugRef.current = null;
      setRoomState(null);
      setError(null);
    }
  }, []);

  const emit = useCallback((event: string, data?: any) => {
    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit(event, data);
    }
  }, []);

  return {
    isConnected,
    roomState,
    error,
    joinRoom,
    leaveRoom,

    // Video
    playVideo: useCallback(() => emit('video:play'), [emit]),
    pauseVideo: useCallback(() => emit('video:pause'), [emit]),
    seekVideo: useCallback((timestamp: number) => emit('video:seek', { timestamp }), [emit]),
    changeVideo: useCallback((data) => emit('video:change', data), [emit]),
    requestSync: useCallback(() => emit('video:sync-request'), [emit]),

    // Queue
    addToQueue: useCallback((data) => emit('queue:add', data), [emit]),
    removeFromQueue: useCallback((videoId: string) => emit('queue:remove', { video_id: videoId }), [emit]),
    reorderQueue: useCallback((videoIds: string[]) => emit('queue:reorder', { video_ids: videoIds }), [emit]),
    skipVideo: useCallback(() => emit('queue:skip'), [emit]),
    playNow: useCallback((videoId: string) => emit('queue:play-now', { video_id: videoId }), [emit]),
    clearQueue: useCallback(() => emit('queue:clear'), [emit]),

    // Suggestions
    suggestVideo: useCallback((data) => emit('suggest:add', data), [emit]),
    approveSuggestion: useCallback((suggestionId: string) => emit('suggest:approve', { suggestion_id: suggestionId }), [emit]),
    rejectSuggestion: useCallback((suggestionId: string) => emit('suggest:reject', { suggestion_id: suggestionId }), [emit]),

    // Chat
    sendMessage: useCallback((message: string) => emit('chat:send', { message }), [emit]),
    deleteMessage: useCallback((messageId: string) => emit('chat:delete', { message_id: messageId }), [emit]),
    muteUser: useCallback((userId: string) => emit('chat:mute', { user_id: userId }), [emit]),
    unmuteUser: useCallback((userId: string) => emit('chat:unmute', { user_id: userId }), [emit]),
  };
}
