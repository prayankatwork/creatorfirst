-- CreatorFirst Database Schema
-- Supabase PostgreSQL Migration

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES (extends Supabase Auth)
-- ============================================
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT,
  avatar TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public profiles are viewable by everyone"
  ON profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- ============================================
-- ROOMS
-- ============================================
CREATE TABLE rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  host_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rooms_slug ON rooms(slug);
CREATE INDEX idx_rooms_host_id ON rooms(host_id);

ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Rooms are viewable by everyone"
  ON rooms FOR SELECT
  USING (true);

CREATE POLICY "Hosts can create rooms"
  ON rooms FOR INSERT
  WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their own rooms"
  ON rooms FOR UPDATE
  USING (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their own rooms"
  ON rooms FOR DELETE
  USING (auth.uid() = host_id);

-- ============================================
-- ROOM MEMBERS (track who's in each room)
-- ============================================
CREATE TABLE room_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('host', 'viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

CREATE INDEX idx_room_members_room ON room_members(room_id);
CREATE INDEX idx_room_members_user ON room_members(user_id);

ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Room members are viewable by everyone"
  ON room_members FOR SELECT
  USING (true);

CREATE POLICY "Users can join rooms"
  ON room_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own membership"
  ON room_members FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================
-- VIDEOS (queue items and current video)
-- ============================================
CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  channel_name TEXT NOT NULL DEFAULT '',
  channel_avatar TEXT DEFAULT '',
  duration INTEGER DEFAULT 0,
  thumbnail_url TEXT DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'playing', 'played', 'skipped')),
  added_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_videos_room ON videos(room_id);
CREATE INDEX idx_videos_room_position ON videos(room_id, position);

ALTER TABLE videos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Videos are viewable by everyone"
  ON videos FOR SELECT
  USING (true);

CREATE POLICY "Hosts can manage videos"
  ON videos FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM room_members WHERE room_id = videos.room_id AND user_id = auth.uid() AND role = 'host'));

CREATE POLICY "Hosts can update videos"
  ON videos FOR UPDATE
  USING (EXISTS (SELECT 1 FROM room_members WHERE room_id = videos.room_id AND user_id = auth.uid() AND role = 'host'));

CREATE POLICY "Hosts can delete videos"
  ON videos FOR DELETE
  USING (EXISTS (SELECT 1 FROM room_members WHERE room_id = videos.room_id AND user_id = auth.uid() AND role = 'host'));

-- ============================================
-- PLAYBACK STATE (current playback state per room)
-- ============================================
CREATE TABLE playback_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID UNIQUE NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  youtube_video_id TEXT DEFAULT '',
  title TEXT DEFAULT '',
  channel_name TEXT DEFAULT '',
  channel_avatar TEXT DEFAULT '',
  timestamp DOUBLE PRECISION DEFAULT 0,
  playback_state TEXT NOT NULL DEFAULT 'paused' CHECK (playback_state IN ('playing', 'paused', 'buffering', 'ended')),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE playback_states ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Playback states are viewable by everyone"
  ON playback_states FOR SELECT
  USING (true);

CREATE POLICY "Hosts can update playback state"
  ON playback_states FOR UPDATE
  USING (EXISTS (SELECT 1 FROM room_members WHERE room_id = playback_states.room_id AND user_id = auth.uid() AND role = 'host'));

-- ============================================
-- SUGGESTIONS (viewer video suggestions)
-- ============================================
CREATE TABLE suggestions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  username TEXT NOT NULL DEFAULT '',
  youtube_video_id TEXT NOT NULL,
  title TEXT DEFAULT '',
  channel_name TEXT DEFAULT '',
  thumbnail_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_suggestions_room ON suggestions(room_id);
CREATE INDEX idx_suggestions_status ON suggestions(room_id, status);

ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Suggestions are viewable by everyone in the room"
  ON suggestions FOR SELECT
  USING (EXISTS (SELECT 1 FROM room_members WHERE room_id = suggestions.room_id AND user_id = auth.uid()));

