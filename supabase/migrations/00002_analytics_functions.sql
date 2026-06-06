-- CreatorFirst Analytics Functions
-- Migration 00002: Add RPC functions for analytics incrementing

-- Increment total visitors
CREATE OR REPLACE FUNCTION public.increment_visitors(room_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.room_analytics
  SET total_visitors = total_visitors + 1,
      updated_at = NOW()
  WHERE room_analytics.room_id = increment_visitors.room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment videos watched
CREATE OR REPLACE FUNCTION public.increment_videos_watched(room_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.room_analytics
  SET videos_watched = videos_watched + 1,
      updated_at = NOW()
  WHERE room_analytics.room_id = increment_videos_watched.room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment queue activity
CREATE OR REPLACE FUNCTION public.increment_queue_activity(room_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.room_analytics
  SET queue_activity = queue_activity + 1,
      updated_at = NOW()
  WHERE room_analytics.room_id = increment_queue_activity.room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment chat activity
CREATE OR REPLACE FUNCTION public.increment_chat_activity(room_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.room_analytics
  SET chat_activity = chat_activity + 1,
      updated_at = NOW()
  WHERE room_analytics.room_id = increment_chat_activity.room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Increment suggestions count
CREATE OR REPLACE FUNCTION public.increment_suggestions(room_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE public.room_analytics
  SET suggestions_count = suggestions_count + 1,
      updated_at = NOW()
  WHERE room_analytics.room_id = increment_suggestions.room_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
