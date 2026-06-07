'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useRoom } from '@/hooks/useRoom';
import { FiHome, FiUsers, FiCopy, FiYoutube, FiMaximize2, FiMinimize2 } from 'react-icons/fi';
import { extractYoutubeId } from '@/lib/utils';

// Dynamically import components to avoid SSR issues
import dynamic from 'next/dynamic';

const YouTubePlayer = dynamic(
  () => import('@/components/youtube/YouTubePlayer'),
  { ssr: false }
);

const ChatPanel = dynamic(
  () => import('@/components/chat/ChatPanel'),
  { ssr: false }
);

const VideoQueue = dynamic(
  () => import('@/components/queue/VideoQueue'),
  { ssr: false }
);

const CreatorInfo = dynamic(
  () => import('@/components/youtube/CreatorInfo'),
  { ssr: false }
);

const VideoInput = dynamic(
  () => import('@/components/youtube/VideoInput'),
  { ssr: false }
);

const SuggestionPanel = dynamic(
  () => import('@/components/queue/SuggestionPanel'),
  { ssr: false }
);

const AnalyticsPanel = dynamic(
  () => import('@/components/analytics/AnalyticsPanel'),
  { ssr: false }
);

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { user } = useAuth();
  const socket = useRoom();
  const [activePanel, setActivePanel] = useState<'chat' | 'queue' | 'suggestions' | 'analytics'>('chat');
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (slug) {
      // Get session token for socket auth
      const getToken = async () => {
        try {
          socket.joinRoom(slug);
        } catch {
          socket.joinRoom(slug);
        }
      };
      getToken();
    }

    return () => {
      socket.leaveRoom();
    };
  }, [slug]);

  const isHost = user && socket.roomState?.room?.host_id === user.id;
  const roomState = socket.roomState;

  const copyRoomLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (socket.error && !roomState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/20 flex items-center justify-center mx-auto mb-4">
            <FiHome className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-xl font-bold mb-2">Room Not Found</h2>
          <p className="text-surface-400 mb-6">{socket.error}</p>
          <button onClick={() => router.push('/')} className="btn-primary">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (!roomState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-surface-400">Joining room...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-surface-950/90 backdrop-blur-xl border-b border-surface-800/50 h-12">
        <div className="flex items-center justify-between h-full px-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/')}
              className="w-7 h-7 rounded-md bg-gradient-to-br from-brand-500 to-purple-600 flex items-center justify-center hover:opacity-90 transition-opacity"
            >
              <FiHome className="w-3.5 h-3.5 text-white" />
            </button>
            <div className="h-4 w-px bg-surface-700" />
            <h1 className="text-sm font-semibold truncate max-w-[120px] sm:max-w-[200px]">
              {roomState.room.title}
            </h1>
            <span className="hidden sm:inline text-xs text-surface-500 font-mono">/{roomState.room.slug}</span>
          </div>

          <div className="flex items-center gap-2">
            {/* Connection status */}
            <div className={`w-1.5 h-1.5 rounded-full ${socket.isConnected ? 'bg-green-400' : 'bg-red-400'}`} />
            <span className="text-xs text-surface-500 hidden sm:inline">
              {socket.isConnected ? 'Connected' : 'Reconnecting...'}
            </span>

            {/* Live viewer count — shows exact real-time count */}
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-surface-800/60 border border-surface-700/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-400" />
              </span>
              <FiUsers className="w-3 h-3 text-surface-400" />
              <span className="text-xs font-medium text-surface-300 tabular-nums">
                {roomState.members.filter(m => (m as any).is_online !== false).length || roomState.members.length}
              </span>
            </span>

            {/* Copy link */}
            <button
              onClick={copyRoomLink}
              className="btn-ghost text-xs px-2 py-1"
            >
              <FiCopy className="w-3 h-3" />
              {copied ? 'Copied!' : 'Share'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <main className="pt-12 h-screen flex flex-col lg:flex-row">
        {/* Left Section: Video Player */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* YouTube Player */}
          <div className="relative bg-black">
            <YouTubePlayer
              roomState={roomState}
              isHost={!!isHost}
              onPlay={socket.playVideo}
              onPause={socket.pauseVideo}
              onSeek={socket.seekVideo}
              onChangeVideo={socket.changeVideo}
              onSync={socket.requestSync}
              isFullscreen={isFullscreen}
              onVideoEnded={isHost ? socket.skipVideo : undefined}
            />
          </div>

          {/* Mobile View Controls */}
          <div className="lg:hidden flex items-center gap-1 px-3 py-2 border-b border-surface-800/50 overflow-x-auto scrollbar-hide">
            {(isHost ? (['chat', 'queue', 'suggestions', 'analytics'] as const) : (['chat'] as const)).map((panel) => (
              <button
                key={panel}
                onClick={() => {
                  setActivePanel(panel);
                  setShowMobilePanel(true);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                  activePanel === panel && showMobilePanel
                    ? 'bg-brand-500/20 text-brand-300'
                    : 'text-surface-400 hover:text-surface-300 hover:bg-surface-800/50'
                }`}
              >
                {panel.charAt(0).toUpperCase() + panel.slice(1)}
              </button>
            ))}
          </div>

          {/* Creator Info & Video Input */}
          <div className="flex-shrink-0 border-b border-surface-800/50">
            <CreatorInfo
              currentVideo={roomState.current_video_info}
            />
            {isHost && (
              <div className="px-3 py-2">
                <VideoInput
                  onAdd={async (url) => {
                    const videoId = extractYoutubeId(url);
                    if (!videoId) return;
                    // Auto-fetch video title, channel, thumbnail
                    try {
                      const res = await fetch(`/api/video-info?id=${videoId}`);
                      const info = await res.json();
                      socket.changeVideo({
                        youtube_video_id: videoId,
                        title: info.title || '',
                        channel_name: info.channel_name || '',
                        channel_avatar: info.channel_avatar || '',
                      });
                    } catch {
                      socket.changeVideo({ youtube_video_id: videoId });
                    }
                  }}
                  onQueueAdd={async (url) => {
                    const videoId = extractYoutubeId(url);
                    if (!videoId) return;
                    try {
                      const res = await fetch(`/api/video-info?id=${videoId}`);
                      const info = await res.json();
                      socket.addToQueue({
                        youtube_video_id: videoId,
                        title: info.title || '',
                        channel_name: info.channel_name || '',
                        channel_avatar: info.channel_avatar || '',
                        thumbnail_url: info.thumbnail_url || '',
                      });
                    } catch {
                      socket.addToQueue({ youtube_video_id: videoId });
                    }
                  }}
                />
              </div>
            )}
          </div>

          {/* Viewers list (compact) */}
          <div className="flex-shrink-0 flex items-center gap-1 px-3 py-2 border-b border-surface-800/50 overflow-x-auto scrollbar-hide">
            <FiUsers className="w-3 h-3 text-surface-500 flex-shrink-0" />
            <span className="text-xs text-surface-500 mr-1">Viewers:</span>
            {roomState.members.map((member, i) => (
              <div
                key={member.user_id}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-surface-800/50"
                title={member.profile?.name || 'Anonymous'}
              >
                {member.profile?.avatar ? (
                  <img src={member.profile.avatar} alt="" className="w-4 h-4 rounded-full" />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-surface-600" />
                )}
                <span className="text-xs text-surface-400 truncate max-w-[60px]">
                  {member.profile?.name || 'Anonymous'}
                </span>
                {member.role === 'host' && (
                  <span className="text-[10px] text-brand-400 font-medium">HOST</span>
                )}
              </div>
            ))}
          </div>

          {/* Session History (compact) */}
          {roomState.history.length > 0 && (
            <div className="flex-shrink-0 px-3 py-2 border-b border-surface-800/50">
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
                <span className="text-xs text-surface-500 flex-shrink-0">History:</span>
                {roomState.history.slice(0, 10).map((entry) => (
                  <span
                    key={entry.id}
                    className="text-xs text-surface-400 whitespace-nowrap px-2 py-0.5 rounded-full bg-surface-800/30"
                  >
                    {entry.title || entry.youtube_video_id}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Spacer to fill remaining space */}
          <div className="flex-1" />
        </div>

        {/* Right Panel (Desktop) */}
        <aside className="hidden lg:flex lg:w-80 xl:w-96 flex-col border-l border-surface-800/50 bg-surface-900/50">
          {/* Panel Tabs - viewers only see chat */}
          <div className="flex items-center border-b border-surface-800/50">
            {(isHost ? (['chat', 'queue', 'suggestions', 'analytics'] as const) : (['chat'] as const)).map((panel) => (
              <button
                key={panel}
                onClick={() => setActivePanel(panel)}
                className={`flex-1 px-3 py-2.5 text-xs font-medium transition-all ${
                  activePanel === panel
                    ? 'text-brand-300 bg-brand-500/10 border-b-2 border-brand-500'
                    : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800/30'
                }`}
              >
                {panel.charAt(0).toUpperCase() + panel.slice(1)}
              </button>
            ))}
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-hidden">
            {activePanel === 'chat' && (
              <ChatPanel
                messages={roomState.messages}
                mutedUsers={roomState.muted_users}
                currentUserId={user?.id || ''}
                isHost={!!isHost}
                onSend={socket.sendMessage}
                onDelete={socket.deleteMessage}
                onMute={socket.muteUser}
                onUnmute={socket.unmuteUser}
              />
            )}
            {activePanel === 'queue' && (
              <VideoQueue
                queue={roomState.queue}
                currentVideoId={roomState.playback?.youtube_video_id}
                isHost={!!isHost}
                onRemove={socket.removeFromQueue}
                onReorder={socket.reorderQueue}
                onSkip={socket.skipVideo}
                onPlayNow={socket.playNow}
                onClear={socket.clearQueue}
                onAddToQueue={socket.addToQueue}
              />
            )}
            {activePanel === 'suggestions' && (
              <SuggestionPanel
                suggestions={roomState.suggestions}
                isHost={!!isHost}
                onApprove={socket.approveSuggestion}
                onReject={socket.rejectSuggestion}
                onSubmit={socket.suggestVideo}
              />
            )}
            {activePanel === 'analytics' && (
              <AnalyticsPanel
                analytics={roomState.analytics}
                members={roomState.members}
                history={roomState.history}
              />
            )}
          </div>
        </aside>
      </main>

      {/* Mobile Panel Overlay */}
      <AnimatePresence>
        {showMobilePanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 lg:hidden"
          >
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowMobilePanel(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute bottom-0 left-0 right-0 h-[70vh] bg-surface-900 rounded-t-2xl border-t border-surface-700/50 overflow-hidden"
            >
              {/* Handle */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 rounded-full bg-surface-600" />
              </div>

              {/* Panel Header */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-surface-800/50">
                <span className="text-sm font-semibold capitalize">{activePanel}</span>
                <button
                  onClick={() => setShowMobilePanel(false)}
                  className="btn-ghost text-xs px-2 py-1"
                >
                  Close
                </button>
              </div>

              {/* Panel Content */}
              <div className="h-[calc(70vh-60px)]">
                {activePanel === 'chat' && (
                  <ChatPanel
                    messages={roomState.messages}
                    mutedUsers={roomState.muted_users}
                    currentUserId={user?.id || ''}
                    isHost={!!isHost}
                    onSend={socket.sendMessage}
                    onDelete={socket.deleteMessage}
                    onMute={socket.muteUser}
                    onUnmute={socket.unmuteUser}
                  />
                )}
                {activePanel === 'queue' && (
                  <VideoQueue
                    queue={roomState.queue}
                    currentVideoId={roomState.playback?.youtube_video_id}
                    isHost={!!isHost}
                    onRemove={socket.removeFromQueue}
                    onReorder={socket.reorderQueue}
                    onSkip={socket.skipVideo}
                    onPlayNow={socket.playNow}
                    onClear={socket.clearQueue}
                    onAddToQueue={socket.addToQueue}
                  />
                )}
                {activePanel === 'suggestions' && (
                  <SuggestionPanel
                    suggestions={roomState.suggestions}
                    isHost={!!isHost}
                    onApprove={socket.approveSuggestion}
                    onReject={socket.rejectSuggestion}
                    onSubmit={socket.suggestVideo}
                  />
                )}
                {activePanel === 'analytics' && (
                  <AnalyticsPanel
                    analytics={roomState.analytics}
                    members={roomState.members}
                    history={roomState.history}
                  />
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