CREATE POLICY "Viewers can create suggestions"
  ON suggestions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Hosts can update suggestions"
  ON suggestions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM room_members WHERE room_id = suggestions.room_id AND user_id = auth.uid() AND role = 'host'));

-- ============================================
-- MESSAGES (chat messages)
-- ============================================
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  username TEXT NOT NULL DEFAULT '',
  avatar TEXT DEFAULT '',
  message TEXT NOT NULL,
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_room ON messages(room_id, created_at);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages are viewable by everyone in the room"
  ON messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM room_members WHERE room_id = messages.room_id AND user_id = auth.uid()));

CREATE POLICY "Users can send messages"
  ON messages FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Hosts can delete messages"
  ON messages FOR UPDATE
  USING (EXISTS (SELECT 1 FROM room_members WHERE room_id = messages.room_id AND user_id = auth.uid() AND role = 'host'));

-- ============================================
-- MUTED USERS
-- ============================================
CREATE TABLE muted_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  muted_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

ALTER TABLE muted_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Muted users are viewable by hosts"
  ON muted_users FOR SELECT
  USING (EXISTS (SELECT 1 FROM room_members WHERE room_id = muted_users.room_id AND user_id = auth.uid() AND role = 'host'));

CREATE POLICY "Hosts can manage mutes"
  ON muted_users FOR INSERT
  USING (EXISTS (SELECT 1 FROM room_members WHERE room_id = muted_users.room_id AND user_id = auth.uid() AND role = 'host'));

CREATE POLICY "Hosts can unmute"
  ON muted_users FOR DELETE
  USING (EXISTS (SELECT 1 FROM room_members WHERE room_id = muted_users.room_id AND user_id = auth.uid() AND role = 'host'));

-- ============================================
-- SESSION HISTORY
-- ============================================
CREATE TABLE session_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL,
  title TEXT DEFAULT '',
  channel_name TEXT DEFAULT '',
  channel_avatar TEXT DEFAULT '',
  watched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_history_room ON session_history(room_id, watched_at);

ALTER TABLE session_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session history is viewable by everyone in the room"
  ON session_history FOR SELECT
  USING (EXISTS (SELECT 1 FROM room_members WHERE room_id = session_history.room_id AND user_id = auth.uid()));

CREATE POLICY "Hosts can insert history"
  ON session_history FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM room_members WHERE room_id = session_history.room_id AND user_id = auth.uid() AND role = 'host'));

-- ============================================
-- ROOM ANALYTICS
-- ============================================
CREATE TABLE room_analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID UNIQUE NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  total_visitors INTEGER NOT NULL DEFAULT 0,
  peak_concurrent INTEGER NOT NULL DEFAULT 0,
  session_duration_seconds INTEGER NOT NULL DEFAULT 0,
  videos_watched INTEGER NOT NULL DEFAULT 0,
  queue_activity INTEGER NOT NULL DEFAULT 0,
  chat_activity INTEGER NOT NULL DEFAULT 0,
  suggestions_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE room_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Analytics are viewable by hosts"
  ON room_analytics FOR SELECT
  USING (EXISTS (SELECT 1 FROM room_members WHERE room_id = room_analytics.room_id AND user_id = auth.uid() AND role = 'host'));

CREATE POLICY "Hosts can update analytics"
  ON room_analytics FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM room_members WHERE room_id = room_analytics.room_id AND user_id = auth.uid() AND role = 'host'));

CREATE POLICY "Hosts can modify analytics"
  ON room_analytics FOR UPDATE
  USING (EXISTS (SELECT 1 FROM room_members WHERE room_id = room_analytics.room_id AND user_id = auth.uid() AND role = 'host'));

-- ============================================
-- TRIGGERS & FUNCTIONS
-- ============================================

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, avatar)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Update updated_at on rooms
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Initialize analytics on room creation
CREATE OR REPLACE FUNCTION public.handle_new_room()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.room_analytics (room_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_room_created
  AFTER INSERT ON rooms
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_room();
