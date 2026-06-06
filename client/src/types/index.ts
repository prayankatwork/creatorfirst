// ============================================
// CreatorFirst - Shared Type Definitions
// ============================================

// --- Users & Auth ---
export interface UserProfile {
  id: string;
  name: string;
  email?: string;
  avatar: string;
  created_at: string;
}

// --- Rooms ---
export interface Room {
  id: string;
  slug: string;
  title: string;
  description: string;
  host_id: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  host?: UserProfile;
}

export interface RoomMember {
  id: string;
  room_id: string;
  user_id: string;
  role: 'host' | 'viewer';
  joined_at: string;
  last_active_at: string;
  profile?: UserProfile;
}

// --- Videos & Playback ---
export interface Video {
  id: string;
  room_id: string;
  youtube_video_id: string;
  title: string;
  channel_name: string;
  channel_avatar: string;
  duration: number;
  thumbnail_url: string;
  position: number;
  is_current: boolean;
  status: 'queued' | 'playing' | 'played' | 'skipped';
  added_by?: string;
  created_at: string;
}

export type PlaybackStateType = 'playing' | 'paused' | 'buffering' | 'ended';

export interface PlaybackState {
  room_id: string;
  youtube_video_id: string;
  title: string;
  channel_name: string;
  channel_avatar: string;
  timestamp: number;
  playback_state: PlaybackStateType;
  last_updated: string;
}

// --- Suggestions ---
export interface Suggestion {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  youtube_video_id: string;
  title: string;
  channel_name: string;
  thumbnail_url: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

// --- Chat ---
export interface ChatMessage {
  id: string;
  room_id: string;
  user_id: string;
  username: string;
  avatar: string;
  message: string;
  is_deleted: boolean;
  created_at: string;
}

export interface MutedUser {
  id: string;
  room_id: string;
  user_id: string;
  muted_by: string;
  created_at: string;
}

// --- Session History ---
export interface SessionHistoryEntry {
  id: string;
  room_id: string;
  youtube_video_id: string;
  title: string;
  channel_name: string;
  channel_avatar: string;
  watched_at: string;
}

// --- Analytics ---
export interface RoomAnalytics {
  id: string;
  room_id: string;
  total_visitors: number;
  peak_concurrent: number;
  session_duration_seconds: number;
  videos_watched: number;
  queue_activity: number;
  chat_activity: number;
  suggestions_count: number;
  updated_at: string;
}

// --- Socket.IO Event Types ---

// Client -> Server events
export interface ClientToServerEvents {
  'room:join': (data: { room_slug: string }) => void;
  'room:leave': () => void;
  'video:play': () => void;
  'video:pause': () => void;
  'video:seek': (data: { timestamp: number }) => void;
  'video:change': (data: { youtube_video_id: string; title?: string; channel_name?: string; channel_avatar?: string }) => void;
  'video:sync-request': () => void;
  'queue:add': (data: { youtube_video_id: string; title?: string; channel_name?: string; channel_avatar?: string; thumbnail_url?: string; duration?: number }) => void;
  'queue:remove': (data: { video_id: string }) => void;
  'queue:reorder': (data: { video_ids: string[] }) => void;
  'queue:skip': () => void;
  'queue:play-now': (data: { video_id: string }) => void;
  'queue:clear': () => void;
  'suggest:add': (data: { youtube_video_id: string; title?: string; channel_name?: string; thumbnail_url?: string }) => void;
  'suggest:approve': (data: { suggestion_id: string }) => void;
  'suggest:reject': (data: { suggestion_id: string }) => void;
  'chat:send': (data: { message: string }) => void;
  'chat:delete': (data: { message_id: string }) => void;
  'chat:mute': (data: { user_id: string }) => void;
  'chat:unmute': (data: { user_id: string }) => void;
}

// Server -> Client events
export interface ServerToClientEvents {
  'room:state': (data: RoomState) => void;
  'room:user-joined': (data: { user: UserProfile }) => void;
  'room:user-left': (data: { user_id: string }) => void;
  'room:users': (data: { users: UserProfile[] }) => void;
  'room:error': (data: { message: string }) => void;
  'room:deleted': () => void;
  'video:state-change': (data: PlaybackState) => void;
  'video:sync': (data: { timestamp: number; playback_state: PlaybackStateType }) => void;
  'queue:updated': (data: { queue: Video[] }) => void;
  'suggest:new': (data: Suggestion) => void;
  'suggest:updated': (data: Suggestion) => void;
  'chat:message': (data: ChatMessage) => void;
  'chat:deleted': (data: { message_id: string }) => void;
  'chat:muted': (data: { user_id: string }) => void;
  'chat:unmuted': (data: { user_id: string }) => void;
  'analytics:update': (data: Partial<RoomAnalytics>) => void;
  'history:new': (data: SessionHistoryEntry) => void;
}

// --- Room State (sent on join) ---
export interface RoomState {
  room: Room;
  playback: PlaybackState | null;
  queue: Video[];
  messages: ChatMessage[];
  suggestions: Suggestion[];
  members: RoomMember[];
  muted_users: string[];
  history: SessionHistoryEntry[];
  analytics: RoomAnalytics | null;
  current_video_info: {
    video_id: string;
    title: string;
    channel_name: string;
    channel_avatar: string;
  } | null;
}

// --- YouTube Video Info ---
export interface YouTubeVideoInfo {
  videoId: string;
  title: string;
  channelName: string;
  channelAvatar: string;
  thumbnailUrl: string;
  duration: number;
}
